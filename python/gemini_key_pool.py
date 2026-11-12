"""Use a second Gemini API key on quota errors, keeping the requested model."""

import hashlib
import math
import re
import threading
import time

from google import genai
from google.genai import types


_LOCK = threading.Lock()
# Only fingerprints and expiry times are shared between requests, never raw keys.
_PREFERRED = {}
_COOLDOWNS = {}


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


def get_key_status(api_keys, model="gemini-3.8-flash"):
    """Return masked key status, not a remaining-quota estimate."""
    try:
        keys = _configured_keys(api_keys)
    except (TypeError, ValueError):
        keys = []
    signature = tuple(key_id for _, _, key_id in keys)
    now = time.monotonic()
    with _LOCK:
        preferred = _PREFERRED.get((signature, model))
        entries = []
        for slot, key, key_id in keys:
            remaining = max(0, math.ceil(_COOLDOWNS.get((key_id, model), 0) - now))
            entries.append({"slot": slot, "key_hint": f"...{key[-4:]}" if len(key) >= 4 else "****",
                            "retry_after_seconds": remaining, "state": "cooldown" if remaining else "ready"})
        active_slot = next((slot for slot, _, key_id in keys if key_id == preferred), None)
    return {"model": model, "active_slot": active_slot, "keys": entries}


class GeminiQuotaError(RuntimeError):
    """All configured credentials are limited or waiting for a quota retry."""

    code = 429
    status = "RESOURCE_EXHAUSTED"


class GeminiKeyClient:
    """Small SDK adapter: try each distinct key once, only on HTTP 429."""

    def __init__(self, api_keys, log=None, timeout_ms=120000):
        self._keys = _configured_keys(api_keys)
        if not self._keys:
            raise ValueError("Chưa có Gemini API Key. Vào Cài đặt để nhập key.")
        self._signature = tuple(key_id for _, _, key_id in self._keys)
        self._clients = {}
        self._log = log or (lambda message: None)
        self._timeout_ms = timeout_ms
        self.active_key = ""
        self.models = self

    def _invoke(self, method, **kwargs):
        model = kwargs.get("model", "")
        now = time.monotonic()
        with _LOCK:
            preferred = _PREFERRED.get((self._signature, model))
            available = [entry for entry in self._keys if _COOLDOWNS.get((entry[2], model), 0) <= now]
        available.sort(key=lambda entry: entry[2] != preferred)
        for slot, key, key_id in available:
            try:
                if key_id not in self._clients:
                    self._clients[key_id] = genai.Client(
                        api_key=key, http_options=types.HttpOptions(timeout=self._timeout_ms))
                response = getattr(self._clients[key_id].models, method)(**kwargs)
            except Exception as exc:
                # Invalid keys, denied access, timeouts and MAX_TOKENS are not quota failover.
                if getattr(exc, "code", None) != 429:
                    raise
                with _LOCK:
                    _COOLDOWNS[(key_id, model)] = time.monotonic() + _retry_delay(exc)
                self._log(f"[Gemini] Key {slot} chạm hạn mức của {model}; kiểm tra key dự phòng.")
                continue
            self.active_key = key
            with _LOCK:
                _PREFERRED[(self._signature, model)] = key_id
                _COOLDOWNS.pop((key_id, model), None)
            if preferred != key_id:
                self._log(f"[Gemini] Đang dùng Key {slot} cho {model}.")
            return response

        status = get_key_status([key for _, key, _ in self._keys], model)
        retry_after = min((entry["retry_after_seconds"] for entry in status["keys"]), default=60)
        raise GeminiQuotaError(
            f"Các API key đã cấu hình đều đang chạm hạn mức cho {model}. "
            f"Thử lại sau ít nhất {retry_after} giây hoặc xem quota trong AI Studio. "
            "Kết quả đã lưu được giữ nguyên."
        ) from None

    def generate_content(self, **kwargs):
        """Generate using the same model and payload when switching credentials."""
        return self._invoke("generate_content", **kwargs)

    def embed_content(self, **kwargs):
        """Apply the same quota failover to embedding calls."""
        return self._invoke("embed_content", **kwargs)
