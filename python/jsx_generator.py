"""
JSX Generator — Sinh ExtendScript (.jsx) cho After Effects từ timeline JSON

Python chỉ làm nhiệm vụ "đóng gói": nhúng thư viện templates/ae_runtime.jsx, brand kit,
rồi gọi các hàm runtime (AI.runLayer / AI.run / AI.runTransition) với tham số JSON.
Toàn bộ logic dựng nằm trong ae_runtime.jsx để dễ chỉnh sửa và kiểm chứng.
"""

import json
import os

BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RUNTIME_PATH = os.path.join(BASE_DIR, 'templates', 'ae_runtime.jsx')
BRAND_KIT_PATH = os.path.join(BASE_DIR, 'templates', 'brand_kit.json')

# Brand kit dự phòng nếu không đọc được templates/brand_kit.json
DEFAULT_BRAND = {
    "fonts": {"title": "Arial-BoldMT", "body": "ArialMT", "number": "Arial-BoldMT"},
    "colors": {
        "bg": [0.04, 0.055, 0.09], "gridLine": [0.17, 0.22, 0.33], "card": [0.075, 0.105, 0.175],
        "cardStroke": [0.25, 0.33, 0.5], "text": [1, 1, 1], "textDim": [0.62, 0.68, 0.78],
        "dark": [0.03, 0.04, 0.07], "accent": [0.0, 0.62, 1.0], "accent2": [0.98, 0.78, 0.1],
        "alert": [1.0, 0.24, 0.24], "good": [0.2, 0.85, 0.5], "barcaBlue": [0.0, 0.3, 0.6],
        "barcaGarnet": [0.72, 0.05, 0.3], "pitch": [0.06, 0.19, 0.12], "pitchLine": [0.85, 0.92, 0.88]
    },
    "motion": {"enterDuration": 0.45, "staggerStep": 0.25, "easeInfluence": 85, "typewriterCps": 22, "fadeOut": 0.3}
}


def js(value):
    """Chuyển giá trị Python thành literal JavaScript (ASCII thuần, an toàn encoding)."""
    return json.dumps(value, ensure_ascii=True)


