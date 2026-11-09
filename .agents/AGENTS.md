# AE AI Tool — Project Rules

> File này là **luật chơi bắt buộc** cho toàn bộ project. Mọi tính năng mới, mọi sửa đổi code đều phải tuân theo các quy tắc dưới đây. Nếu cần thay đổi Rule, phải ghi lại lý do trong mục "Lịch sử thay đổi Rule" ở cuối file.
>
> **AI: Luôn đọc file này trước khi viết code. Sau khi hoàn thành chức năng mới, tự động update file này.**

---

## 1. Tech Stack & Phiên bản

| Thành phần | Công nghệ | Phiên bản | Ghi chú |
|---|---|---|---|
| Desktop UI | Electron | 28.x | Frameless window, custom titlebar |
| Frontend | HTML + Vanilla CSS + Vanilla JS | — | KHÔNG dùng framework (React, Vue...) |
| Backend | Python | 3.13 | Chạy như child process của Electron |
| Web server | Flask + waitress | Flask 3.1, waitress 3.0 | Chạy local tại `127.0.0.1:5599` |
| AI API | Google Gemini | gemini-3.8-flash | Qua thư viện `google-genai` |
| Media analysis | FFprobe | 8.x | Đã cài sẵn trên máy |
| After Effects | ExtendScript (.jsx) | AE 2021 | Path: `C:\Program Files\Adobe\Adobe After Effects 2021\Support Files\AfterFX.exe` |
| OS | Windows | 10/11 | Encoding mặc định là `cp1252`, cần xử lý UTF-8 |

**Quy tắc:** Không thay đổi tech stack khi chưa có lý do rõ ràng và ghi lại.

---

## 2. Cấu trúc thư mục

```
Code_AI/
├── .agents/
│   └── AGENTS.md                    ← FILE NÀY — Rule chính
├── package.json                     # Electron config
├── main.js                          # Electron main process
├── preload.js                       # IPC bridge (contextBridge)
├── src/                             # ── FRONTEND ──
│   ├── index.html                   # UI chính (5 tab: Tạo mới, Cắt Clip, Gen XML, Quy tắc, Cài đặt)
│   ├── index.css                    # CSS duy nhất (design system)
│   └── renderer.js                  # UI logic chính
├── python/                          # ── BACKEND ──
│   ├── requirements.txt             # Python dependencies
│   ├── main.py                      # Flask API server (entry point, port 5599)
│   ├── media_analyzer.py            # Phân tích media bằng FFprobe
│   ├── gemini_client.py             # Gọi Gemini API
│   ├── timeline_validator.py        # Validate timeline JSON
│   ├── jsx_generator.py             # Sinh script .jsx cho After Effects
│   ├── clip_splitter.py             # Tool B: cắt highlight → clip nhỏ + catalog.csv
│   └── premiere_xml_generator.py    # Tool A: sinh FCP XML (xmeml v4) cho Premiere Pro
├── schemas/
│   └── timeline.schema.json         # JSON Schema cho timeline
├── templates/                       # Template JSX, preset effects
├── output/                          # Thư mục chứa .jsx và .aep output
└── doc/                             # Tài liệu, ghi chú
```

### Quy tắc thư mục:
- **Frontend** (HTML/CSS/JS) chỉ nằm trong `src/`
- **Backend** (Python) chỉ nằm trong `python/`
- **Schema** nằm trong `schemas/`
- **Template/Preset** nằm trong `templates/`
- **Tài liệu** nằm trong `doc/`
- **KHÔNG** tạo file code trực tiếp ở thư mục gốc (trừ `main.js`, `preload.js`, `package.json`)

---

## 3. Kiến trúc hệ thống

```
┌──────────────────────────────────────────────┐
│              Electron (main.js)               │
│  ┌──────────┐          ┌──────────────────┐  │
│  │ Renderer │◄──IPC──►│ Main Process      │  │
│  │ (UI)     │          │ (spawn Python,    │  │
│  │          │          │  HTTP calls)      │  │
│  └──────────┘          └────────┬─────────┘  │
│                                 │ HTTP        │
│                        ┌────────▼─────────┐  │
│                        │ Python Flask API  │  │
│                        │ (port 5599)       │  │
│                        └────────┬─────────┘  │
│                                 │ subprocess  │
│                        ┌────────▼─────────┐  │
│                        │ After Effects     │  │
│                        │ (AfterFX.exe -r)  │  │
│                        └──────────────────┘  │
└──────────────────────────────────────────────┘
```

