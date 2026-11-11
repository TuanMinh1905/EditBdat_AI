"""Regression tests for migration, asset verification, streaming and XML paths."""

import csv
import importlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import asset_service as assets
import premiere_xml_generator as xml
import rename_assets as migration


class AssetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.elements = self.root / 'Elements'
        self.sounds = self.root / 'Sounds'
        self.elements.mkdir()
        (self.sounds / 'Background').mkdir(parents=True)
        (self.sounds / 'SFX').mkdir()
        self.emap = {'tv_retro': {'file': 'old frame.png', 'scope': 'clip'},
                     'paper_texture': {'file': 'paper.png', 'scope': 'full'}, 'none': None}
        self.bgm = {'bgm_default': {'file': 'Background/old music.mp3'}}
        self.sfx = {'tv_glitch': {'file': 'SFX/tv_glitch.mp3'}}
        self.auto = {'phong_van': 'tv_retro'}
        self.auto_sfx = {'phong_van': 'tv_glitch'}
        for name in ('old frame.png', 'paper.png'):
            (self.elements / name).write_bytes(b'media fixture')
        (self.sounds / 'Background' / 'old music.mp3').write_bytes(b'0123456789')
        self.addCleanup(patch.stopall)
        for module in (assets, xml):
            patch.object(module, '_load_element_map', return_value=(self.auto, self.emap)).start()
            patch.object(module, '_load_sound_map', return_value=(self.bgm, self.sfx, self.auto_sfx)).start()

    def csv(self, name, rows):
        path = self.root / name
        with path.open('w', newline='', encoding='utf-8-sig') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        return str(path)

    def test_auto_combo_none_unknown_and_texture(self):
        source = self.csv('source.csv', [
            dict(doan='1', cau='1', loai_source='phong_van', element='auto', bgm='', sfx='auto'),
            dict(doan='1', cau='2', loai_source='phong_van', element='none', bgm='none', sfx='none'),
            dict(doan='1', cau='3', loai_source='rai_1', element='tv_retro + unknown', bgm='bgm_default', sfx='none'),
        ])
        report = assets.verify_assets(source, str(self.elements), str(self.sounds), 'paper_texture')
        by_code = {item['code']: item for item in report['items']}
        self.assertEqual((report['total'], report['missing']), (5, 2))
        self.assertEqual(by_code['unknown']['status'], 'unknown_code')
        self.assertEqual(by_code['tv_glitch']['status'], 'missing_file')
        self.assertEqual(len(by_code['tv_retro']['references']), 2)
        self.assertEqual(by_code['paper_texture']['references'], ['Texture toàn video (V4)'])

    def test_missing_root_and_invalid_csv(self):
        source = self.csv('source.csv', [dict(loai_source='phong_van')])
        report = assets.verify_assets(source)
        self.assertEqual(report['missing'], 3)
        self.assertTrue(all(item['status'] == 'invalid_path' for item in report['items']))
        bad = self.csv('bad.csv', [dict(text='wrong CSV')])
        with self.assertRaises(ValueError):
            assets.verify_assets(bad)

    def test_none_needs_no_assets_and_auto_skips_full_scope(self):
        self.auto['training'] = 'paper_texture'
        source = self.csv('source.csv', [dict(loai_source='training', element='auto', bgm='none', sfx='none')])
        self.assertEqual(assets.verify_assets(source)['total'], 0)
        self.assertTrue(assets.verify_assets(source)['all_ok'])

    def test_paths_cannot_escape_root(self):
        for relative in ('../private.txt', str(self.root / 'private.txt')):
            with self.assertRaises(ValueError):
                assets.contained_path(self.elements, relative)

    def prepare_migration(self):
        (self.root / 'templates').mkdir()
        (self.root / 'src').mkdir()
        data = {
            'element_map.json': dict(elements=self.emap, auto_map=self.auto),
            'sound_map.json': dict(bgm=self.bgm, sfx=self.sfx, auto_sfx_by_loai=self.auto_sfx),
            'classifications.json': dict(
                element_types=[dict(code='tv_retro', param='old frame.png', description='Giữ mô tả')],
                bgm_types=[dict(code='bgm_default', param='old music.mp3')], sfx_types=[]),
        }
        for name, value in data.items():
            (self.root / 'templates' / name).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
        (self.root / 'src' / 'renderer.js').write_text(
            "const DEFAULT_ELEMENT_TYPES = [\n{ code: 'tv_retro', param: 'old frame.png' }\n];\n"
            "const DEFAULT_BGM_TYPES = [\n{ code: 'bgm_default', param: 'old music.mp3' }\n];\n"
            "const DEFAULT_SFX_TYPES = [\n];\n", encoding='utf-8')
        return migration.build_plan(self.root, self.elements, self.sounds)

    def test_migration_dry_run_apply_and_idempotency(self):
        operations, edits = self.prepare_migration()
        self.assertTrue((self.elements / 'old frame.png').exists())
        self.assertFalse((self.elements / 'tv_retro.png').exists())
        self.assertEqual(sum(op['status'] == 'missing' for op in operations), 1)
        backup = migration.apply_plan(self.root, operations, edits)
        self.assertTrue((backup / 'manifest.json').is_file())
        self.assertEqual((self.elements / 'tv_retro.png').read_bytes(), b'media fixture')
        self.assertFalse((self.elements / 'old frame.png').exists())
        cls = json.loads((self.root / 'templates/classifications.json').read_text(encoding='utf-8'))
        self.assertEqual(cls['element_types'][0]['description'], 'Giữ mô tả')
        self.assertEqual(cls['element_types'][0]['param'], 'tv_retro.png')
        js = (self.root / 'src/renderer.js').read_text(encoding='utf-8')
        self.assertIn('"tv_retro.png"', js)
        operations2, edits2 = migration.build_plan(self.root, self.elements, self.sounds)
        self.assertFalse(edits2)
        self.assertFalse(any(op['status'] == 'rename' for op in operations2))

    def test_migration_refuses_collision(self):
        self.prepare_migration()
        (self.elements / 'tv_retro.png').write_bytes(b'keep destination')
        with self.assertRaises(ValueError):
            migration.build_plan(self.root, self.elements, self.sounds)
        self.assertEqual((self.elements / 'tv_retro.png').read_bytes(), b'keep destination')
        self.assertTrue((self.elements / 'old frame.png').exists())

    def test_migration_preserves_nested_sound_paths(self):
        album = self.sounds / 'Background/Album'
        album.mkdir()
        (self.sounds / 'Background/old music.mp3').rename(album / 'old music.mp3')
        self.bgm['bgm_default']['file'] = 'Background/Album/old music.mp3'
        operations, edits = self.prepare_migration()
        migration.apply_plan(self.root, operations, edits)
        cls = json.loads((self.root / 'templates/classifications.json').read_text(encoding='utf-8'))
        self.assertEqual(cls['bgm_types'][0]['param'], 'Background/Album/bgm_default.mp3')
        self.assertTrue((album / 'bgm_default.mp3').is_file())

    def test_migration_restores_files_on_metadata_failure(self):
        operations, edits = self.prepare_migration()
        originals = {path: path.read_bytes() for path in edits}
        with patch.object(Path, 'write_bytes', side_effect=OSError('disk write failed')):
            with self.assertRaises(OSError):
                migration.apply_plan(self.root, operations, edits)
        for path, content in originals.items():
            self.assertEqual(path.read_bytes(), content)
        self.assertTrue((self.elements / 'old frame.png').is_file())
        self.assertFalse((self.elements / 'tv_retro.png').exists())

    def test_export_uses_verified_paths(self):
        (self.sounds / 'SFX/tv_glitch.mp3').write_bytes(b'sfx')
        timeline = self.csv('timeline.csv', [dict(doan='1', cau='1', y='', start='0', text='Test')])
        source = self.csv('source.csv', [dict(doan='1', cau='1', y='', loai_source='phong_van', element='auto', bgm='auto', sfx='auto')])
        catalog = self.csv('catalog.csv', [dict(ten_file='clip.mp4', loai='phong_van', cau_thu='', doi_bong='', ky_nang='', duration_s='30')])
        output = self.root / 'export.xml'
        xml.generate_xml(timeline, source, catalog, str(self.root / 'voice.mp3'), str(self.root),
                         str(output), element_dir=str(self.elements), sound_root=str(self.sounds),
                         texture_id='paper_texture', enable_animations=False, log=lambda _: None)
        report = assets.verify_assets(source, str(self.elements), str(self.sounds), 'paper_texture')
        paths = {node.text for node in ET.parse(output).findall('.//pathurl')}
        for item in report['items']:
            self.assertIn(xml.path_to_url(item['path']), paths)
        self.assertTrue(report['all_ok'])

    def test_manual_blank_source_never_picks_unrelated_catalog_clip(self):
        timeline = self.csv('timeline.csv', [dict(doan='1', cau='1', y='', start='0', text='Cảnh chung kết cụ thể')])
        source = self.csv('source.csv', [dict(doan='1', cau='1', y='', loai_source='', element='', bgm='', sfx='')])
        catalog = self.csv('catalog.csv', [dict(ten_file='clip.mp4', loai='rai_1', duration_s='30')])
        output = self.root / 'manual.xml'
        with patch.object(xml, 'pick_clips') as pick:
            result = xml.generate_xml(timeline, source, catalog, str(self.root / 'voice.mp3'), str(self.root),
                                     str(output), enable_animations=False, log=lambda _: None)
        pick.assert_not_called()
        self.assertTrue(any('thu cong' in item for item in result['missing']))
        self.assertIn('CAN LAM THU CONG', output.read_text(encoding='utf-8'))

    def test_export_skips_missing_optional_media(self):
        timeline = self.csv('timeline.csv', [dict(doan='1', cau='1', y='', start='0', text='Test')])
        source = self.csv('source.csv', [dict(doan='1', cau='1', y='', loai_source='phong_van', element='tv_retro + unknown', bgm='auto', sfx='auto')])
        catalog = self.csv('catalog.csv', [dict(ten_file='clip.mp4', loai='phong_van', duration_s='30')])
        (self.elements / 'old frame.png').unlink()
        (self.elements / 'paper.png').unlink()
        (self.sounds / 'Background/old music.mp3').unlink()
        output = self.root / 'missing.xml'
        result = xml.generate_xml(timeline, source, catalog, str(self.root / 'voice.mp3'), str(self.root),
                                  str(output), element_dir=str(self.elements), sound_root=str(self.sounds),
                                  texture_id='paper_texture', enable_animations=False, log=lambda _: None)
        self.assertEqual(result['total_elements'], 0)
        self.assertEqual(result['total_bgm_clips'], 0)
        self.assertEqual(result['total_sfx_clips'], 0)
        self.assertEqual(len(result['skipped_assets']), 5)
        paths = {node.text for node in ET.parse(output).findall('.//pathurl')}
        self.assertFalse(any('Elements/' in path or 'Sounds/' in path for path in paths))
        self.assertIn(xml.path_to_url(str(self.root / 'voice.mp3')), paths)

    def test_bgm_none_gap_is_preserved_and_whitespace_resolves_auto(self):
        timeline = self.csv('timeline.csv', [dict(doan='1', cau=str(i), y='', start=str((i-1)*5), text='Test') for i in range(1, 4)])
        source = self.csv('source.csv', [dict(doan='1', cau=str(i), y='', loai_source='rai_1', element='none', bgm=value, sfx='none')
                                        for i, value in enumerate(('   ', 'none', 'auto'), 1)])
        catalog = self.csv('catalog.csv', [dict(ten_file='clip.mp4', loai='rai_1', duration_s='30')])
        output = self.root / 'gap.xml'
        result = xml.generate_xml(timeline, source, catalog, str(self.root / 'voice.mp3'), str(self.root),
                                  str(output), sound_root=str(self.sounds), enable_animations=False, log=lambda _: None)
        self.assertEqual(result['total_bgm_clips'], 2)
        clips = ET.parse(output).findall('.//audio/track')[1].findall('clipitem')
        self.assertEqual(clips[0].findtext('end'), '150')
        self.assertEqual(clips[1].findtext('start'), '300')
        report = assets.verify_assets(source, str(self.elements), str(self.sounds))
        self.assertEqual(len(report['items'][0]['references']), 2)

    def test_api_verification_and_media_ranges(self):
        # Avoid SourceSuggester's production-folder creation during API unit tests.
        from source_suggester import SourceSuggester
        with patch.object(SourceSuggester, '__init__', return_value=None):
            backend = importlib.import_module('main')
        client = backend.app.test_client()
        source = self.csv('source.csv', [dict(loai_source='phong_van')])
        params = dict(source_plan_csv=source, element_dir=str(self.elements), sound_root=str(self.sounds))
        report = client.post('/api/verify-assets', json=params)
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.json['missing'], 1)
        self.assertEqual(client.post('/api/verify-assets', json={}).status_code, 400)
        previews = client.post('/api/asset-thumbnail', json=params)
        self.assertEqual(previews.status_code, 200)
        bgm = next(item for item in previews.json['items'] if item['kind'] == 'bgm')
        with client.get(bgm['url'], headers={'Range': 'bytes=2-5'}) as stream:
            self.assertEqual(stream.status_code, 206)
            self.assertEqual(stream.data, b'2345')
            self.assertEqual(stream.headers['Content-Type'], 'audio/mpeg')
            self.assertEqual(stream.cache_control.max_age, 3600)
            self.assertTrue(stream.cache_control.private)
            etag = stream.headers['ETag']
        with client.get(bgm['url'], headers={'If-None-Match': etag}) as cached:
            self.assertEqual(cached.status_code, 304)
        (self.sounds / 'Background/old music.mp3').write_bytes(b'new media contents')
        refreshed = client.post('/api/asset-thumbnail', json=params)
        new_bgm = next(item for item in refreshed.json['items'] if item['kind'] == 'bgm')
        self.assertNotEqual(bgm['url'], new_bgm['url'])
        with client.get(bgm['url']) as outdated:
            self.assertEqual(outdated.cache_control.max_age, 0)
        with client.get(new_bgm['url']) as updated:
            self.assertEqual(updated.data, b'new media contents')
            self.assertEqual(updated.cache_control.max_age, 3600)
        self.assertEqual(client.get('/api/asset-thumbnail/unknown/asset.mp3').status_code, 404)


if __name__ == '__main__':
    unittest.main()
