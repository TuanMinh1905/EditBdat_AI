"""
Build Sample — Sinh file .jsx từ một timeline JSON có sẵn (KHÔNG gọi Gemini).

Dùng để thử nhanh thư viện preset trong After Effects và để kiểm tra cú pháp script.

Cách dùng (từ thư mục gốc project):
    python python/build_sample.py
    python python/build_sample.py templates/samples/demo_presets.timeline.json output/demo.jsx
"""

import io
import json
import os
import sys

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, OSError):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from jsx_generator import JSXGenerator
from timeline_validator import TimelineValidator

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def log(message):
    """In log an toàn encoding."""
    print(message, flush=True)


def main():
    """Đọc timeline mẫu, validate, sinh .jsx."""
    timeline_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'templates', 'samples', 'demo_presets.timeline.json')
    jsx_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'output', 'demo_presets.jsx')
    jsx_path = os.path.abspath(jsx_path)
    aep_path = os.path.splitext(jsx_path)[0] + '.aep'

    try:
        with open(timeline_path, 'r', encoding='utf-8') as f:
            timeline = json.load(f)

        result = TimelineValidator().validate(timeline, media_context=[])
        for w in result['warnings']:
            log(f"[cảnh báo] {w}")
        if not result['valid']:
            for e in result['errors']:
                log(f"[lỗi] {e}")
            sys.exit(1)

        os.makedirs(os.path.dirname(jsx_path), exist_ok=True)
        content = JSXGenerator().generate(timeline, [], aep_path)
        with open(jsx_path, 'w', encoding='utf-8') as f:
            f.write(content)
        log(f"Đã tạo: {jsx_path}")
        log(f"Chạy trong After Effects: File > Scripts > Run Script File... > chọn file trên")
        log(f"File .aep sẽ được lưu: {aep_path}")
        log(f"Nhật ký lỗi (nếu có): {aep_path}.log.txt")
    except Exception as e:
        log(f"Lỗi: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
