"""Regression coverage for actual AI choices, completeness and manual blanks."""
import csv
import importlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import source_suggester as module
import gemini_key_pool
import httpx
from source_suggester import SourceSuggester


class SuggesterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        # Avoid constructor side effects on the user's production folders.
        self.s = SourceSuggester.__new__(SourceSuggester)
        self.s.rules_path = str(self.root / 'rules.txt')
        self.s.examples_path = str(self.root / 'examples.json')
        self.s.classifications_path = str(self.root / 'classifications.json')
        Path(self.s.classifications_path).write_text(json.dumps({
            'source_types': module.DEFAULT_SOURCE_TYPES,
            'element_types': module.DEFAULT_ELEMENT_TYPES,
            'animation_types': module.DEFAULT_ANIMATION_TYPES + [dict(code='custom_anim', description='User animation')],
            'bgm_types': module.DEFAULT_BGM_TYPES, 'sfx_types': module.DEFAULT_SFX_TYPES,
        }), encoding='utf-8')
        self.s._log = Mock()
        Path(self.s.rules_path).write_text('Ưu tiên tv_retro + texture_2. Video dùng static.', encoding='utf-8')
        Path(self.s.examples_path).write_text('[]', encoding='utf-8')
        self.s._save_examples_raw = Mock()
        self.model = Mock()
        self.addCleanup(patch.stopall)
        gemini_key_pool._PREFERRED.clear()
        gemini_key_pool._COOLDOWNS.clear()
        gemini_key_pool._ROUTES.clear()
        gemini_key_pool._UNAVAILABLE.clear()
        patch.object(gemini_key_pool.genai, 'Client', return_value=SimpleNamespace(models=self.model)).start()
        patch.object(module, 'record_usage').start()

    def rows(self, count=3):
        return [dict(doan=str(i // 4), cau=str(i // 2), y=str(i), start=str(i * 3),
                     text=f'Câu thứ {i} về Xavi.') for i in range(count)]

    def choice(self, i, **changes):
        return dict(row_index=i, loai_source='rai_1_3', element='tv_retro + texture_2',
                    anim='static', bgm='bgm_default', sfx='none', si='',
                    thoi_ky='Euro2008 · Spain / Xavi', cau_thu='Xavi', doi_bong='Spain',
                    thoi_diem='Euro2008', su_kien='Euro', confidence=.9, needs_review=False,
                    reason='Pha bóng dùng clip, khung TV và texture theo quy tắc.', **changes)

    def reply(self, *arrays):
        self.model.generate_content.side_effect = [SimpleNamespace(text=json.dumps(a, ensure_ascii=False)) for a in arrays]

    def test_manual_blank_combo_dynamic_animation_and_csv_roundtrip(self):
        manual = self.choice(1)
        manual.update({k: '' for k in ('loai_source', 'element', 'anim', 'bgm', 'sfx', 'si')})
        manual.update(needs_review=True, reason='Pha kiến tạo tại chung kết cần chọn cảnh thủ công.')
        image = self.choice(2)
        image.update(loai_source='anh_thoi_diem', anim='custom_anim', si='yes')
        self.reply([image, self.choice(0), manual])
        result = self.s.suggest_from_timeline(self.rows(), 'test-key')
        self.assertEqual([r['analysis_status'] for r in result], ['complete', 'manual', 'complete'])
        self.assertEqual(result[0]['element'], 'tv_retro + texture_2')
        self.assertEqual(result[1]['loai_source'], '')
        self.assertTrue(result[1]['needs_review'])
        self.assertEqual(result[2]['anim'], 'custom_anim')
        self.assertEqual(result[2]['si'], 'yes')
        path = self.root / 'plan.csv'
        self.s.export_source_plan_csv(result, str(path))
        reloaded = self.s.load_timeline_csv(str(path))
        self.assertEqual(reloaded[0]['element'], result[0]['element'])
        for key in ('loai_source', 'element', 'anim', 'bgm', 'sfx', 'si'):
            self.assertEqual(reloaded[1][key], '')

    def test_missing_row_is_retried_without_overwriting_valid_choice(self):
        self.reply([self.choice(0), self.choice(2)], [self.choice(1)])
        result = self.s.suggest_from_timeline(self.rows(), 'test-key')
        self.assertEqual([r['analysis_status'] for r in result], ['complete'] * 3)
        repair = self.model.generate_content.call_args_list[1].kwargs['contents']
        self.assertIn('giữ nguyên row_index: [1]', repair)

    def test_gemini_requests_have_explicit_timeout(self):
        self.reply([self.choice(0)])
        self.s.suggest_from_timeline(self.rows(1), 'test-key')
        self.assertEqual(gemini_key_pool.genai.Client.call_args.kwargs['http_options'].timeout, 120000)

    def test_quota_failover_records_backup_usage_and_keeps_full_context(self):
        from google.genai.errors import ClientError
        backup_model = Mock()
        self.model.generate_content.side_effect = ClientError(429, {'error': {'status': 'RESOURCE_EXHAUSTED'}})
        backup_model.generate_content.return_value = SimpleNamespace(text=json.dumps([self.choice(0)]))
        gemini_key_pool.genai.Client.side_effect = lambda api_key, **kw: SimpleNamespace(
            models=self.model if api_key == 'primary-test-key' else backup_model)
        result = self.s.suggest_from_timeline(self.rows(1), 'primary-test-key', context_rows=self.rows(5),
                                            api_keys=['primary-test-key', 'backup-test-key'])
        self.assertEqual(result[0]['analysis_status'], 'complete')
        self.assertEqual(self.model.generate_content.call_args, backup_model.generate_content.call_args)
        self.assertIn('Câu thứ 4 về Xavi.', backup_model.generate_content.call_args.kwargs['contents'])
        self.assertEqual(module.record_usage.call_args.args[0], 'backup-test-key')

    def test_quota_during_repair_keeps_completed_rows_and_requeues_only_missing(self):
        from google.genai.errors import ClientError
        def exhausted():
            return ClientError(429, {'error': {'status': 'RESOURCE_EXHAUSTED'}})
        self.model.generate_content.side_effect = [SimpleNamespace(text=json.dumps([self.choice(0)])),
                                                  exhausted(), exhausted(), exhausted(), exhausted()]
        result = self.s.suggest_from_timeline(self.rows(2), 'test-key', api_keys=['test-key', 'backup-key'],
                                            model_priority=['model-a', 'model-b'])
        self.assertEqual(result[0]['analysis_status'], 'complete')
        self.assertEqual(result[1]['analysis_status'], 'pending')
        self.assertFalse(result[1]['needs_review'])
        self.assertGreaterEqual(result[1]['quota_retry_after_seconds'], 60)

    def test_first_pass_quota_error_keeps_structured_retry_information(self):
        from google.genai.errors import ClientError
        self.model.generate_content.side_effect = ClientError(429, {'error': {'status': 'RESOURCE_EXHAUSTED'}})
        with self.assertRaises(gemini_key_pool.GeminiQuotaError) as caught:
            self.s.suggest_from_timeline(self.rows(1), 'test-key', model_priority=['model-a', 'model-b'])
        self.assertGreaterEqual(caught.exception.retry_after_seconds, 60)

    @patch.object(module.time, 'sleep')
    def test_tls_connect_timeout_retries_same_payload(self, sleep):
        self.model.generate_content.side_effect = [
            httpx.ConnectTimeout('TLS handshake timed out'),
            SimpleNamespace(text=json.dumps([self.choice(0)])),
        ]
        result = self.s.suggest_from_timeline(self.rows(1), 'test-key')
        self.assertEqual(result[0]['analysis_status'], 'complete')
        self.assertEqual(self.model.generate_content.call_args_list[0],
                         self.model.generate_content.call_args_list[1])
        sleep.assert_called_once_with(1)

    @patch.object(module.time, 'sleep')
    def test_persistent_connect_timeout_stops_after_two_calls(self, sleep):
        self.model.generate_content.side_effect = httpx.ConnectTimeout('TLS handshake timed out')
        with self.assertRaisesRegex(RuntimeError, 'HTTPS.*2 lần thử'):
            self.s.suggest_from_timeline(self.rows(1), 'test-key')
        self.assertEqual(self.model.generate_content.call_count, 2)

    def test_read_timeout_is_not_retried(self):
        self.model.generate_content.side_effect = httpx.ReadTimeout('read timed out')
        with self.assertRaisesRegex(RuntimeError, 'read timed out'):
            self.s.suggest_from_timeline(self.rows(1), 'test-key')
        self.assertEqual(self.model.generate_content.call_count, 1)

    def overloaded(self):
        error = RuntimeError('503 UNAVAILABLE: high demand')
        error.code = 503
        return error

    @patch.object(module.time, 'sleep')
    def test_overloaded_provider_retries_same_request(self, sleep):
        self.model.generate_content.side_effect = [self.overloaded(),
            SimpleNamespace(text=json.dumps([self.choice(0)]))]
        result = self.s.suggest_from_timeline(self.rows(1), 'test-key')
        self.assertEqual(result[0]['analysis_status'], 'complete')
        self.assertEqual(self.model.generate_content.call_args_list[0],
                         self.model.generate_content.call_args_list[1])
        sleep.assert_called_once_with(10)

    @patch.object(module.time, 'sleep')
    def test_persistent_overload_stops_with_clear_message(self, sleep):
        self.model.generate_content.side_effect = self.overloaded()
        with self.assertRaisesRegex(RuntimeError, 'quá tải.*503.*2 lần thử'):
            self.s.suggest_from_timeline(self.rows(1), 'test-key')
        self.assertEqual(self.model.generate_content.call_count, 2)
        sleep.assert_called_once_with(10)

    @patch.object(module.time, 'sleep')
    def test_overloaded_repair_keeps_first_pass_results(self, sleep):
        self.model.generate_content.side_effect = [
            SimpleNamespace(text=json.dumps([self.choice(0)])),
            self.overloaded(), self.overloaded()]
        result = self.s.suggest_from_timeline(self.rows(2), 'test-key')
        self.assertEqual(result[0]['analysis_status'], 'complete')
        self.assertEqual(result[1]['analysis_status'], 'error')
        self.assertIn('503', result[1]['reason'])
        self.assertEqual(self.model.generate_content.call_count, 3)

    def test_failed_repair_keeps_valid_first_pass_rows(self):
        self.model.generate_content.side_effect = [
            SimpleNamespace(text=json.dumps([self.choice(0)])),
            TimeoutError('provider timeout'),
        ]
        result = self.s.suggest_from_timeline(self.rows(2), 'test-key')
        self.assertEqual(result[0]['analysis_status'], 'complete')
        self.assertEqual(result[1]['analysis_status'], 'error')
        self.assertEqual(result[1]['loai_source'], '')
        self.assertIn('provider timeout', result[1]['reason'])

    def test_first_request_timeout_is_reported_without_fake_results(self):
        self.model.generate_content.side_effect = TimeoutError('provider timeout')
        with self.assertRaisesRegex(RuntimeError, 'provider timeout'):
            self.s.suggest_from_timeline(self.rows(2), 'test-key')
        self.assertEqual(self.model.generate_content.call_count, 1)

    def test_missing_invalid_and_duplicate_never_become_confident_defaults(self):
        bad = self.choice(1)
        bad.update(loai_source='invented', element='auto')
        self.reply([self.choice(0), self.choice(0), bad], [])
        result = self.s.suggest_from_timeline(self.rows(), 'test-key')
        for row in result:
            self.assertEqual(row['loai_source'], '')
            self.assertEqual(row['element'], '')
            self.assertEqual(row['confidence'], 0)
            self.assertEqual(row['analysis_status'], 'error')
            self.assertTrue(row['needs_review'])
        with self.assertRaisesRegex(ValueError, 'chưa được phân tích'):
            self.s.export_source_plan_csv(result, str(self.root / 'invalid.csv'))
        self.assertFalse((self.root / 'invalid.csv').exists())

    def test_truncated_json_is_retried(self):
        self.model.generate_content.side_effect = [SimpleNamespace(text='[{"row_index":0,'),
            SimpleNamespace(text=json.dumps([self.choice(0)]))]
        result = self.s.suggest_from_timeline(self.rows(1), 'test-key')
        self.assertEqual(result[0]['analysis_status'], 'complete')

    def test_406_rows_batched_with_full_context_and_continuity(self):
        prompts = []
        def generate(**kwargs):
            prompt = kwargs['contents']
            prompts.append(prompt)
            target_json = prompt.split('=== 4. DANH SÁCH ĐỐI TƯỢNG TIME (CÂU THOẠI) CẦN GÁN ===\n')[1].split('\n\n=== YÊU CẦU')[0]
            items = json.loads(target_json)
            self.assertLessEqual(len(items), 8)
            self.assertIn('Câu thứ 405 về Xavi.', prompt)
            return SimpleNamespace(text=json.dumps([self.choice(r['row_index']) for r in items]))
        self.model.generate_content.side_effect = generate
        result = self.s.suggest_from_timeline(self.rows(406), 'test-key')
        self.assertEqual(len(prompts), 51)
        self.assertEqual([r['row_index'] for r in result], list(range(406)))
        self.assertTrue(all(r['analysis_status'] == 'complete' for r in result))
        previous = prompts[1].split('=== CÁC LỰA CHỌN NGAY TRƯỚC NHÓM NÀY')[1].split('=== 4.')[0]
        self.assertIn('Câu thứ 7 về Xavi.', previous)
        self.assertIn('bgm_default', previous)

    def test_rules_snapshot_and_context_do_not_write_user_files(self):
        self.reply([self.choice(0)])
        original = Path(self.s.rules_path).read_text(encoding='utf-8')
        self.s.suggest_from_timeline(self.rows(1), 'test-key', context_rows=self.rows(4), rules_text='DÙNG QUY TẮC HIỆN TẠI')
        prompt = self.model.generate_content.call_args.kwargs['contents']
        self.assertIn('DÙNG QUY TẮC HIỆN TẠI', prompt)
        self.assertIn('Câu thứ 3 về Xavi.', prompt)
        self.assertEqual(Path(self.s.rules_path).read_text(encoding='utf-8'), original)

    def test_invalid_or_blank_input_is_not_learned_as_rai_1(self):
        self.assertEqual(self.s.sanitize_loai_source(''), '')
        self.assertEqual(self.s.sanitize_loai_source('rai_1 + not_a_code'), '')
        self.assertEqual(self.s.sanitize_element('tv_retro + texture_2'), 'tv_retro + texture_2')
        self.assertEqual(self.s.sanitize_element('invented'), '')
        stats = self.s.add_examples([dict(text='Unclassified', loai_source=''),
                                    dict(text='Error', loai_source='rai_1', analysis_status='error')])
        self.assertEqual(stats['added'], 0)
        self.s._save_examples_raw.assert_not_called()

    def test_missing_text_and_key_are_actionable_errors(self):
        with self.assertRaisesRegex(ValueError, 'API Key'):
            self.s.suggest_from_timeline(self.rows(), '')
        with self.assertRaisesRegex(ValueError, 'text'):
            self.s.suggest_from_timeline([dict(text='')], 'test-key')
        self.model.generate_content.assert_not_called()

    def test_locked_context_survives_ai_response_and_csv(self):
        row = {**self.rows(1)[0], 'schema_version': '2', 'cau_thu': 'Xavi', 'doi_bong': 'Barcelona',
               'thoi_diem': '2010', 'su_kien': '', 'context_locked': 'yes', 'context_scope': 'row'}
        self.reply([self.choice(0)])  # Model incorrectly replies with Euro2008.
        result = self.s.suggest_from_timeline([row], 'test-key')
        self.assertEqual(result[0]['thoi_diem'], '2010')
        self.assertEqual(result[0]['doi_bong'], 'Barcelona')
        self.assertEqual(result[0]['su_kien'], '')
        path = self.root / 'context.csv'
        self.s.export_source_plan_csv(result, str(path))
        restored = self.s.load_timeline_csv(str(path))[0]
        self.assertEqual(restored['context_scope'], 'row')
        self.assertEqual(restored['thoi_diem'], '2010')
        self.assertEqual(restored['schema_version'], '2')

    def test_unknown_period_is_manual_and_never_gets_default_year(self):
        unknown = self.choice(0)
        unknown.update(thoi_diem='', su_kien='')
        self.reply([unknown])
        result = self.s.suggest_from_timeline(self.rows(1), 'test-key', default_thoi_ky='Euro 2008')
        self.assertEqual(result[0]['analysis_status'], 'manual')
        self.assertEqual(result[0]['loai_source'], '')
        self.assertEqual(result[0]['thoi_diem'], '')

    def test_disabled_broll_requires_model_to_repair_choice(self):
        bad = self.choice(0)
        bad['loai_source'] = 'rai_2'
        self.reply([bad], [self.choice(0)])
        result = self.s.suggest_from_timeline([{**self.rows(1)[0], 'allow_rai_2': 'no'}], 'test-key')
        self.assertEqual(result[0]['loai_source'], 'rai_1_3')
        self.assertEqual(self.model.generate_content.call_count, 2)

    def test_parent_group_is_not_a_valid_selection(self):
        self.assertEqual(self.s.sanitize_loai_source('rai_1'), '')
        self.assertEqual(self.s.sanitize_loai_source('rai_1_2'), 'rai_1_2')

    def test_export_backs_up_legacy_plan_and_preserves_blank_row_status(self):
        path = self.root / 'old_plan.csv'
        original = 'doan,cau,y,loai_source,thoi_ky\n1,1,1,rai_2,2008\n'
        path.write_text(original, encoding='utf-8')
        row = dict(doan='1', cau='1', y='1', loai_source='', analysis_status='manual',
                   reason='Cảnh quá cụ thể', thoi_diem='Euro2008', schema_version='2', text='Test')
        self.s.export_source_plan_csv([row], str(path))
        self.assertEqual(Path(str(path) + '.v1.bak').read_text(encoding='utf-8'), original)
        restored = self.s.load_timeline_csv(str(path))[0]
        self.assertEqual(restored['analysis_status'], 'manual')
        self.assertEqual(restored['loai_source'], '')
        self.assertEqual(restored['text'], 'Test')

    def test_filename_api_uses_same_metadata_parser_as_splitter(self):
        with patch.object(SourceSuggester, '__init__', return_value=None):
            backend = importlib.import_module('main')
        response = backend.app.test_client().post('/api/clip-splitter/parse-filename',
            json={'filename': 'rai_1_2_Xavi_Spain_Euro2008_Assist_001.mp4'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['loai'], 'rai_1_2')
        self.assertEqual(response.json['thoi_diem'], 'Euro2008')

    def test_api_forwards_full_context_and_rules_without_saving_them(self):
        with patch.object(SourceSuggester, '__init__', return_value=None):
            backend = importlib.import_module('main')
        self.reply([self.choice(0)])
        original = Path(self.s.rules_path).read_text(encoding='utf-8')
        with patch.object(backend, 'source_suggester', self.s):
            response = backend.app.test_client().post('/api/source-suggester/suggest', json={
                'api_key': 'test-key', 'rows': self.rows(1), 'context_rows': self.rows(4),
                'previous_rows': [dict(text='Câu trước', bgm='bgm_default')], 'rules': 'Quy tắc tạm cho lượt này',
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['rows'][0]['analysis_status'], 'complete')
        prompt = self.model.generate_content.call_args.kwargs['contents']
        self.assertIn('Câu thứ 3 về Xavi.', prompt)
        self.assertIn('Câu trước', prompt)
        self.assertIn('Quy tắc tạm cho lượt này', prompt)
        self.assertEqual(Path(self.s.rules_path).read_text(encoding='utf-8'), original)

    def test_api_quota_error_exposes_wait_metadata(self):
        from google.genai.errors import ClientError
        with patch.object(SourceSuggester, '__init__', return_value=None):
            backend = importlib.import_module('main')
        self.model.generate_content.side_effect = ClientError(429, {'error': {'status': 'RESOURCE_EXHAUSTED'}})
        with patch.object(backend, 'source_suggester', self.s):
            response = backend.app.test_client().post('/api/source-suggester/suggest', json={
                'api_key': 'test-key', 'api_keys': ['test-key', 'backup-key'], 'rows': self.rows(1),
                'model_priority': ['model-a', 'model-b']})
        self.assertEqual(response.status_code, 429)
        self.assertTrue(response.json['quota_wait'])
        self.assertGreaterEqual(response.json['retry_after_seconds'], 60)

    def test_api_partial_quota_reply_keeps_completed_rows(self):
        from google.genai.errors import ClientError
        with patch.object(SourceSuggester, '__init__', return_value=None):
            backend = importlib.import_module('main')
        self.model.generate_content.side_effect = [SimpleNamespace(text=json.dumps([self.choice(0)]))] + [
            ClientError(429, {'error': {'status': 'RESOURCE_EXHAUSTED'}}) for _ in range(4)]
        with patch.object(backend, 'source_suggester', self.s):
            response = backend.app.test_client().post('/api/source-suggester/suggest', json={
                'api_key': 'test-key', 'api_keys': ['test-key', 'backup-key'], 'rows': self.rows(2),
                'model_priority': ['model-a', 'model-b']})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['quota_wait'])
        self.assertEqual([row['analysis_status'] for row in response.json['rows']], ['complete', 'pending'])

    def test_invalid_export_does_not_truncate_existing_file(self):
        path = self.root / 'existing.csv'
        path.write_text('keep original', encoding='utf-8')
        with self.assertRaises(ValueError):
            self.s.export_source_plan_csv([self.choice(0), dict(loai_source='unknown')], str(path))
        self.assertEqual(path.read_text(encoding='utf-8'), 'keep original')


if __name__ == '__main__':
    unittest.main()