class JSXGenerator:
    """Sinh script .jsx từ timeline JSON để After Effects thực thi."""

    def __init__(self):
        self.runtime_code = self._load_text(RUNTIME_PATH)
        self.brand = self._load_brand()

    def _load_text(self, path):
        """Đọc file text UTF-8, trả về chuỗi rỗng nếu lỗi."""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            return ''

    def _load_brand(self):
        """Đọc brand kit, tự điền phần thiếu từ DEFAULT_BRAND."""
        brand = json.loads(json.dumps(DEFAULT_BRAND))
        try:
            with open(BRAND_KIT_PATH, 'r', encoding='utf-8') as f:
                custom = json.load(f)
            for section in ('fonts', 'colors', 'motion'):
                if isinstance(custom.get(section), dict):
                    brand[section].update(custom[section])
        except Exception:
            pass
        return brand

    def generate(self, timeline, media_files, aep_output_path):
        """
        Sinh script JSX hoàn chỉnh.

        Args:
            timeline: dict - Timeline JSON
            media_files: list - Danh sách media files với path
            aep_output_path: str - Đường dẫn file .aep output

        Returns:
            str: Nội dung script JSX
        """
        if not self.runtime_code:
            raise RuntimeError(f"Không đọc được thư viện runtime: {RUNTIME_PATH}")

        comp = timeline.get('composition', {})
        layers = timeline.get('layers', [])
        transitions = timeline.get('transitions', [])

        source_paths = {}
        for mf in media_files:
            source_paths[mf['name']] = mf['path'].replace('\\', '/')

        parts = [
            self._header(),
            self.runtime_code,
            self._begin(),
            self._create_project(),
            self._import_footage(source_paths),
            self._create_composition(comp, aep_output_path),
            self._add_layers(layers, comp),
            self._apply_transitions(transitions),
            self._save_project(aep_output_path),
            self._footer(),
        ]
        return '\n'.join(parts)

    def _header(self):
        return """// ============================================
// AE AI Tool — Auto-generated ExtendScript
// ============================================
// WARNING: This script is auto-generated. Do not edit manually.

#target aftereffects
"""

    def _begin(self):
        return """
(function() {
    // Suppress all dialogs
    app.beginSuppressDialogs();
    var __logPath = "";

    try {
"""

    def _footer(self):
        return """
    } catch (err) {
        AI.log("FATAL: " + err.toString());
        alert("AE AI Tool Error: " + err.toString());
    } finally {
        AI.flushLog();
        app.endSuppressDialogs(false);
    }
})();
"""

    def _create_project(self):
        return """
        // --- Create new project ---
        if (app.project) {
            app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        }
        app.newProject();
"""

    def _import_footage(self, source_paths):
        """Sinh code import tất cả footage files."""
        lines = ["\n        // --- Import footage ---", "        var importedFiles = {};"]
        for name, path in source_paths.items():
            lines.append(f"""
        try {{
            var io = new ImportOptions(new File({js(path)}));
            importedFiles[{js(name)}] = app.project.importFile(io);
        }} catch (e) {{
            // File import failed
            AI.log("import lỗi: " + {js(name)} + " - " + e.toString());
        }}""")
        return '\n'.join(lines)

    def _create_composition(self, comp, aep_path):
        """Sinh code tạo composition và khởi tạo runtime."""
        name = comp.get('name', 'Main Comp')
        width = int(comp.get('width', 1920))
        height = int(comp.get('height', 1080))
        fps = comp.get('fps', 30)
        duration = comp.get('duration', 30)
        bg = comp.get('backgroundColor', self.brand['colors']['bg'])
        log_path = (aep_path.replace('\\', '/') + '.log.txt')

        return f"""
        // --- Create composition ---
        var comp = app.project.items.addComp(
            {js(name)},
            {width},
            {height},
            1,          // pixel aspect ratio
            {duration},
            {fps}
        );
        comp.bgColor = [{bg[0]}, {bg[1]}, {bg[2]}];
        AI.init(comp, {js(self.brand)}, importedFiles, {js(log_path)});
"""

    def _add_layers(self, layers, comp):
        """Sinh code thêm layers. Duyệt NGƯỢC để layer đầu tiên của mảng nằm trên cùng."""
        comp_duration = comp.get('duration', 30)
        lines = ["\n        // --- Add layers (phần tử đầu mảng = layer trên cùng) ---"]
        lines.append(f"        var layer_refs = [];")
        for i in range(len(layers)):
            lines.append(f"        layer_refs[{i}] = null;")

        for i in range(len(layers) - 1, -1, -1):
            layer = layers[i]
            layer_type = layer.get('type', 'footage')
            lines.append(f"\n        // Layer {i}: {layer.get('name', '')}")
            if layer_type == 'preset':
                start = layer.get('startTime', 0)
                dur = layer.get('duration') or max(comp_duration - start, 1)
                lines.append(
                    f"        layer_refs[{i}] = AI.layerOf(AI.run({js(layer.get('preset', ''))}, "
                    f"{js(layer.get('params', {}))}, {start}, {dur}));"
                )
            else:
                lines.append(f"        layer_refs[{i}] = AI.runLayer({js(layer)});")

        return '\n'.join(lines)

    def _apply_transitions(self, transitions):
        """Sinh code áp dụng transitions giữa layers (không dịch thời gian layer)."""
        if not transitions:
            return "\n        // No transitions"

        lines = ["\n        // --- Apply transitions ---"]
        for t in transitions:
            lines.append(
                f"        AI.runTransition({js(t.get('type', 'crossDissolve'))}, "
                f"layer_refs[{int(t.get('fromLayerIndex', 0))}], layer_refs[{int(t.get('toLayerIndex', 1))}], "
                f"{t.get('duration', 1)});"
            )
        return '\n'.join(lines)

    def _save_project(self, aep_path):
        """Sinh code lưu project."""
        escaped = aep_path.replace('\\', '/')
        return f"""
        // --- Save project ---
        var outputFile = new File({js(escaped)});
        app.project.save(outputFile);
        AI.log("saved: " + outputFile.fsName);
"""
