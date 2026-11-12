"""Gemini Key 1 -> Gemini Key 2 -> optional OpenAI Key 3 for text generation."""

import hashlib
import json
import threading
import uuid
from types import SimpleNamespace

import httpx

from gemini_key_pool import GeminiKeyClient, GeminiProviderError, GeminiQuotaError, get_key_status, response_is_blocked


_LOCK = threading.Lock()
_OPENAI_RUNS = set()
_LAST_ROUTES = {}
DEFAULT_OPENAI_MODEL = 'gpt-6.1-sol'


class AllProvidersUnavailable(RuntimeError):
    """All enabled providers failed; the caller should pause with its data intact."""


class AIRefusalError(RuntimeError):
    """A provider refused content; do not route around the refusal."""


def _signature(keys, config):
    values = list(keys or [])[:2] + [str((config or {}).get('openai_api_key') or '')]
    return tuple(hashlib.sha256(str(key or '').encode()).hexdigest() if key else '' for key in values)


def get_ai_status(keys, config=None, model_priority=None):
    """Expose model/provider/slot, never credentials."""
    status = get_key_status(keys, model_priority=model_priority)
    with _LOCK:
        current = _LAST_ROUTES.get(_signature(keys, config))
    if current:
        status.update(current)
        if current.get('provider') == 'openai':
            status['all_limited'] = False
    status.setdefault('provider', 'gemini')
    return status


