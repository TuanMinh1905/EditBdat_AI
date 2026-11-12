"""Filename -> catalog -> strict historical matching -> XML integration."""
import csv
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from source_metadata import (parse_source_filename, normalize_catalog_row, normalize_plan_row,
                             matches_context, migrate_classifications, context_of)
from source_metadata import year_bounds
from clip_splitter import ClipSplitter
import premiere_xml_generator as xml


class SourceMetadataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def csv(self, name, rows):
        path = self.root / name
        fields = list(dict.fromkeys(k for row in rows for k in row))
        with path.open('w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fields)
            writer.writeheader()
            writer.writerows(rows)
        return str(path)

    def test_new_names_with_optional_action_and_sequence(self):
        for name, code, period, event in (
            ('rai_1_1_Xavi_Spain_Euro2008_001.mp4', 'rai_1_1', 'Euro2008', 'Euro'),
            ('rai_1_2_Xavi_Barcelona_2010.mp4', 'rai_1_2', '2010', ''),
            ('rai_1_3_Xavi_Barcelona_2008-2012_Skill_023.mp4', 'rai_1_3', '2008-2012', ''),
            ('rai_2_Xavi_Spain_Euro2008_Celebrate_003.mp4', 'rai_2', 'Euro2008', 'Euro'),
        ):
            with self.subTest(name=name):
                row = parse_source_filename(name)
                self.assertEqual((row['loai'], row['thoi_diem'], row['su_kien']), (code, period, event))
                self.assertEqual(row['cau_thu'], 'Xavi')
                self.assertEqual(row['schema_version'], '2')

    def test_legacy_codes_and_ambiguous_rai_2_do_not_change_meaning(self):
        for name, expected in (
            ('rai_1_Xavi_Spain_Goal_001.mp4', 'rai_1_1'),
            ('rai_2_Xavi_Spain_Assist_001.mp4', 'rai_1_2'),
            ('rai_2_1_Xavi_Spain_Skill_001.mp4', 'rai_1_3'),
            ('rai_4_Xavi_Spain_Celebrate_001.mp4', 'rai_2'),
        ):
            self.assertEqual(parse_source_filename(name)['loai'], expected)
        legacy = normalize_plan_row(dict(loai_source='rai_2', thoi_ky='Euro 2008 · Tây Ban Nha / Xavi'))
        self.assertEqual(legacy['loai_source'], 'rai_1_3')
        self.assertEqual(legacy['thoi_diem'], 'Euro2008')
        modern = normalize_plan_row(dict(loai_source='rai_2', schema_version='2', thoi_diem='2008'))
        self.assertEqual(modern['loai_source'], 'rai_2')
        self.assertEqual(normalize_plan_row(modern), modern)

    def test_exact_dates_and_sequence_numbers_are_not_mistaken_for_periods(self):
        self.assertIsNone(year_bounds('2008-06-29'))
        self.assertIsNone(year_bounds('00:20:08:00'))
        self.assertEqual(year_bounds('World Cup 2010'), (2010, 2010))
        row = parse_source_filename('rai_2_Xavi_Spain_Unknown_Celebrate_2008.mp4')
        self.assertEqual(row['thoi_diem'], '')
        self.assertEqual(row['loai'], 'rai_2')
        row = parse_source_filename('my_custom_type_Xavi_Spain_Euro2008.mp4', ['my_custom_type'])
        self.assertEqual(row['loai'], 'my_custom_type')

    def test_migration_preserves_custom_tables_and_is_idempotent(self):
        original = dict(source_types=[dict(code='rai_2', description='old close action'),
                        dict(code='rai_4', image='fan.mp4'), dict(code='custom', description='My type')],
                        element_types=[dict(code='my_overlay', description='My rule')])
        migrated = migrate_classifications(original)
        self.assertEqual(migrated['source_types'][3]['image'], 'fan.mp4')
        self.assertEqual(migrated['source_types'][-1], original['source_types'][-1])
        self.assertEqual(migrated['element_types'], original['element_types'])
        self.assertEqual(migrate_classifications(migrated), migrated)

    def test_time_player_team_event_are_hard_constraints(self):
        request = dict(cau_thu='Xavi Hernández', doi_bong='Tây Ban Nha', thoi_diem='Euro2008', su_kien='Euro')
        correct = dict(cau_thu='Xavi', doi_bong='Spain', thoi_diem='Euro2008', su_kien='Euro')
        self.assertTrue(matches_context(correct, request))
        for changes in (dict(thoi_diem='2018'), dict(thoi_diem='2008-2012'), dict(thoi_diem=''),
                        dict(cau_thu='Iniesta'), dict(doi_bong='Barcelona'), dict(su_kien='WorldCup')):
            self.assertFalse(matches_context({**correct, **changes}, request), changes)
        self.assertTrue(matches_context(dict(thoi_diem='2010'), dict(thoi_diem='2008-2012')))
        self.assertFalse(matches_context(dict(thoi_diem='2008'), dict(thoi_diem='Euro2008')))
        # Clearing v2 fields must not resurrect the old combined display column.
        self.assertEqual(context_of(dict(schema_version='2', thoi_diem='', thoi_ky='2018 · Barcelona / Xavi'))['thoi_diem'], '')

    def test_split_inherits_filename_period_and_catalog_roundtrip(self):
        splitter = ClipSplitter(log=lambda _: None)
        source = str(self.root / 'rai_1_2_Xavi_Spain_Euro2008_Assist.mp4')
        with patch.object(splitter, 'probe', return_value=dict(fps=30)), patch('clip_splitter.subprocess.run', return_value=SimpleNamespace(returncode=0)):
            rows = splitter.split(source, str(self.root), segments=[(0, 3), (3, 6)], make_thumbs=False)
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(r['thoi_diem'] == 'Euro2008' and r['loai'] == 'rai_1_2' for r in rows))
        self.assertIn('Euro2008_Assist_001', rows[0]['ten_file'])
        restored = splitter.read_catalog(str(self.root / 'catalog.csv'))
        self.assertTrue(all(r['su_kien'] == 'Euro' and r['schema_version'] == '2' for r in restored))

    def test_legacy_catalog_retains_physical_path_and_backup(self):
        original = dict(ten_file='rai_4_Xavi_Spain_Celebrate_001.mp4', loai='rai_4', cau_thu='Xavi', doi_bong='Spain', ky_nang='Celebrate')
        path = self.csv('catalog.csv', [original])
        before = Path(path).read_bytes()
        rows = ClipSplitter.read_catalog(path)
        self.assertEqual(rows[0]['loai'], 'rai_2')
        self.assertEqual(Path(rows[0]['source_relpath']).parts[0], 'rai_4')
        self.assertEqual(rows[0]['thoi_diem'], '')
        ClipSplitter.write_catalog(path, rows)
        ClipSplitter.write_catalog(path, ClipSplitter.read_catalog(path))
        self.assertEqual(Path(path + '.v1.bak').read_bytes(), before)
        self.assertEqual(ClipSplitter.read_catalog(path)[0]['loai'], 'rai_2')

    def clip(self, name, **fields):
        (self.root / name).write_bytes(b'fixture')
        return dict(ten_file=name, loai='rai_1_2', schema_version='2', cau_thu='Xavi',
                    doi_bong='Spain', thoi_diem='Euro2008', su_kien='Euro', duration_s='3', **fields)

    def test_picker_does_not_fall_back_to_other_player_era_type_or_missing_file(self):
        good = self.clip('good.mp4')
        bad = [{**self.clip('later.mp4'), 'thoi_diem': '2018'},
               {**self.clip('other.mp4'), 'cau_thu': 'Iniesta'},
               {**self.clip('goal.mp4'), 'loai': 'rai_1_1'},
               {**good, 'ten_file': 'missing.mp4'}]
        context = dict(schema_version='2', cau_thu='Xavi', doi_bong='Spain', thoi_diem='Euro2008', su_kien='Euro')
        picked, frames = xml.pick_clips('rai_1_2', '', '', '', '', 180,
            xml.build_catalog_index(bad + [good]), set(), str(self.root), context=context)
        self.assertEqual(frames, 90)
        self.assertEqual([Path(r['path']).name for r in picked], ['good.mp4'])
        picked, _ = xml.pick_clips('rai_1_2', '', '', '', '', 180,
            xml.build_catalog_index(bad), set(), str(self.root), context=context)
        self.assertEqual(picked, [])

    def test_xml_respects_period_and_marks_unfilled_tail(self):
        timeline = self.csv('timeline.csv', [dict(doan='1', cau='1', y='1', start='0', text='Xavi kiến tạo tại Euro 2008')])
        plan = self.csv('plan.csv', [dict(doan='1', cau='1', y='1', loai_source='rai_1_2', schema_version='2',
            cau_thu='Xavi', doi_bong='Spain', thoi_diem='Euro2008', su_kien='Euro', element='none', bgm='none', sfx='none')])
        catalog = self.csv('catalog.csv', [self.clip('correct.mp4'), {**self.clip('wrong2018.mp4'), 'thoi_diem': '2018'}])
        output = str(self.root / 'timeline.xml')
        result = xml.generate_xml(timeline, plan, catalog, str(self.root / 'voice.mp3'), str(self.root), output, enable_animations=False, log=lambda _: None)
        tree = ET.parse(output)
        paths = ' '.join(x.text or '' for x in tree.findall('.//pathurl'))
        self.assertIn('correct.mp4', paths)
        self.assertNotIn('wrong2018.mp4', paths)
        self.assertTrue(any('thieu' in item for item in result['missing']))
        self.assertIn('THIEU SOURCE DUNG THOI DIEM', Path(output).read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
