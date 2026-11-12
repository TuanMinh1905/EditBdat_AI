"""Try Gemini models in priority order, trying both keys before the next model."""

import hashlib
import math
import re
import threading
import time

import httpx
from google import genai
from google.genai import types


_LOCK = threading.Lock()
# Only fingerprints and expiry times are shared between requests, never raw keys.
_PREFERRED = {}
_COOLDOWNS = {}
_ROUTES = {}
_UNAVAILABLE = {}
DEFAULT_MODEL_PRIORITY = ["gemini-4-carbon", "gemini-4-argon", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]


def normalize_model_priority(models, default_model="gemini-3.8-flash"):
    """Normalize an editable model order without guessing account availability."""
    if isinstance(models, str):
        models = re.split(r"[\s,;]+", models)
    if not models:
        models = [default_model]
    if not isinstance(models, (list, tuple)):
        raise ValueError("Danh sách model Gemini không hợp lệ.")
    result = []
    for value in models:
        name = str(value or "").strip().removeprefix("models/")
        if not name:
            continue
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}", name):
            raise ValueError("Tên model không hợp lệ; dùng mã model API, mỗi dòng một model.")
        if name not in result:
            result.append(name)
    if len(result) > 8:
        raise ValueError("Chỉ cấu hình tối đa 8 model ưu tiên.")
    return result or [default_model]


def _model_config(config, model):
    # Gemini 3+ uses its default thinking instead of a Gemini 2.5 token budget.
    if config is None or not re.match(r"gemini-[3-9](?:[.-]|$)", model):
        return config
    if isinstance(config, dict):
        data = dict(config)
    elif hasattr(config, "model_dump"):
        data = config.model_dump(exclude_none=True)
    else:
        return config
    for field in ("thinking_config", "temperature", "top_p", "top_k"):
        data.pop(field, None)
    return types.GenerateContentConfig(**data)


def _configured_keys(api_keys):
    if isinstance(api_keys, str):
        api_keys = [api_keys]
    if api_keys is not None and not isinstance(api_keys, (list, tuple)):
        raise ValueError("Danh sách Gemini API key không hợp lệ.")
    seen, keys = set(), []
    for slot, value in enumerate((api_keys or [])[:2], 1):
        key = str(value or "").strip()
        if key and key not in seen:
            seen.add(key)
            keys.append((slot, key, hashlib.sha256(key.encode("utf-8")).hexdigest()))
    return keys


def _retry_delay(exc):
    """Honor structured RetryInfo/Retry-After; otherwise wait at least a minute."""
    delay = 60.0
    details = getattr(exc, "details", {})
    if isinstance(details, dict):
        details = details.get("error", details).get("details", [])
    for detail in details if isinstance(details, list) else []:
        if not isinstance(detail, dict) or not detail.get("@type", "").endswith("RetryInfo"):
            continue
        value = detail.get("retryDelay", "")
        if isinstance(value, dict):
            try:
                delay = max(delay, float(value.get("seconds", 0)) + float(value.get("nanos", 0)) / 1e9)
            except (TypeError, ValueError):
                pass
        else:
            match = re.fullmatch(r"(\d+(?:\.\d+)?)s", str(value))
            if match:
                delay = max(delay, float(match[1]))
    response = getattr(exc, "response", None)
    if response is not None:
        try:
            delay = max(delay, float(response.headers.get("retry-after", 0)))
        except (AttributeError, TypeError, ValueError):
            pass
    return delay if math.isfinite(delay) else 60.0


def get_key_status(api_keys, model="gemini-3.8-flash", model_priority=None):
    """Return masked key status, not a remaining-quota estimate."""
    try:
        keys = _configured_keys(api_keys)
    except (TypeError, ValueError):
        keys = []
    signature = tuple(key_id for _, _, key_id in keys)
    try:
        chain = normalize_model_priority(model_priority, model)
    except ValueError:
        chain = [model]
    now = time.monotonic()
    with _LOCK:
        route = _ROUTES.get((signature, tuple(chain)))
        model = route[0] if route else chain[0]
        preferred = _PREFERRED.get((signature, model))
        candidates = [(key_id, name) for name in chain for _, _, key_id in keys]
        quota_delays = [max(0, math.ceil(_COOLDOWNS.get(pair, 0) - now))
                        for pair in candidates if _UNAVAILABLE.get(pair, 0) <= now]
        entries = []
        for slot, key, key_id in keys:
            remaining = max(0, math.ceil(_COOLDOWNS.get((key_id, model), 0) - now))
            state = "unavailable" if _UNAVAILABLE.get((key_id, model), 0) > now else "cooldown" if remaining else "ready"
            entries.append({"slot": slot, "key_hint": f"...{key[-4:]}" if len(key) >= 4 else "****",
                            "retry_after_seconds": remaining, "state": state})
        active_slot = next((slot for slot, _, key_id in keys if key_id == preferred), None)
    waiting = bool(quota_delays) and all(delay > 0 for delay in quota_delays)
    return {"model": model, "active_slot": active_slot, "keys": entries,
            "model_priority": chain, "all_limited": waiting,
            "retry_after_seconds": min(quota_delays) if waiting else 0}