### Luồng giao tiếp:
1. **Renderer ↔ Main Process:** qua `ipcMain.handle()` + `ipcRenderer.invoke()` (contextBridge)
2. **Main Process → Python:** qua HTTP POST đến `127.0.0.1:5599`
3. **Python → After Effects:** qua `subprocess.run(['AfterFX.exe', '-r', 'script.jsx'])`

### Quy tắc:
- Renderer **KHÔNG BAO GIỜ** gọi trực tiếp Python hay After Effects
- Mọi giao tiếp phải đi qua **preload.js** (contextBridge) → **main.js** (IPC handler) → **Python** (HTTP)
- Python backend chạy ở `127.0.0.1:5599`, không expose ra ngoài

---

## 4. Quy tắc đặt tên

### Files:
- Python: `snake_case.py` (ví dụ: `media_analyzer.py`)
- JavaScript: `camelCase.js` (ví dụ: `renderer.js`)
- CSS: `kebab-case.css` hoặc tên tương ứng HTML
- JSX templates: `snake_case.jsx`
- Schemas: `snake_case.schema.json`

### Biến & hàm:
- **Python:** `snake_case` cho hàm và biến, `PascalCase` cho class
- **JavaScript:** `camelCase` cho hàm và biến, `PascalCase` cho class
- **CSS:** `kebab-case` cho class, dùng CSS Variables (`--tên-biến`)
- **IPC channels:** `kebab-case` (ví dụ: `'select-files'`, `'generate-project'`)
- **API endpoints:** `/api/kebab-case` (ví dụ: `/api/analyze`, `/api/generate`)

### HTML IDs:
- `kebab-case`, mô tả rõ ràng (ví dụ: `btn-generate`, `media-list`, `setting-api-key`)

---

## 5. Quy trình thêm tính năng mới

### Checklist bắt buộc:
1. ☐ Xác định tính năng thuộc phần nào: **Frontend** (src/) hay **Backend** (python/) hay **cả hai**
2. ☐ Nếu cần API endpoint mới → thêm trong `python/main.py`
3. ☐ Nếu cần IPC channel mới → thêm trong `main.js` (handler) + `preload.js` (expose) + `renderer.js` (gọi)
4. ☐ Nếu thay đổi timeline JSON → cập nhật `schemas/timeline.schema.json`
5. ☐ Nếu thêm effect/transition mới → cập nhật `jsx_generator.py` + schema
6. ☐ Error handling: mọi API call phải có try/catch
7. ☐ Log: dùng hàm `log()` trong Python, `addLog()` trong JS
8. ☐ **Update file AGENTS.md này** nếu có thay đổi cấu trúc hoặc quy tắc mới

### Thứ tự thực hiện:
1. **Schema first** — Nếu ảnh hưởng data flow, sửa schema trước
2. **Backend** — Viết Python logic/API endpoint
3. **IPC bridge** — Thêm handler trong main.js + preload.js
4. **Frontend** — Thêm UI + gọi API
5. **Test** — Chạy app kiểm tra
6. **Update Rule** — Ghi lại thay đổi

---

## 6. Coding Style

### Python:
```python
# Mọi hàm public phải có docstring
def analyze(self, filepath):
    """Phân tích một media file, trả về metadata dict."""
    ...

# Error handling bắt buộc
try:
    result = do_something()
except Exception as e:
    log(f"Lỗi: {str(e)}")
    return {"error": str(e)}

# Import thứ tự: stdlib → third-party → local
import os
import json
from flask import Flask
from media_analyzer import MediaAnalyzer
```

### JavaScript:
```javascript
// DOM elements gom vào object `dom`
const dom = {
  btnGenerate: $('#btn-generate'),
  mediaList: $('#media-list')
};

// State gom vào object `state`
const state = {
  mediaFiles: [],
  isGenerating: false
};

// Error handling bắt buộc cho mọi async call
try {
  const result = await window.api.someCall();
  if (result.error) throw new Error(result.error);
} catch (err) {
  addLog(`Lỗi: ${err.message}`, 'error');
}
```

