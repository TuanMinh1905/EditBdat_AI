"""Dry-run by default; --apply renames assets and synchronizes JSON/JS mappings.

Existing destinations are never overwritten. Backups and a manifest are retained
in output/asset_migrations; failures restore files changed during this run.
"""

import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import shutil
import sys

from asset_service import DEFAULT_ELEMENT_DIR, DEFAULT_SOUND_ROOT, contained_path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def build_plan(project_root, element_dir, sound_root):
    """Prepare and validate every rename and metadata edit without writes."""
    project_root = Path(project_root).resolve()
    paths = [project_root / 'templates' / name for name in
             ('element_map.json', 'sound_map.json', 'classifications.json')]
    documents = [json.loads(p.read_text(encoding='utf-8-sig')) for p in paths]
    element_map, sound_map, classifications = documents
    renderer = project_root / 'src' / 'renderer.js'
    js = renderer.read_text(encoding='utf-8-sig')
    operations = []
    claimed = set()
    for kind, mapping, root, table, constant in [
        ('element', element_map['elements'], element_dir, 'element_types', 'DEFAULT_ELEMENT_TYPES'),
        ('bgm', sound_map['bgm'], sound_root, 'bgm_types', 'DEFAULT_BGM_TYPES'),
        ('sfx', sound_map['sfx'], sound_root, 'sfx_types', 'DEFAULT_SFX_TYPES'),
    ]:
        for code, definition in mapping.items():
            if code in ('auto', 'none') or code.startswith('_'):
                continue
            if not isinstance(definition, dict) or not definition.get('file'):
                raise ValueError(f'Mapping thiếu file: {kind}/{code}')
            if not re.fullmatch(r'[a-zA-Z0-9_\-]+', code):
                raise ValueError(f'Mã không hợp lệ để đặt tên file: {code}')
            old = definition['file']
            rel = Path(old)
            new = (rel.parent / (code + rel.suffix.lower())).as_posix()
            source = contained_path(root, old)
            destination = contained_path(root, new)
            key = str(destination).casefold()
            if key in claimed:
                raise ValueError(f'Nhiều mã cùng trỏ tới đích: {destination}')
            claimed.add(key)
            if source != destination and source.exists() and destination.exists():
                raise ValueError(f'Trùng tên đích, không ghi đè: {destination}')
            if source.is_file():
                status = 'unchanged' if source == destination else 'rename'
            elif destination.is_file():
                status = 'already_renamed'
            else:
                status = 'missing'
            operations.append(dict(kind=kind, code=code, source=str(source),
                                   destination=str(destination), status=status))
            if status == 'missing':
                continue  # Do not point a missing source at a fictitious new file.
            definition['file'] = new
            default_folder = 'Background' if kind == 'bgm' else 'SFX'
            param = Path(new).name if kind != 'element' and Path(new).parent.as_posix() == default_folder else new
            for item in classifications.get(table, []):
                if item.get('code') == code:
                    item['param'] = param
                    # Preserve custom examples; only migrate direct file references.
                    image = item.get('image', '')
                    if image == source.as_uri():
                        item['image'] = destination.as_uri()
            pattern = r'(const ' + constant + r' = \[)(.*?)(\n\];)'
            block = re.search(pattern, js, re.S)
            if not block:
                raise ValueError(f'Không tìm thấy {constant} trong renderer.js')
            param_pattern = (r"(\{ code: '" + re.escape(code) + r"'[^\n]*?param: )"
                             + r'''(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')''')
            replacement = param
            body = re.sub(param_pattern, lambda m: m[1] + json.dumps(replacement, ensure_ascii=False), block[2])
            js = js[:block.start(2)] + body + js[block.end(2):]
    edits = {p: (json.dumps(d, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
             for p, d in zip(paths, documents)}
    edits[renderer] = js.encode('utf-8')
    # Avoid writes on subsequent runs, including newline-only changes.
    edits = {p: content for p, content in edits.items()
             if p.read_text(encoding='utf-8-sig') != content.decode('utf-8')}
    return operations, edits


def apply_plan(project_root, operations, edits):
    """Apply preflighted operations; keep backups and roll back on failure."""
    renames = [op for op in operations if op['status'] == 'rename']
    if not renames and not edits:
        return None
    root = Path(project_root).resolve()
    backup = root / 'output' / 'asset_migrations' / datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    backup.mkdir(parents=True)
    for path in edits:
        target = backup / path.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    manifest = dict(operations=operations, edited_files=[str(p.relative_to(root)) for p in edits],
                    state='prepared')
    manifest_path = backup / 'manifest.json'

    def save_manifest():
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    save_manifest()
    moved, written = [], []
    try:
        for op in renames:
            source, destination = Path(op['source']), Path(op['destination'])
            if destination.exists():
                raise FileExistsError(f'Đích đã tồn tại: {destination}')
            source.rename(destination)
            moved.append((source, destination))
        for path, content in edits.items():
            written.append(path)
            path.write_bytes(content)
        manifest['state'] = 'complete'
        save_manifest()
    except Exception:
        for path in reversed(written):
            shutil.copy2(backup / path.relative_to(root), path)
        for source, destination in reversed(moved):
            if source.exists():
                raise RuntimeError(f'Không thể khôi phục vì tên cũ đã tồn tại: {source}')
            destination.rename(source)
        manifest['state'] = 'rolled_back'
        save_manifest()
        raise
    return backup


def main():
    """Print a reviewable plan; mutate only with an explicit --apply flag."""
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--element-dir', default=DEFAULT_ELEMENT_DIR)
    parser.add_argument('--sound-root', default=DEFAULT_SOUND_ROOT)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        operations, edits = build_plan(PROJECT_ROOT, args.element_dir, args.sound_root)
        for op in operations:
            print(f"[{op['status']}] {op['kind']}/{op['code']}: {op['source']} -> {op['destination']}")
        print(f"Rename: {sum(op['status'] == 'rename' for op in operations)}; "
              f"missing: {sum(op['status'] == 'missing' for op in operations)}; metadata: {len(edits)}")
        if args.apply:
            backup = apply_plan(PROJECT_ROOT, operations, edits)
            print(f'Backup: {backup}' if backup else 'Không có thay đổi cần áp dụng.')
        else:
            print('DRY RUN: chưa đổi tên hoặc ghi file. Dùng --apply để áp dụng.')
        return 0
    except Exception as exc:
        print(f'Lỗi: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