class GeminiQuotaError(RuntimeError):
    """All configured credentials are limited or waiting for a quota retry."""

    code = 429
    status = "RESOURCE_EXHAUSTED"

    def __init__(self, message, retry_after_seconds=60):
        super().__init__(message)
        self.retry_after_seconds = max(1, retry_after_seconds)


CONNECT_TIMEOUT_SECONDS = 20


class _FastConnectTransport(httpx.HTTPTransport):
    """Giới hạn riêng thời gian kết nối/bắt tay TLS; read timeout giữ nguyên."""

    def handle_request(self, request):
        timeout = request.extensions.get("timeout")
        if isinstance(timeout, dict):
            current = timeout.get("connect")
            timeout["connect"] = CONNECT_TIMEOUT_SECONDS if current is None else min(current, CONNECT_TIMEOUT_SECONDS)
        return super().handle_request(request)


class GeminiKeyClient:
    """Try models in priority order; each model tries both distinct keys."""

    def __init__(self, api_keys, log=None, timeout_ms=120000, model_priority=None):
        self._keys = _configured_keys(api_keys)
        if not self._keys:
            raise ValueError("Chưa có Gemini API Key. Vào Cài đặt để nhập key.")
        self._signature = tuple(key_id for _, _, key_id in self._keys)
        self._clients = {}
        self._log = log or (lambda message: None)
        self._timeout_ms = timeout_ms
        self.active_key = ""
        self.active_model = ""
        self._model_priority = model_priority
        self.models = self

    def _invoke(self, method, **kwargs):
        requested = kwargs.get("model", "")
        chain = normalize_model_priority(self._model_priority, requested) if method == "generate_content" else [requested]
        attempted = False
        with _LOCK:
            last_announced = _ROUTES.get((self._signature, tuple(chain)))
        for model in chain:
            now = time.monotonic()
            with _LOCK:
                available = [entry for entry in self._keys if _COOLDOWNS.get((entry[2], model), 0) <= now
                             and _UNAVAILABLE.get((entry[2], model), 0) <= now]
            for slot, key, key_id in available:
                attempted = True
                if last_announced != (model, key_id):
                    self._log(f"[Gemini] Đang chuyển sang {model} · Key {slot}.")
                    last_announced = (model, key_id)
                payload = {**kwargs, "model": model}
                if "config" in payload:
                    payload["config"] = _model_config(payload["config"], model)
                try:
                    if key_id not in self._clients:
                        self._clients[key_id] = genai.Client(
                            api_key=key, http_options=types.HttpOptions(
                                timeout=self._timeout_ms,
                                client_args={"transport": _FastConnectTransport()}))
                    response = getattr(self._clients[key_id].models, method)(**payload)
                except Exception as exc:
                    if len(chain) > 1 and getattr(exc, "code", None) in (403, 404):
                        with _LOCK:
                            _UNAVAILABLE[(key_id, model)] = time.monotonic() + 900
                        self._log(f"[Gemini] {model} · Key {slot} không khả dụng/không có quyền; chuyển lựa chọn tiếp theo.")
                        continue
                    if getattr(exc, "code", None) != 429:
                        raise
                    with _LOCK:
                        _COOLDOWNS[(key_id, model)] = time.monotonic() + _retry_delay(exc)
                    self._log(f"[Gemini] {model} · Key {slot} chạm hạn mức; chuyển lựa chọn tiếp theo.")
                    continue
                self.active_key, self.active_model = key, model
                with _LOCK:
                    _PREFERRED[(self._signature, model)] = key_id
                    _ROUTES[(self._signature, tuple(chain))] = (model, key_id)
                    _COOLDOWNS.pop((key_id, model), None)
                return response

        status = get_key_status([key for _, key, _ in self._keys], model_priority=chain)
        retry_after = status["retry_after_seconds"] or 60
        if not status["all_limited"]:
            raise RuntimeError("Không model/key nào trong danh sách có quyền sử dụng. Kiểm tra mã model và quyền API trong AI Studio.")
        if attempted:
            self._log(f"[Gemini] Tất cả model/key chạm hạn mức; chờ ít nhất {retry_after} giây để tự chạy tiếp.")
        raise GeminiQuotaError(
            f"Các model/key đã cấu hình đều đang chạm hạn mức. Tự thử lại sau ít nhất {retry_after} giây.",
            retry_after_seconds=retry_after
        ) from None

    def generate_content(self, **kwargs):
        """Try each model's credentials before proceeding to the next model."""
        return self._invoke("generate_content", **kwargs)

    def embed_content(self, **kwargs):
        """Apply the same quota failover to embedding calls."""
        return self._invoke("embed_content", **kwargs)