### CSS:
```css
/* Dùng CSS Variables (design tokens) trong :root */
:root {
  --bg-primary: #07070d;
  --accent-primary: #8B5CF6;
  --transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Class names mô tả rõ ràng */
.media-item { }
.btn-generate { }
.progress-fill { }
```

### ExtendScript (.jsx):
```javascript
// Luôn bọc trong IIFE và suppress dialogs
(function() {
    app.beginSuppressDialogs();
    try {
        // ... code ...
    } catch (err) {
        alert("AE AI Tool Error: " + err.toString());
    } finally {
        app.endSuppressDialogs(false);
    }
})();

// Mọi thao tác effect/property phải try/catch riêng
try {
    var effect = layer.property("Effects").addProperty("ADBE Gaussian Blur 2");
} catch(e) { /* Effect không khả dụng */ }
```

---

## 7. Lỗi đã gặp & Cách phòng tránh

| # | Lỗi | Nguyên nhân | Cách phòng |
|---|---|---|---|
| 1 | `UnicodeEncodeError: 'charmap' codec can't encode` | Windows console dùng `cp1252`, không hỗ trợ tiếng Việt | **Bắt buộc** thêm code fix encoding ở đầu `main.py`: `sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')` |
| 2 | `500 Internal Server Error` trả về HTML thay vì JSON | Flask exception không được catch | `callPython()` trong `main.js` phải xử lý cả response HTML (status >= 500) |
| 3 | `cache_util_win.cc: Unable to move cache` | Electron GPU cache conflict trên Windows | Thêm `app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')` trong `main.js` |
| 4 | Python process thoát nhưng port vẫn bị chiếm | Process cũ chưa release port | Cần kill process trên port 5599 trước khi start lại |
| 5 | `gemini-3.8-flash` trả `text=None`, `finish_reason=MAX_TOKENS` | Thinking model dùng hết output tokens cho thinking, không còn cho response | Dùng `types.GenerateContentConfig` với `ThinkingConfig(thinking_budget=4096)` và tăng `max_output_tokens` lên 16384+ |
| 6 | AE: `Unable to call "setValueAtTime" - Value is not an array` | `jsx_generator.py` không phân biệt kiểu giá trị (array vs số) cho từng property | Thêm `_format_keyframe_value()` — position/scale cần array, opacity/rotation cần số đơn |
| 7 | `404 NOT_FOUND: model models/gemini-2.x-flash is no longer available` | Google thường xuyên deprecate model cũ | Luôn dùng tên model mới nhất trong `gemini_client.py`. Hiện tại: `gemini-3.8-flash`. Kiểm tra AGENTS.md mục Tech Stack trước khi đổi |
| 8 | Premiere "File Import Failure" khi import XML | `pathurl` trong XML chứa khoảng trắng chưa encode | Dùng `urllib.parse.quote()` với `safe='/:.-_'` để URL-encode path → `D:/Edit%20SofaZone/...` |
| 9 | Premiere import XML thành công nhưng không thấy sequence trong timeline | `<sequence>` element thiếu `id` attribute | Bắt buộc thêm `id="sequence-1"` vào thẻ `<sequence>` trong FCP XML |
| 10 | `pick_clips()` trả về 0 clips dù catalog có dữ liệu | Key lookup dùng `'mixed'` không khớp với giá trị thực trong catalog | Dùng `norm()` cho cả key lẫn lookup; index theo `(norm(loai), norm(cau_thu))` |
| 11 | `app.commandLine` TypeError khi khởi động Electron | `app.commandLine.appendSwitch()` gọi trực tiếp có thể fail nếu electron context chưa sẵn | Bọc bằng guard: `if (app && app.commandLine) { app.commandLine.appendSwitch(...) }` |
| 12 | `npm start` chạy từ terminal agent bị lỗi / không hiện UI | Electron cần môi trường GUI Windows thật, không chạy được headless | Luôn yêu cầu user tự chạy `npm start` trên terminal máy, không dùng agent terminal |
| 13 | PowerShell không nhận `&&` để nối lệnh | PowerShell dùng `;` thay vì `&&` như bash | Dùng `cd "path"; npm start` thay vì `cd "path" && npm start` |
| 14 | `edit_file` báo "target not found" dù nhìn có vẻ đúng | Whitespace hoặc escape character không khớp chính xác byte-by-byte | Dùng Python script đọc file → thay thế theo line number → ghi lại. Tránh dùng `edit_file` cho JS/regex phức tạp |
| 15 | Tab HTML mới thêm vào bị đen/không hiện nội dung | `<main>` tab bị đặt ngoài `.app-container` → không có CSS sizing | Mọi tab mới phải nằm bên trong `<div class="app-container">`, trước `</div>` đóng container đó |
| 16 | Tab mới thiếu CSS `display: flex; flex-direction: column` | CSS class tab-content mặc định của app dùng flex layout | Mỗi tab content class PHẢI có: `display: flex; flex-direction: column; overflow: hidden;` và inner container có `flex: 1; overflow-y: auto;` |

