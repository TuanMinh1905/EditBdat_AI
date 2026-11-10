"""
Token Tracker — Theo dõi và lưu trữ số lượng Token Gemini API đã sử dụng trong App.
Lưu theo từng API Key (dùng SHA-256 hash, không lưu key thật) vào output/token_usage.json.
"""

import os
import json
import hashlib
import threading
from datetime import datetime


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_USAGE_PATH = os.path.join(BASE_DIR, "output", "token_usage.json")

_LOCK = threading.Lock()


def _empty_counters():
    """Trả về dict bộ đếm rỗng."""
    return {
        "prompt_tokens": 0,
        "output_tokens": 0,
        "thoughts_tokens": 0,
        "total_tokens": 0,
        "requests": 0,
    }


def _key_fingerprint(api_key):
    """Tạo key_id (hash) và key_hint (...xxxx) từ API key mà không lộ key gốc."""
    k = (api_key or "").strip()
    if not k:
        return "", ""
    digest = hashlib.sha256(k.encode("utf-8")).hexdigest()[:16]
    hint = f"...{k[-4:]}" if len(k) >= 4 else "****"
    return digest, hint


def extract_usage_metadata(response):
    """Trích xuất token counts từ Gemini response.usage_metadata."""
    if response is None:
        return None
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return None

    prompt_tokens = int(getattr(meta, "prompt_token_count", 0) or 0)
    output_tokens = int(getattr(meta, "candidates_token_count", 0) or 0)
    thoughts_tokens = int(getattr(meta, "thoughts_token_count", 0) or 0)
    total_tokens = int(getattr(meta, "total_token_count", 0) or 0)

    if total_tokens == 0 and (prompt_tokens or output_tokens or thoughts_tokens):
        total_tokens = prompt_tokens + output_tokens + thoughts_tokens

    return {
        "prompt_tokens": prompt_tokens,
        "output_tokens": output_tokens,
        "thoughts_tokens": thoughts_tokens,
        "total_tokens": total_tokens,
    }


def _load_store(usage_path=DEFAULT_USAGE_PATH):
    """Đọc file JSON lưu thống kê token."""
    if not os.path.exists(usage_path):
        return {"keys": {}}
    try:
        with open(usage_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("keys"), dict):
            return data
    except Exception:
        pass
    return {"keys": {}}


def _save_store(data, usage_path=DEFAULT_USAGE_PATH):
    """Ghi file JSON lưu thống kê token."""
    os.makedirs(os.path.dirname(usage_path), exist_ok=True)
    with open(usage_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _add_counts(target, usage):
    """Cộng dồn số token và tăng 1 request vào target dict."""
    target["prompt_tokens"] = target.get("prompt_tokens", 0) + usage["prompt_tokens"]
    target["output_tokens"] = target.get("output_tokens", 0) + usage["output_tokens"]
    target["thoughts_tokens"] = target.get("thoughts_tokens", 0) + usage["thoughts_tokens"]
    target["total_tokens"] = target.get("total_tokens", 0) + usage["total_tokens"]
    target["requests"] = target.get("requests", 0) + 1


def record_usage(api_key, response, feature="unknown", model="", usage_path=DEFAULT_USAGE_PATH):
    """Ghi nhận token từ một lần gọi Gemini API cho API key tương ứng."""
    usage = extract_usage_metadata(response)
    if not usage:
        return None

    key_id, key_hint = _key_fingerprint(api_key)
    if not key_id:
        return None

    today_str = datetime.now().strftime("%Y-%m-%d")
    now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with _LOCK:
        store = _load_store(usage_path)
        keys = store.setdefault("keys", {})
        entry = keys.setdefault(
            key_id,
            {
                "key_hint": key_hint,
                "total": _empty_counters(),
                "daily": {},
                "by_feature": {},
                "last_call": None,
            },
        )
        entry["key_hint"] = key_hint

        _add_counts(entry.setdefault("total", _empty_counters()), usage)

        daily = entry.setdefault("daily", {})
        day_bucket = daily.setdefault(today_str, _empty_counters())
        _add_counts(day_bucket, usage)

        by_feat = entry.setdefault("by_feature", {})
        feat_bucket = by_feat.setdefault(feature, _empty_counters())
        _add_counts(feat_bucket, usage)

        entry["last_call"] = {
            "timestamp": now_iso,
            "model": model or "",
            "feature": feature,
            "prompt_tokens": usage["prompt_tokens"],
            "output_tokens": usage["output_tokens"],
            "thoughts_tokens": usage["thoughts_tokens"],
            "total_tokens": usage["total_tokens"],
        }

        _save_store(store, usage_path)

    return usage


def get_usage(api_key="", usage_path=DEFAULT_USAGE_PATH):
    """Lấy thống kê token cho API key hiện tại (và tổng hợp toàn app)."""
    key_id, key_hint = _key_fingerprint(api_key)
    today_str = datetime.now().strftime("%Y-%m-%d")

    with _LOCK:
        store = _load_store(usage_path)

    keys = store.get("keys", {})
    all_total_tokens = sum(
        (v.get("total", {}).get("total_tokens", 0) for v in keys.values())
    )
    all_requests = sum(
        (v.get("total", {}).get("requests", 0) for v in keys.values())
    )

    if not key_id:
        return {
            "has_key": False,
            "key_hint": "",
            "total": _empty_counters(),
            "today": {"date": today_str, **_empty_counters()},
            "by_feature": {},
            "last_call": None,
            "all_keys_total_tokens": all_total_tokens,
            "all_keys_requests": all_requests,
        }

    entry = keys.get(key_id)
    if not entry:
        return {
            "has_key": True,
            "key_hint": key_hint,
            "total": _empty_counters(),
            "today": {"date": today_str, **_empty_counters()},
            "by_feature": {},
            "last_call": None,
            "all_keys_total_tokens": all_total_tokens,
            "all_keys_requests": all_requests,
        }

    today_bucket = entry.get("daily", {}).get(today_str, _empty_counters())
    return {
        "has_key": True,
        "key_hint": entry.get("key_hint", key_hint),
        "total": entry.get("total", _empty_counters()),
        "today": {"date": today_str, **today_bucket},
        "by_feature": entry.get("by_feature", {}),
        "last_call": entry.get("last_call"),
        "all_keys_total_tokens": all_total_tokens,
        "all_keys_requests": all_requests,
    }


def reset_usage(api_key="", usage_path=DEFAULT_USAGE_PATH):
    """Xóa thống kê token cho API key hiện tại (hoặc tất cả nếu api_key rỗng)."""
    key_id, _ = _key_fingerprint(api_key)

    with _LOCK:
        store = _load_store(usage_path)
        keys = store.setdefault("keys", {})
        if key_id:
            keys.pop(key_id, None)
        else:
            store["keys"] = {}
        _save_store(store, usage_path)

    return get_usage(api_key, usage_path)

