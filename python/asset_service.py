"""Resolve and inspect mapped assets without modifying the media library."""

from pathlib import Path
from source_metadata import normalize_plan_row

from premiere_xml_generator import (
    _load_element_map, _load_sound_map, read_csv,
    resolve_element_ids, resolve_sound_code,
    contained_asset_path,
)

DEFAULT_ELEMENT_DIR = r"D:\Edit SofaZone\01_Tai_Nguyen_Co_Dinh\Elements"
DEFAULT_SOUND_ROOT = r"D:\Edit SofaZone\01_Tai_Nguyen_Co_Dinh\Sounds"
MEDIA_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp',
                    '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v',
                    '.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'}


def contained_path(root, relative):
    """Require a nonempty relative file path strictly within the selected root."""
    return contained_asset_path(root, relative)


def inspect_asset(kind, code, definitions, root):
    """Return the exact mapped path and an actionable status for one asset."""
    result = dict(kind=kind, code=code, file='', path='', exists=False, status='unknown_code')
    definition = definitions.get(code)
    if definition is None:
        result['message'] = 'Mã chưa có trong mapping'
        return result
    result['file'] = definition.get('file', '')
    try:
        path = contained_path(root, result['file'])
        result.update(path=str(path), exists=path.is_file())
        result['status'] = 'ok' if result['exists'] else 'missing_file'
        result['message'] = 'Có file' if result['exists'] else 'Không tìm thấy file'
    except (ValueError, OSError) as exc:
        result.update(status='invalid_path', message=str(exc))
    return result


def list_assets(element_dir, sound_root, sound_map_path=None):
    """Inspect all mappings for preview discovery."""
    _, elements = _load_element_map()
    bgm, sfx, _ = _load_sound_map(sound_map_path)
    return [inspect_asset(kind, code, mapping, root)
            for kind, mapping, root in [('element', elements, element_dir),
                                        ('bgm', bgm, sound_root), ('sfx', sfx, sound_root)]
            for code in mapping if code not in ('auto', 'none') and not code.startswith('_')]


def verify_assets(source_plan_csv, element_dir=None, sound_root=None,
                  texture_id=None, sound_map_path=None):
    """Check all asset references in a source-plan CSV, including auto and texture."""
    if not source_plan_csv or not Path(source_plan_csv).is_file():
        raise ValueError('Không tìm thấy CSV phân loại Source')
    rows = read_csv(source_plan_csv)
    if not rows or 'loai_source' not in rows[0]:
        raise ValueError('CSV phân loại phải có cột loai_source và ít nhất một dòng')
    rows = [normalize_plan_row(r) for r in rows]
    auto_map, elements = _load_element_map()
    bgm, sfx, auto_sfx = _load_sound_map(sound_map_path)
    found = {}

    def add(kind, code, mapping, root, reference):
        key = (kind, code)
        if key not in found:
            found[key] = inspect_asset(kind, code, mapping, root)
            found[key]['references'] = []
        if reference not in found[key]['references']:
            found[key]['references'].append(reference)

    for index, row in enumerate(rows, 2):
        reference = f"Dòng {index} (Đ{row.get('doan', '')}/C{row.get('cau', '')}/Ý{row.get('y', '')})"
        loai = row.get('loai_source') or ''
        element = (row.get('element') or '').strip()
        for code in resolve_element_ids(loai, element, auto_map):
            if element.lower() in ('', 'auto') and elements.get(code, {}).get('scope') == 'full':
                continue  # Generator only places auto clip-scope overlays on V3.
            add('element', code, elements, element_dir, reference)
        for kind, mapping in [('bgm', bgm), ('sfx', sfx)]:
            code = resolve_sound_code(kind, row.get(kind), loai, auto_sfx)
            if code:
                add(kind, code, mapping, sound_root, reference)
    for code in (texture_id or '').split('+'):
        if code.strip():
            add('element', code.strip(), elements, element_dir, 'Texture toàn video (V4)')
    items = list(found.values())
    missing = sum(not item['exists'] for item in items)
    return dict(items=items, total=len(items), missing=missing,
                ok=len(items) - missing, all_ok=missing == 0, rows=len(rows))