def _source_schema():
    strings = ['loai_source', 'element', 'anim', 'bgm', 'sfx', 'thoi_ky', 'cau_thu',
               'doi_bong', 'thoi_diem', 'su_kien', 'si', 'reason']
    properties = {name: {'type': 'string'} for name in strings}
    properties.update(row_index={'type': 'integer'}, confidence={'type': 'number'}, needs_review={'type': 'boolean'})
    row = {'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}
    return {'type': 'object', 'properties': {'rows': {'type': 'array', 'items': row}},
            'required': ['rows'], 'additionalProperties': False}


def _messages(contents):
    if isinstance(contents, str):
        return contents
    result = []
    for item in contents or []:
        if isinstance(item, str):
            result.append({'role': 'user', 'content': item})
        elif isinstance(item, dict):
            text = '\n'.join(str(part.get('text', '')) for part in item.get('parts', []) if isinstance(part, dict))
            result.append({'role': 'assistant' if item.get('role') == 'model' else 'user', 'content': text})
        else:
            raise ValueError('Chỉ hỗ trợ nội dung văn bản cho dự phòng OpenAI.')
    return result


def _usage_response(data, text=''):
    usage = data.get('usage') or {}
    total_output = int(usage.get('output_tokens') or 0)
    reasoning = int((usage.get('output_tokens_details') or {}).get('reasoning_tokens') or 0)
    metadata = None
    if usage:
        metadata = SimpleNamespace(prompt_token_count=int(usage.get('input_tokens') or 0),
                                   candidates_token_count=max(0, total_output - reasoning),
                                   thoughts_token_count=reasoning,
                                   total_token_count=int(usage.get('total_tokens') or 0))
    return SimpleNamespace(text=text, candidates=[], usage_metadata=metadata)


class OpenAIResponsesClient:
    """Small Responses API adapter using the existing httpx dependency."""

    def __init__(self, api_key, model=DEFAULT_OPENAI_MODEL, kind='timeline', post=None):
        self._key = api_key
        self.model = model or DEFAULT_OPENAI_MODEL
        self.kind = kind
        self._post = post

    def generate_content(self, contents, config=None):
        """Return text plus usage compatible with the existing validators/tracker."""
        maximum = config.get('max_output_tokens', 16384) if isinstance(config, dict) else getattr(config, 'max_output_tokens', 16384)
        payload = {'model': self.model, 'input': _messages(contents), 'max_output_tokens': maximum or 16384,
                   'store': False}
        if self.model.startswith(('gpt-5', 'gpt-6', 'o1', 'o3', 'o4')):
            payload['reasoning'] = {'effort': 'medium'}
        if self.kind == 'source_plan':
            payload['instructions'] = 'Return JSON with the single field rows containing the requested row array. Preserve each row_index. Follow all supplied classification rules and context.'
            payload['text'] = {'format': {'type': 'json_schema', 'name': 'source_plan', 'strict': True, 'schema': _source_schema()}}
        else:
            payload['instructions'] = 'Return only a valid JSON object for the requested After Effects timeline.'
            payload['text'] = {'format': {'type': 'json_object'}}
        try:
            response = (self._post or httpx.post)(
                'https://api.openai.com/v1/responses', json=payload,
                headers={'Authorization': f'Bearer {self._key}', 'Content-Type': 'application/json'},
                timeout=httpx.Timeout(120, connect=20), follow_redirects=False)
        except httpx.TransportError as exc:
            raise RuntimeError(f'OpenAI Key 3 lỗi kết nối hoặc quá thời gian chờ ({type(exc).__name__}).') from None
        if response.status_code >= 400:
            # Provider messages may echo part of an API key; never put them in UI/logs.
            raise RuntimeError(f'OpenAI Key 3 trả HTTP {response.status_code}; kiểm tra key, model và hạn mức API.')
        try:
            data = response.json()
        except ValueError:
            raise RuntimeError('OpenAI trả phản hồi không phải JSON.') from None
        parts = [part for item in data.get('output', []) if item.get('type') == 'message'
                 for part in item.get('content', [])]
        if any(part.get('type') == 'refusal' for part in parts):
            raise AIRefusalError('OpenAI từ chối trả kết quả; cần kiểm tra nội dung trước khi chạy tiếp.')
        if data.get('status') != 'completed':
            raise RuntimeError('OpenAI chưa hoàn tất phản hồi; giữ kết quả đã lưu và kiểm tra giới hạn đầu ra.')
        text = ''.join(part.get('text', '') for part in parts if part.get('type') == 'output_text')
        if not text.strip():
            raise RuntimeError('OpenAI trả kết quả trống.')
        if self.kind == 'source_plan':
            try:
                rows = json.loads(text)['rows']
                if not isinstance(rows, list):
                    raise ValueError('rows is not a list')
                text = json.dumps(rows, ensure_ascii=False)
            except (ValueError, KeyError, TypeError):
                raise RuntimeError('OpenAI trả cấu trúc phân loại không hợp lệ.') from None
        return _usage_response(data, text)


class AIProviderRouter:
    """Try Gemini credentials first; keep successful OpenAI for this run."""

    def __init__(self, keys, config=None, model_priority=None, log=None, run_id=None, kind='timeline'):
        self.keys, self.config = list(keys or [])[:2], config or {}
        self.run_id = run_id or uuid.uuid4().hex
        self._log = log or (lambda message: None)
        self._openai_key = str(self.config.get('openai_api_key') or '').strip()
        self._openai_model = self.config.get('openai_model') or DEFAULT_OPENAI_MODEL
        self._gemini = GeminiKeyClient(self.keys, model_priority=model_priority, log=self._log,
                                      timeout_ms=60000, server_failover=True) if any(self.keys) else None
        self._embedding = None
        self._openai = OpenAIResponsesClient(self._openai_key, self._openai_model, kind) if self._openai_key else None
        if self.config.get('prefer_openai') and self._openai:
            with _LOCK:
                _OPENAI_RUNS.add(self.run_id)
        self.active_key = self.active_model = self.active_provider = ''
        self.models = self
        if not self._gemini and not self._openai:
            raise AllProvidersUnavailable('Chưa có key đã lưu được bật Sử dụng. Vào Cài đặt để chọn key.')

    def _accepted(self, response, provider, key, model):
        self.active_provider, self.active_key, self.active_model = provider, key, model
        slot = 3 if provider == 'openai' else (1 if self.keys and key == self.keys[0] else 2)
        with _LOCK:
            _LAST_ROUTES[_signature(self.keys, self.config)] = {'provider': provider, 'active_slot': slot, 'model': model}
            if provider == 'openai':
                _OPENAI_RUNS.add(self.run_id)
            else:
                _OPENAI_RUNS.discard(self.run_id)
        return response

    def _use_openai(self, contents, config):
        self._log(f'[OpenAI] Đang dùng {self._openai_model} · Key 3 để tiếp tục lượt phân tích.')
        response = self._openai.generate_content(contents, config)
        return self._accepted(response, 'openai', self._openai_key, self._openai_model)

    def generate_content(self, model, contents, config=None):
        """Return the first working enabled provider, or a resumable failure."""
        errors, tried_openai = [], False
        with _LOCK:
            prefer_openai = self.run_id in _OPENAI_RUNS
        if prefer_openai and self._openai:
            tried_openai = True
            try:
                return self._use_openai(contents, config)
            except AIRefusalError:
                raise
            except Exception as exc:
                errors.append(str(exc))
        if self._gemini:
            try:
                response = self._gemini.generate_content(model=model, contents=contents, config=config)
                if response_is_blocked(response):
                    raise AIRefusalError('Gemini từ chối trả kết quả; cần kiểm tra nội dung trước khi chạy tiếp.')
                return self._accepted(response, 'gemini', self._gemini.active_key, self._gemini.active_model)
            except AIRefusalError:
                raise
            except Exception as exc:
                errors.append('Các model Gemini đang chạm hạn mức.' if isinstance(exc, GeminiQuotaError) else
                              'Gemini chưa phục vụ được; kiểm tra key, model hoặc kết nối máy chủ.')
                self._log('[AI] Các lựa chọn Gemini được bật chưa thể tiếp tục; chuyển sang OpenAI Key 3.'
                          if self._openai and not tried_openai else '[AI] Các lựa chọn Gemini được bật chưa thể tiếp tục.')
        if self._openai and not tried_openai:
            try:
                return self._use_openai(contents, config)
            except AIRefusalError:
                raise
            except Exception as exc:
                errors.append(str(exc))
        raise AllProvidersUnavailable('Mọi key được bật đều chưa thể xử lý. Đã tạm dừng, giữ kết quả. ' + ' '.join(errors)) from None

    def embed_content(self, **kwargs):
        """Keep Gemini embeddings separate; callers can use lexical examples."""
        with _LOCK:
            prefer_openai = self.run_id in _OPENAI_RUNS
        if not self._gemini or prefer_openai:
            raise GeminiProviderError('Không dùng Gemini embedding trong lượt OpenAI; dùng đối chiếu ví dụ bằng từ khóa.')
        # Optional retrieval must not delay text fallback or mark the text
        # service unavailable when only its embedding endpoint is failing.
        if self._embedding is None:
            self._embedding = GeminiKeyClient(self.keys, log=self._log, timeout_ms=10000)
        return self._embedding.embed_content(**kwargs)
