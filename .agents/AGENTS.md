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
│   └── AGENTS.md              ← FILE NÀY — Rule chính
├── package.json               # Electron config
├── main.js                    # Electron main process
├── preload.js                 # IPC bridge (contextBridge)
├── src/                       # ── FRONTEND ──
│   ├── index.html             # UI chính
│   ├── index.css              # CSS duy nhất (design system)
│   ├── renderer.js            # UI logic chính
│   └── components/            # UI components tách riêng (nếu cần)
├── python/                    # ── BACKEND ──
│   ├── requirements.txt       # Python dependencies
│   ├── main.py                # Flask API server (entry point)
│   ├── media_analyzer.py      # Phân tích media bằng FFprobe
│   ├── gemini_client.py       # Gọi Gemini API
│   ├── timeline_validator.py  # Validate timeline JSON
│   └── jsx_generator.py       # Sinh script .jsx cho After Effects
├── schemas/
│   └── timeline.schema.json   # JSON Schema cho timeline
├── templates/                 # Template JSX, preset effects
├── output/                    # Thư mục chứa .jsx và .aep output
└── doc/                       # Tài liệu, ghi chú
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

---

## 9. Lịch sử thay đổi Rule

| Ngày | Thay đổi | Lý do |
|---|---|---|
| 2026-10-20 | Tạo file Rule ban đầu | Khởi tạo project, định nghĩa cấu trúc và quy tắc |

