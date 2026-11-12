"""Provider order, HTTP adapter and run continuity; fake credentials, no network."""

import json
import importlib
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
from google.genai import errors

import ai_provider_router as router
import gemini_client
import gemini_key_pool as pool


def api_error(code=429):
    return errors.APIError(code, {'error': {'code': code, 'message': 'fake provider error'}})


def openai_reply(text='{"layers":[]}', **changes):
    data = {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}],
            'usage': {'input_tokens': 100, 'output_tokens': 40, 'total_tokens': 140,
                      'output_tokens_details': {'reasoning_tokens': 10}}}
    data.update(changes)
    return Mock(status_code=200, json=lambda: data)


class RouterTests(unittest.TestCase):
    def setUp(self):
        for table in [pool._PREFERRED, pool._COOLDOWNS, pool._UNAVAILABLE, pool._SERVER_COOLDOWNS,
                      pool._ROUTES, router._OPENAI_RUNS, router._LAST_ROUTES]:
            table.clear()
            self.addCleanup(table.clear)
        self.addCleanup(patch.stopall)
        self.keys = ['fake-gemini-one', 'fake-gemini-two']
        self.config = {'openai_api_key': 'fake-openai-three', 'openai_model': 'gpt-6.1-sol'}
        self.models = {key: Mock() for key in self.keys}
        for model in self.models.values():
            model.generate_content.return_value = SimpleNamespace(text='{"layers":[]}', candidates=[])
        self.factory = patch.object(pool.genai, 'Client', side_effect=lambda api_key, **kw:
                                    SimpleNamespace(models=self.models[api_key])).start()
        patch.object(pool, '_FastConnectTransport', return_value=None).start()
        self.sleep = patch.object(pool.time, 'sleep').start()
        self.post = patch.object(router.httpx, 'post', return_value=openai_reply()).start()
        self.logs = []

    def client(self, keys=None, config=None, run_id='run-one', **kwargs):
        return router.AIProviderRouter(self.keys if keys is None else keys,
            self.config if config is None else config, ['model-a', 'model-b'], self.logs.append, run_id, **kwargs)

    def exhaust_gemini(self):
        for model in self.models.values():
            model.generate_content.side_effect = api_error()

    def test_all_models_key_one_then_all_models_key_two_before_openai(self):
        calls = []
        for key, model in self.models.items():
            def generate(_key=key, **payload):
                calls.append((_key, payload['model'], payload['contents']))
                raise api_error()
            model.generate_content.side_effect = generate
        client = self.client()
        client.generate_content(model='ignored', contents='same full context')
        self.assertEqual([(key, model) for key, model, _ in calls],
                         [(key, model) for key in self.keys for model in ['model-a', 'model-b']])
        self.assertTrue(all(prompt == 'same full context' for _, _, prompt in calls))
        self.assertEqual(client.active_key, self.config['openai_api_key'])
        self.assertEqual(client.active_model, 'gpt-6.1-sol')
        self.assertEqual(self.post.call_args.kwargs['json']['input'], 'same full context')
        self.assertTrue(any('[OpenAI]' in line for line in self.logs))

    def test_success_on_key_one_second_model_does_not_call_key_two_or_openai(self):
        self.models[self.keys[0]].generate_content.side_effect = [api_error(), SimpleNamespace(text='valid')]
        client = self.client()
        self.assertEqual(client.generate_content(model='ignored', contents='prompt').text, 'valid')
        self.models[self.keys[1]].generate_content.assert_not_called()
        self.post.assert_not_called()

    def test_unexpected_key_one_provider_error_still_tries_key_two_before_openai(self):
        self.models[self.keys[0]].generate_content.side_effect = RuntimeError('fake provider error')
        client = self.client()
        client.generate_content(model='ignored', contents='prompt')
        self.assertEqual(client.active_key, self.keys[1])
        self.post.assert_not_called()

    def test_server_and_network_failure_retry_once_per_key_then_openai(self):
        for failure in [api_error(503), httpx.ConnectTimeout('fake timeout'), httpx.ReadTimeout('fake read timeout'), TimeoutError('fake timeout')]:
            with self.subTest(error=type(failure).__name__):
                pool._SERVER_COOLDOWNS.clear()
                router._OPENAI_RUNS.clear()
                self.sleep.reset_mock()
                for model in self.models.values():
                    model.generate_content.reset_mock()
                    model.generate_content.side_effect = failure
                self.client().generate_content(model='ignored', contents='prompt')
                self.assertEqual([m.generate_content.call_count for m in self.models.values()], [2, 2])
                self.assertEqual(self.sleep.call_count, 2)
                for model in self.models.values():
                    self.assertEqual(model.generate_content.call_args_list[0], model.generate_content.call_args_list[1])

    def test_openai_stays_for_remaining_groups_but_new_run_prioritizes_gemini(self):
        self.exhaust_gemini()
        self.client().generate_content(model='ignored', contents='first')
        self.factory.reset_mock()
        for model in self.models.values():
            model.generate_content.side_effect = None
        pool._COOLDOWNS.clear()
        self.client().generate_content(model='ignored', contents='second')
        self.factory.assert_not_called()
        self.assertEqual(self.post.call_count, 2)
        self.client(run_id='new-run').generate_content(model='ignored', contents='new')
        self.assertEqual(self.post.call_count, 2)
        self.factory.assert_called_once()

    def test_openai_disabled_or_failing_in_sticky_run_can_return_to_enabled_gemini(self):
        self.client(keys=['', '']).generate_content(model='ignored', contents='first')
        self.client(config={}).generate_content(model='ignored', contents='second')
        self.assertEqual(self.post.call_count, 1)
        self.client(keys=['', '']).generate_content(model='ignored', contents='third')
        self.post.side_effect = httpx.ConnectTimeout('fake OpenAI timeout')
        client = self.client()
        client.generate_content(model='ignored', contents='fourth')
        self.assertEqual(client.active_provider, 'gemini')

    def test_restored_openai_preference_and_openai_only_never_call_gemini(self):
        self.client(config={**self.config, 'prefer_openai': True}).generate_content(model='ignored', contents='restore')
        self.client(keys=['', ''], run_id='only-openai').generate_content(model='ignored', contents='only')
        self.factory.assert_not_called()
        self.assertEqual(self.post.call_count, 2)

    def test_disabled_keys_are_skipped_and_original_slot_two_is_reported(self):
        client = self.client(keys=['', self.keys[1]], config={})
        client.generate_content(model='ignored', contents='prompt')
        self.assertEqual(client.active_key, self.keys[1])
        status = router.get_ai_status(['', self.keys[1]], {}, ['model-a', 'model-b'])
        self.assertEqual(status['active_slot'], 2)
        self.assertEqual(self.factory.call_args.kwargs['api_key'], self.keys[1])
        self.post.assert_not_called()

    def test_all_failures_produce_resumable_error_and_no_key_leaks(self):
        self.exhaust_gemini()
        self.post.return_value = Mock(status_code=429, text='fake-openai-three secret echoed in provider body')
        with self.assertRaises(router.AllProvidersUnavailable) as caught:
            self.client().generate_content(model='ignored', contents='prompt')
        self.assertIn('tạm dừng', str(caught.exception))
        for key in self.keys + [self.config['openai_api_key']]:
            self.assertNotIn(key, str(caught.exception) + str(self.logs))
        with self.assertRaises(router.AllProvidersUnavailable):
            self.client(keys=['', ''], config={})

    def test_openai_status_is_not_reported_as_all_gemini_quota_exhausted(self):
        self.exhaust_gemini()
        self.client().generate_content(model='ignored', contents='prompt')
        status = router.get_ai_status(self.keys, self.config, ['model-a', 'model-b'])
        self.assertEqual((status['provider'], status['active_slot']), ('openai', 3))
        self.assertFalse(status['all_limited'])
        self.assertNotIn(self.config['openai_api_key'], json.dumps(status))

    def test_blank_gemini_results_try_other_models_then_openai(self):
        for model in self.models.values():
            model.generate_content.return_value = SimpleNamespace(text=None, candidates=[])
        client = self.client()
        client.generate_content(model='ignored', contents='prompt')
        self.assertEqual(client.active_provider, 'openai')
        self.assertEqual([m.generate_content.call_count for m in self.models.values()], [2, 2])

    def test_explicit_provider_refusal_does_not_switch_provider(self):
        self.models[self.keys[0]].generate_content.return_value = SimpleNamespace(
            text=None, candidates=[SimpleNamespace(finish_reason='SAFETY')])
        with self.assertRaises(router.AIRefusalError):
            self.client().generate_content(model='ignored', contents='prompt')
        self.post.assert_not_called()
        self.models[self.keys[1]].generate_content.assert_not_called()

    def test_unspecified_block_reason_is_not_a_refusal(self):
        self.models[self.keys[0]].generate_content.return_value = SimpleNamespace(
            text='{"layers":[]}', candidates=[], prompt_feedback=SimpleNamespace(
                block_reason=SimpleNamespace(value='BLOCK_REASON_UNSPECIFIED')))
        client = self.client()
        client.generate_content(model='ignored', contents='prompt')
        self.assertEqual(client.active_provider, 'gemini')
        self.post.assert_not_called()

    def test_openai_timeline_generate_and_repair_record_actual_key_model_and_usage(self):
        with patch.object(gemini_client, 'record_usage') as usage:
            client = gemini_client.GeminiClient('', api_keys=['', ''], ai_config=self.config)
            self.assertEqual(client.generate_timeline([], 'test'), {'layers': []})
            self.assertEqual(client.fix_timeline({'layers': []}, []), {'layers': []})
        self.assertEqual(usage.call_count, 2)
        for call in usage.call_args_list:
            self.assertEqual(call.args[0], self.config['openai_api_key'])
            self.assertEqual(call.kwargs['model'], 'gpt-6.1-sol')
            self.assertEqual(call.args[1].usage_metadata.candidates_token_count, 30)
            self.assertEqual(call.args[1].usage_metadata.thoughts_token_count, 10)
            self.assertEqual(call.args[1].usage_metadata.total_token_count, 140)
        payload = self.post.call_args_list[0].kwargs['json']
        self.assertEqual([m['role'] for m in payload['input']], ['user', 'assistant', 'user'])

    def test_source_structured_schema_unwraps_rows_and_keeps_context(self):
        self.post.return_value = openai_reply('{"rows":[{"row_index":7}]}')
        response = self.client(keys=['', ''], kind='source_plan').generate_content(
            model='ignored', contents='all classification rules and script', config={'max_output_tokens': 16384})
        self.assertEqual(json.loads(response.text), [{'row_index': 7}])
        args = self.post.call_args
        self.assertEqual(args.args[0], 'https://api.openai.com/v1/responses')
        payload = args.kwargs['json']
        self.assertFalse(payload['store'])
        self.assertFalse(args.kwargs['follow_redirects'])
        schema = payload['text']['format']
        self.assertTrue(schema['strict'])
        row = schema['schema']['properties']['rows']['items']
        self.assertEqual(set(row['required']), set(row['properties']))
        self.assertFalse(row['additionalProperties'])
        self.assertEqual(payload['input'], 'all classification rules and script')

    def test_custom_non_reasoning_model_omits_reasoning_argument(self):
        router.OpenAIResponsesClient('fake-openai', model='gpt-4.1-mini').generate_content('JSON timeline')
        self.assertNotIn('reasoning', self.post.call_args.kwargs['json'])

    def test_incomplete_refused_and_invalid_openai_payloads_are_not_successes(self):
        client = router.OpenAIResponsesClient('fake-openai', kind='source_plan')
        for reply in [openai_reply(status='incomplete'), openai_reply(''), openai_reply('[]'),
                      openai_reply('{"rows":{}}')]:
            self.post.return_value = reply
            with self.assertRaises(RuntimeError):
                client.generate_content('JSON source plan')
        self.post.return_value = openai_reply(output=[{'type': 'message', 'content': [{'type': 'refusal'}]}])
        with self.assertRaises(router.AIRefusalError):
            client.generate_content('JSON source plan')

    def test_embeddings_use_lexical_fallback_when_gemini_disabled_or_openai_is_sticky(self):
        client = self.client(keys=['', ''])
        with self.assertRaises(pool.GeminiProviderError):
            client.embed_content(model='embedding', contents=['example'])
        client.generate_content(model='ignored', contents='prompt')
        with self.assertRaises(pool.GeminiProviderError):
            self.client().embed_content(model='embedding', contents=['example'])
        self.factory.assert_not_called()

    def test_optional_embedding_timeout_does_not_disable_text_generation(self):
        self.models[self.keys[0]].embed_content.side_effect = httpx.ReadTimeout('fake embedding timeout')
        client = self.client()
        with self.assertRaises(httpx.ReadTimeout):
            client.embed_content(model='embedding', contents=['example'])
        self.assertEqual(self.factory.call_args.kwargs['http_options'].timeout, 10000)
        self.assertFalse(pool._SERVER_COOLDOWNS)
        client.generate_content(model='ignored', contents='prompt')
        self.assertEqual(client.active_provider, 'gemini')
        self.assertEqual(self.factory.call_args.kwargs['http_options'].timeout, 60000)

    def test_all_timeline_api_routes_allow_openai_only_and_report_resumable_failure(self):
        with patch('source_suggester.SourceSuggester.__init__', return_value=None):
            backend = importlib.import_module('main')
        self.post.return_value = Mock(status_code=503)
        data = {'media_files': [{'path': 'fake.mp4', 'name': 'fake.mp4', 'type': 'video', 'metadata': {'duration': 1}}],
                'prompt': 'test JSON timeline', 'settings': {'openaiApiKey': 'fake-openai-three',
                    'openaiKey3Enabled': True, 'geminiApiKey': self.keys[0], 'geminiKey1Enabled': False}}
        with patch.object(backend, '_resolve_output_dir', return_value='unused-test-output'):
            for endpoint in ['/api/generate', '/api/preview-timeline', '/api/export-jsx']:
                with self.subTest(endpoint=endpoint):
                    response = backend.app.test_client().post(endpoint, json=data)
                    self.assertEqual(response.status_code, 503)
                    self.assertTrue(response.json['all_providers_failed'])
        self.assertEqual(self.post.call_count, 3)
        self.factory.assert_not_called()

    def test_timeline_preview_returns_openai_json_through_actual_api(self):
        with patch('source_suggester.SourceSuggester.__init__', return_value=None):
            backend = importlib.import_module('main')
        with patch.object(gemini_client, 'record_usage'):
            response = backend.app.test_client().post('/api/preview-timeline', json={
                'media_files': [{'path': 'fake.mp4', 'name': 'fake.mp4', 'metadata': {'duration': 1}}],
                'prompt': 'test JSON timeline', 'settings': {'openaiApiKey': 'fake-openai-three', 'openaiKey3Enabled': True}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['timeline'], {'layers': []})
        self.factory.assert_not_called()


if __name__ == '__main__':
    unittest.main()
