"""Quota failover tests: no network requests or real credentials."""

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from google.genai import errors

import gemini_key_pool as module
import gemini_client


def api_error(code=429, details=None):
    return errors.APIError(code, {"error": {"code": code, "status": "RESOURCE_EXHAUSTED" if code == 429 else "ERROR",
                                           "message": "test error", "details": details or []}})


class KeyPoolTests(unittest.TestCase):
    def setUp(self):
        module._PREFERRED.clear()
        module._COOLDOWNS.clear()
        module._ROUTES.clear()
        module._UNAVAILABLE.clear()
        self.addCleanup(module._PREFERRED.clear)
        self.addCleanup(module._COOLDOWNS.clear)
        self.addCleanup(module._ROUTES.clear)
        self.addCleanup(module._UNAVAILABLE.clear)
        self.keys = ["test-primary-one", "test-backup-two"]
        self.models = {key: Mock() for key in self.keys}
        self.factory = patch.object(module.genai, "Client", side_effect=lambda api_key, **kw:
                                    SimpleNamespace(models=self.models[api_key])).start()
        self.addCleanup(patch.stopall)
        self.logs = []

    def test_quota_switch_retries_same_payload_and_remembers_backup(self):
        self.models[self.keys[0]].generate_content.side_effect = api_error()
        expected = object()
        self.models[self.keys[1]].generate_content.return_value = expected
        payload = dict(model="same-model", contents="same prompt", config={"temperature": 0.1})
        client = module.GeminiKeyClient(self.keys, log=self.logs.append)
        self.assertIs(client.models.generate_content(**payload), expected)
        self.assertEqual(client.active_key, self.keys[1])
        for model in self.models.values():
            self.assertEqual(model.generate_content.call_args.kwargs, payload)
        next_request = module.GeminiKeyClient(self.keys)
        next_request.models.generate_content(**payload)
        self.assertEqual(self.models[self.keys[0]].generate_content.call_count, 1)
        self.assertEqual(module.get_key_status(self.keys, "same-model")["active_slot"], 2)
        self.assertTrue(all(key not in str(self.logs) for key in self.keys))

    def test_all_keys_limited_stops_and_respects_retry_info(self):
        retry = [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "300s"}]
        for model in self.models.values():
            model.generate_content.side_effect = api_error(details=retry)
        with patch.object(module.time, "monotonic", return_value=100):
            client = module.GeminiKeyClient(self.keys)
            with self.assertRaises(module.GeminiQuotaError) as caught:
                client.models.generate_content(model="same-model", contents="prompt")
            self.assertTrue(all(key not in str(caught.exception) for key in self.keys))
            status = module.get_key_status(self.keys, "same-model")
            self.assertTrue(all(key["retry_after_seconds"] == 300 for key in status["keys"]))
            with self.assertRaises(module.GeminiQuotaError):
                module.GeminiKeyClient(self.keys).models.generate_content(model="same-model", contents="prompt")
        self.assertEqual(sum(model.generate_content.call_count for model in self.models.values()), 2)

    def test_other_errors_do_not_consume_backup_key(self):
        for exc in [api_error(400), api_error(403), api_error(404), api_error(503), TimeoutError("network timeout")]:
            with self.subTest(error=type(exc).__name__):
                self.models[self.keys[0]].generate_content.side_effect = exc
                with self.assertRaises(type(exc)):
                    module.GeminiKeyClient(self.keys).models.generate_content(model="same-model", contents="prompt")
        self.models[self.keys[1]].generate_content.assert_not_called()

    def test_max_output_tokens_is_not_quota_exhaustion(self):
        response = SimpleNamespace(text="partial output", finish_reason="MAX_TOKENS")
        self.models[self.keys[0]].generate_content.return_value = response
        self.assertIs(module.GeminiKeyClient(self.keys).models.generate_content(model="same-model"), response)
        self.models[self.keys[1]].generate_content.assert_not_called()

    def test_deduplicates_keys_and_supports_backup_only_with_slot_two(self):
        self.models[self.keys[0]].generate_content.side_effect = api_error()
        with self.assertRaises(module.GeminiQuotaError):
            module.GeminiKeyClient([self.keys[0], "  " + self.keys[0] + "  "]).models.generate_content(model="a")
        self.assertEqual(self.models[self.keys[0]].generate_content.call_count, 1)
        client = module.GeminiKeyClient(["", self.keys[1]])
        client.models.generate_content(model="a")
        self.assertEqual(module.get_key_status(["", self.keys[1]], "a")["active_slot"], 2)

    def test_cooldowns_are_per_model_and_embedding_can_switch_keys(self):
        self.models[self.keys[0]].generate_content.side_effect = api_error()
        module.GeminiKeyClient(self.keys).models.generate_content(model="limited-model")
        self.models[self.keys[0]].generate_content.side_effect = None
        client = module.GeminiKeyClient(self.keys)
        client.models.generate_content(model="other-model")
        self.assertEqual(client.active_key, self.keys[0])
        self.models[self.keys[0]].embed_content.side_effect = api_error()
        client.models.embed_content(model="embedding-model", contents=["text"])
        self.assertEqual(client.active_key, self.keys[1])

    def test_expired_cooldown_allows_primary_when_backup_is_limited(self):
        with patch.object(module.time, "monotonic", return_value=100):
            self.models[self.keys[0]].generate_content.side_effect = api_error()
            module.GeminiKeyClient(self.keys).models.generate_content(model="same-model")
        with patch.object(module.time, "monotonic", return_value=200):
            self.models[self.keys[0]].generate_content.side_effect = None
            self.models[self.keys[1]].generate_content.side_effect = api_error()
            client = module.GeminiKeyClient(self.keys)
            client.models.generate_content(model="same-model")
            self.assertEqual(client.active_key, self.keys[0])

    def test_timeline_generation_and_fix_track_the_key_that_returned_usage(self):
        self.models[self.keys[0]].generate_content.side_effect = api_error()
        self.models[self.keys[1]].generate_content.return_value = SimpleNamespace(text='{"layers":[]}')
        usage = patch.object(gemini_client, "record_usage").start()
        client = gemini_client.GeminiClient(self.keys[0], api_keys=self.keys)
        self.assertEqual(client.generate_timeline([], "test")["layers"], [])
        client.fix_timeline({"layers": []}, [])
        self.assertEqual([call.args[0] for call in usage.call_args_list], [self.keys[1], self.keys[1]])

    def test_model_first_key_second_order_and_no_repeating_limited_pairs(self):
        order = ["model-a", "model-b", "model-c", "model-d"]
        calls = []
        def generate(key, **payload):
            calls.append((payload['model'], key))
            if (payload['model'], key) != ('model-d', self.keys[1]):
                raise api_error()
            return SimpleNamespace(text='done')
        for key, model in self.models.items():
            model.generate_content.side_effect = lambda _key=key, **kw: generate(_key, **kw)
        client = module.GeminiKeyClient(self.keys, model_priority=order)
        client.models.generate_content(model='old-default', contents='same prompt')
        self.assertEqual(calls, [(name, key) for name in order for key in self.keys])
        self.assertEqual(client.active_model, 'model-d')
        module.GeminiKeyClient(self.keys, model_priority=order).models.generate_content(model='old-default')
        self.assertEqual(calls[-1], ('model-d', self.keys[1]))
        self.assertEqual(len(calls), 9)

    def test_higher_priority_recovers_before_lower_model_when_quota_resets(self):
        calls = []
        def generate(key, **payload):
            calls.append((payload['model'], key))
            if payload['model'] == 'model-a' and module.time.monotonic() == 100:
                raise api_error()
            return SimpleNamespace(text='done')
        for key, model in self.models.items():
            model.generate_content.side_effect = lambda _key=key, **kw: generate(_key, **kw)
        with patch.object(module.time, 'monotonic', return_value=100):
            module.GeminiKeyClient(self.keys, model_priority=['model-a', 'model-b']).models.generate_content(model='old')
        with patch.object(module.time, 'monotonic', return_value=200):
            client = module.GeminiKeyClient(self.keys, model_priority=['model-a', 'model-b'])
            client.models.generate_content(model='old')
            self.assertEqual(client.active_model, 'model-a')
            self.assertEqual(client.active_key, self.keys[0])

    def test_model_access_errors_are_skipped_with_notice_in_multimodel_mode(self):
        self.models[self.keys[0]].generate_content.side_effect = [api_error(404), api_error()]
        self.models[self.keys[1]].generate_content.side_effect = [api_error(403), SimpleNamespace(text='done')]
        client = module.GeminiKeyClient(self.keys, model_priority=['model-a', 'model-b'], log=self.logs.append)
        client.models.generate_content(model='old')
        self.assertEqual((client.active_model, client.active_key), ('model-b', self.keys[1]))
        self.assertTrue(any('không khả dụng' in line for line in self.logs))

    def test_embedding_does_not_use_text_generation_model_priority(self):
        client = module.GeminiKeyClient(self.keys, model_priority=['model-a', 'model-b'])
        client.models.embed_content(model='embedding-model', contents=['text'])
        self.assertEqual(self.models[self.keys[0]].embed_content.call_args.kwargs['model'], 'embedding-model')

    def test_gemini_three_plus_config_retains_json_without_legacy_thinking_budget(self):
        original = module.types.GenerateContentConfig(temperature=.1, max_output_tokens=16384,
                    thinking_config=module.types.ThinkingConfig(thinking_budget=4096), response_mime_type='application/json')
        client = module.GeminiKeyClient(self.keys, model_priority=['gemini-4-carbon'])
        client.models.generate_content(model='old', config=original, contents='prompt')
        config = self.models[self.keys[0]].generate_content.call_args.kwargs['config']
        self.assertIsNone(config.thinking_config)
        self.assertIsNone(config.temperature)
        self.assertEqual(config.response_mime_type, 'application/json')
        self.assertEqual(original.thinking_config.thinking_budget, 4096)

    def test_legacy_flash_fallback_retains_its_supported_thinking_config(self):
        original = module.types.GenerateContentConfig(max_output_tokens=16384,
                    thinking_config=module.types.ThinkingConfig(thinking_budget=4096), response_mime_type='application/json')
        def generate(**payload):
            if payload['model'] != 'gemini-2.5-flash':
                raise api_error()
            return SimpleNamespace(text='done')
        for model in self.models.values():
            model.generate_content.side_effect = generate
        client = module.GeminiKeyClient(self.keys, model_priority=['gemini-3.8-flash', 'gemini-2.5-flash'])
        client.models.generate_content(model='old', config=original, contents='prompt')
        self.assertEqual(client.active_model, 'gemini-2.5-flash')
        config = self.models[self.keys[0]].generate_content.call_args.kwargs['config']
        self.assertEqual(config.thinking_config.thinking_budget, 4096)

    def test_usage_reports_actual_fallback_model(self):
        def generate(**payload):
            if payload['model'] == 'model-a':
                raise api_error()
            return SimpleNamespace(text='{"layers":[]}')
        for model in self.models.values():
            model.generate_content.side_effect = generate
        usage = patch.object(gemini_client, 'record_usage').start()
        client = gemini_client.GeminiClient(self.keys[0], api_keys=self.keys, model_priority=['model-a', 'model-b'])
        client.generate_timeline([], 'test')
        self.assertEqual(usage.call_args.kwargs['model'], 'model-b')


if __name__ == "__main__":
    unittest.main()
