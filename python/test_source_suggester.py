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
        patch.object(module.genai, 'Client', return_value=SimpleNamespace(models=self.model)).start()
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
            self.assertLessEqual(len(items), 32)
            self.assertIn('Câu thứ 405 về Xavi.', prompt)
            return SimpleNamespace(text=json.dumps([self.choice(r['row_index']) for r in items]))
        self.model.generate_content.side_effect = generate
        result = self.s.suggest_from_timeline(self.rows(406), 'test-key')
        self.assertEqual(len(prompts), 13)
        self.assertEqual([r['row_index'] for r in result], list(range(406)))
        self.assertTrue(all(r['analysis_status'] == 'complete' for r in result))
        previous = prompts[1].split('=== CÁC LỰA CHỌN NGAY TRƯỚC NHÓM NÀY')[1].split('=== 4.')[0]
        self.assertIn('Câu thứ 31 về Xavi.', previous)
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

    def test_invalid_export_does_not_truncate_existing_file(self):
        path = self.root / 'existing.csv'
        path.write_text('keep original', encoding='utf-8')
        with self.assertRaises(ValueError):
            self.s.export_source_plan_csv([self.choice(0), dict(loai_source='unknown')], str(path))
        self.assertEqual(path.read_text(encoding='utf-8'), 'keep original')


if __name__ == '__main__':
    unittest.main()