**Quy tắc:** Khi gặp lỗi mới và đã fix → thêm vào bảng trên.

---

## 8. Quy tắc đặc biệt cho AI (khi code với Gemini/AI assistant)

1. **Luôn đọc file AGENTS.md này trước khi bắt đầu code**
2. **Không tự ý thay đổi tech stack** (ví dụ: đổi từ Flask sang FastAPI, đổi từ Vanilla JS sang React)
3. **Không tạo file mới ngoài cấu trúc thư mục đã định** mà không ghi lại
4. **Mọi print/log tiếng Việt phải an toàn encoding** (dùng hàm `log()` đã có, không `print()` trực tiếp)
5. **Sau khi hoàn thành tính năng mới → tự động update file này:**
   - Thêm file mới vào mục "Cấu trúc thư mục" (nếu có)
   - Thêm lỗi mới vào mục "Lỗi đã gặp" (nếu có)
   - Thêm quy tắc mới nếu phát hiện pattern quan trọng
6. **Nếu cần thay đổi Rule → ghi lại trong "Lịch sử thay đổi Rule"** kèm lý do
7. **Khi thêm tab mới vào UI:**
   - HTML phải nằm trong `<div class="app-container">` (trước `</div>` đóng container)
   - CSS tab-content class phải có: `display: flex; flex-direction: column; overflow: hidden;`
   - Container bên trong phải có: `flex: 1; overflow-y: auto;`
   - Phải thêm case vào hàm `switchTab()` trong `renderer.js`
8. **Khi thêm API endpoint Flask mới:**
   - Thêm endpoint trong `python/main.py`
   - Thêm IPC handler trong `main.js`
   - Expose trong `preload.js` (contextBridge)
   - Gọi từ `renderer.js` với `window.api.tênHàm()`
   - Đảm bảo params gửi lên khớp CHÍNH XÁC với tên field Flask endpoint expect
9. **Khi patch file JS/HTML phức tạp:** Dùng Python script thay vì `edit_file` nếu có escape characters hoặc regex patterns để tránh lỗi "target not found"
10. **Shared state giữa các UI components:** Dùng `localStorage` để lưu, hàm getter/setter riêng. Ví dụ: `loadKyNangList()` / `saveKyNangList()` / `syncKyNangDropdown()`

---

## 9. Lịch sử thay đổi Rule

| Ngày | Thay đổi | Lý do |
|---|---|---|
| 2026-10-20 | Tạo file Rule ban đầu | Khởi tạo project, định nghĩa cấu trúc và quy tắc |
| 2026-11-09 | Thêm `clip_splitter.py` (Công cụ B). Tên clip: `{loai}_{CauThu}_{ThoiKy}_{STT}.mp4`, loại mặc định `chua_phan_loai`, ghi `catalog.csv` (UTF-8 BOM) | Chuẩn bị Source cho Công cụ A sinh file Premiere. Scene detect dùng FFmpeg (ngưỡng mặc định 0.1), không thêm dependency |
| 2026-10-21 | Thêm session persistence (`session.json`), fix model name `gemini-2.5-flash` → `gemini-3.8-flash`, thêm lỗi #7 | Lưu data input giữa các lần restart app, Google deprecate model cũ |
| 2026-11-09 | Thêm `premiere_xml_generator.py` (Tool A — Gen Premiere XML). Thêm 5 API endpoints mới. Tích hợp UI đầy đủ cho Tool B + Tool A. Thêm tab "Quy tắc". Thêm Kỹ năng dropdown với custom option. Thêm lỗi #8–#16. Mở rộng mục 8 (Quy tắc AI) thêm rules 7–10 | Hoàn thiện pipeline: Tool B cắt clip → catalog.csv → Tool A gen XML → import Premiere. Fix nhiều bug Premiere XML, Electron khởi động, CSS tab layout, và patch file JS |

---

## 10. Quy tắc Tool B — Clip Splitter

### Format tên clip:
```
{loai}_{cau_thu}_{doi_bong}_{ky_nang}_{STT:03d}.mp4
```
Ví dụ: `rai_1_Xavi_Spain_Skill_001.mp4`

### VALID_LOAI (14 loại):
`rai_1`, `rai_2_1`, `rai_2_2`, `rai_3`, `rai_4`, `phong_van`, `training`, `binh_luan_chay`, `khan_dai`, `anh_thong_so`, `anh_thoi_diem`, `anh_chung_bao`, `sa_ban`, `chua_phan_loai`

### Danh sách Kỹ năng mặc định:
`Mixed`, `Skill`, `Bàn thắng`, `Kiến tạo`, `Đá Phạt`, `Đá Pen`
(User có thể thêm custom → lưu vào `localStorage`, đồng bộ với dropdown Tool B và tab Quy tắc)

### Catalog schema (14 cột):
`ten_file, loai, cau_thu, doi_bong, ky_nang, stt, video_nguon, start_s, end_s, duration_s, start_tc, end_tc, fps, ghi_chu`

### Đường dẫn thực tế (máy user):
- Source clips: `D:\Edit SofaZone\Source\Phân Loại nè\chua_phan_loai\`
- Catalog: `D:\Edit SofaZone\Source\catalog.csv`
- Voice: `D:\Edit SofaZone\Test\Voice_PhuDe\Voice_PhuDe.mp4` + `.srt`
- Timeline CSV: `D:\Edit SofaZone\Test\1_CSV_Timeline.csv`
- Source plan CSV: `D:\Edit SofaZone\Test\2_CSV_PhanLoaiSource.csv`
- XML output: `D:\Edit SofaZone\Test\fileXML\`

---

## 11. Quy tắc Tool A — Premiere XML Generator

### Inputs:
| Field | Mô tả |
|---|---|
| `timeline_csv` | `1_CSV_Timeline.csv` — cột: `doan, cau, y, start, text` |
| `source_plan_csv` | `2_CSV_PhanLoaiSource.csv` — cột: `doan, cau, y, loai_source, thoi_ky` |
| `catalog_csv` | Sinh từ Tool B |
| `voice_path` | File MP4/MP3 voice chính (track A1) |
| `srt_path` | File SRT phụ đề (tùy chọn) |
| `source_root` | Thư mục gốc chứa catalog + clip folders |
| `output_dir` | Thư mục lưu file XML |
| `project_name` | Tên file XML (không có extension) |

### Output: FCP XML (xmeml v4)
- Voice trên track A1
- Clips video trên V1/V2
- Markers đánh dấu từng đoạn/câu và cảnh thiếu source
- `pathurl` phải URL-encode: `D:/Edit%20SofaZone/Source/...`
- `<sequence id="sequence-1">` bắt buộc có `id` attribute
- FPS = 30, resolution 1920×1080

### Pick clips — 3 mức fallback:
1. `(norm(loai), norm(cau_thu), norm(ky_nang))` — khớp đầy đủ
2. `(norm(loai), norm(cau_thu))` — bỏ ky_nang
3. `(norm(loai),)` — chỉ theo loại

### norm() function:
`slugify_loose()` → bỏ dấu, bỏ ký tự đặc biệt, lowercase. Dùng cho cả index và lookup để khớp nhất quán.

### API endpoint:
`POST /api/premiere/generate-xml`
```json
{
  "timeline_csv": "...",
  "source_plan_csv": "...",
  "catalog_csv": "...",
  "voice_path": "...",
  "source_root": "...",
  "output_dir": "...",
  "project_name": "...",
  "srt_path": "..."
}
```
Response: `{ "output_path": "...", "total_clips": N, "missing": [...] }`

