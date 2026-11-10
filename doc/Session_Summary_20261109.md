# AE AI Tool — Session Summary (2026-11-09)

> **Mục đích file này:** Cho AI ở conversation mới đọc để hiểu ngay bối cảnh, tiến độ, và việc cần làm tiếp theo.
>
> **Project path:** `c:\Users\GP\Desktop\Edit Bdat\Code_AI`
> **Rules bắt buộc:** `c:\Users\GP\Desktop\Edit Bdat\Code_AI\.agents\AGENTS.md` — AI phải đọc file này trước khi code.

---

## 1. Tổng quan Project

**AE AI Tool** là ứng dụng desktop hỗ trợ tự động hóa quy trình dựng video cho kênh YouTube **SofaZone** (kênh phân tích bóng đá chuyên sâu, phong cách tư liệu hoài niệm / vintage).

### Quy trình sản xuất video:
```
Video highlight gốc (10_Sorce_Xavi.mp4...)
    │
    ▼ [Tool B — Cắt Clip]
Clip nhỏ theo từng pha bóng + catalog.csv
    │
    ▼ [Tool A — Gen XML]  ← Kết hợp 2 CSV + catalog + voice + SRT
File FCP XML → Import vào Premiere Pro → Timeline có sẵn voice + clip + markers
    │
    ▼ [Element/Overlay — ĐÃ LÀM ✅]
Tự động chèn lớp phủ (TV frame, paper texture, bảng thống kê) lên timeline V3/V4
    │
    ▼ [Animation — ĐÃ LÀM ✅]
Ken Burns zoom, Opacity fade, Transitions (Cross Dissolve, Dip to Black)
```

### Tech Stack (KHÔNG ĐƯỢC THAY ĐỔI):
| Thành phần | Công nghệ |
|---|---|
| Desktop UI | Electron 28.x (frameless window) |
| Frontend | HTML + Vanilla CSS + Vanilla JS |
| Backend | Python 3.13 + Flask 3.1 + waitress 3.0 |
| AI API | Google Gemini `gemini-3.8-flash` |
| Port | `127.0.0.1:5599` |

---

## 2. Các Tool đã hoàn thành

### ✅ Tool B — Clip Splitter (`python/clip_splitter.py`)
- **Chức năng:** Nhận video highlight dài → FFmpeg scene detect → cắt ra nhiều clip nhỏ + ghi `catalog.csv`
- **Format tên clip:** `{loai}_{cau_thu}_{doi_bong}_{ky_nang}_{STT:03d}.mp4`
- **Ngưỡng scene detect mặc định:** `0.10` (đã test với Busquets → 131 clip, rất chuẩn)
- **Catalog schema:** 14 cột: `ten_file, loai, cau_thu, doi_bong, ky_nang, stt, video_nguon, start_s, end_s, duration_s, start_tc, end_tc, fps, ghi_chu`
- **API:** `POST /api/clip-splitter/analyze` và `POST /api/clip-splitter/split`
- **UI:** Tab "Cắt Clip" với dropdown Kỹ năng (Mixed/Skill/Bàn thắng/Kiến tạo/Đá Phạt/Đá Pen + custom)

### ✅ Tool A — Premiere XML Generator (`python/premiere_xml_generator.py`)
- **Chức năng:** Đọc 2 CSV + catalog + voice + SRT → sinh FCP XML (xmeml v4) → import Premiere
- **Output XML:** Voice trên A1, clips video trên V1/V2, elements trên V3/V4, markers đánh dấu đoạn/câu
- **Pick clips fallback 4 mức:** (loai+cau_thu+ky_nang) → (loai+cau_thu) → (loai) → (any clip)
- **Animation System** (enable_animations=True, mặc định):
  - Ken Burns zoom: Scale keyframes 100%↔108% xen kẽ trên V1/V2 clips
  - Opacity fade: Fade in 10f + fade out 10f trên V3 elements
  - Transitions: Cross Dissolve giữa clips cùng đoạn, Dip to Black ở ranh giới
- **API:** `POST /api/premiere/generate-xml`
- **UI:** Tab "Gen XML" với form chọn 10 inputs + checkbox Animation + nút Generate
- **Đã test thành công:** Animation chạy mượt trong Premiere (user confirmed 2026-11-10)

### ✅ Tab Quy tắc (Rules)
- Tab hiển thị format đặt tên, VALID_LOAI (14 loại), danh sách Kỹ năng (thêm/xóa custom), cấu trúc thư mục, quy trình 4 bước
- Kỹ năng lưu trong `localStorage`, đồng bộ 2 chiều giữa Tab Quy tắc và dropdown Tool B

---

## 3. Cấu trúc file quan trọng

### Frontend (src/):
- `index.html` — 5 tab: Tạo mới, Cắt Clip, Gen XML, Quy tắc, Cài đặt
- `index.css` — Design system tối (dark theme tím)
- `renderer.js` — Toàn bộ UI logic (~1480 dòng)

### Backend (python/):
- `main.py` — Flask API server, port 5599
- `clip_splitter.py` — Tool B
- `premiere_xml_generator.py` — Tool A (~1022 dòng, animation + image/voice media fix)

### IPC Bridge:
- `main.js` — Electron main process + IPC handlers
- `preload.js` — contextBridge API expose

---

## 4. Đường dẫn thực tế trên máy User

```
D:\Edit SofaZone\
├── Source\
│   ├── catalog.csv                    ← Tổng hợp tất cả clip đã cắt
│   ├── Phân Loại nè\chua_phan_loai\  ← 131 clip Busquets
│   └── (sẽ có thêm thư mục rai_1\, training\... sau khi cắt thêm)
│
├── Test\
│   ├── _CSV_Input\                    ← 2 file CSV input
│   │   ├── 1_CSV_Timeline.csv         ← 25 dòng (doan, cau, y, start, text)
│   │   └── 2_CSV_PhanLoaiSource.csv   ← 25 dòng (doan, cau, y, loai_source, thoi_ky)
│   ├── _Source_Video\                 ← 4 video gốc chờ cắt
│   │   ├── 10_Sorce_Busi.mp4          (137MB)
│   │   ├── 10_Sorce_Xavi.mp4          (177MB)
│   │   ├── 10_Sorce_Iniesta_1.mp4     (49MB)
│   │   └── 10_Sorce_Iniesta_2.mp4     (224MB)
│   ├── Voice_PhuDe\
│   │   ├── Voice_PhuDe.mp4            ← Voice chính (track A1)
│   │   └── Voice_PhuDe.srt            ← Phụ đề
│   ├── fileXML\                       ← XML output
│   ├── Element\                       ← Assets overlay/lớp phủ ← MỚI THÊM
│   │   ├── tv FRAME2.png             ← Khung TV (đã đục lỗ)
│   │   ├── paper texture.png          ← Texture phủ vintage
│   │   ├── paper texture 2.png
│   │   ├── scout frame.png            ← Khung scout/tin tức
│   │   ├── o.png                      ← Khung tròn spotlight
│   │   ├── 5.png                      ← Khung tròn vàng
│   │   ├── texture2.png               ← Texture phim
│   │   ├── textture.png
│   │   ├── Comparison Table List Infographic Graph.png      ← Bảng thống kê (6 biến thể)
│   │   ├── Comparison Table List Infographic Graph (1-5).png
│   │   ├── 8mm Film Frame Overlay...mp4                     ← Hiệu ứng phim nhựa
│   │   ├── large-vecteezy_vintage-television...mp4          ← Video TV retro green screen
│   │   ├── Television - Retro...webm                        ← Video TV retro green screen #2
│   │   ├── intro.mp4                                        ← Intro video
│   │   └── vecteezy_orange-grid-animation...mp4             ← Background animation
│   ├── _Doc\
│   ├── _Premiere\
│   └── _thumbs\
```

---

## 5. CSV Format chi tiết

### 1_CSV_Timeline.csv (mốc thời gian + lời thoại):
```csv
doan,cau,y,start,text
1,1,1,00:00:00:05,"Euro 2008,"
1,1,1.1,00:00:01:12,Xavi Hernandez có một pha kiến tạo.
1,2,,00:00:03:10,Tây Ban Nha vô địch và anh là cầu thủ xuất sắc nhất giải.
...
```

### 2_CSV_PhanLoaiSource.csv (loại source cho từng câu):
```csv
doan,cau,y,loai_source,thoi_ky
1,1,1,rai_1,Euro 2008 · Tây Ban Nha / Xavi
1,1,1.1,anh_thong_so + rai_1,Euro 2008 · Xavi / Tây Ban Nha
1,2,,rai_4 + anh_thoi_diem,Euro 2008 · Tây Ban Nha / Xavi
...
```
- `loai_source` có thể ghép: `"anh_thong_so + rai_1"` = chèn cả bảng thống kê lẫn video rải
- `thoi_ky` format: `"Euro 2008 · Tây Ban Nha / Xavi"` → extract cầu thủ = `Xavi`

---

## 6. VIỆC CẦN LÀM TIẾP THEO (Ưu tiên cao → thấp)

### ✅ #1 — Nâng cấp Tool A: Tự động chèn Element/Overlay (ĐÃ HOÀN THÀNH ✅)

**Đã triển khai ngày 2026-11-09 (session 2):**

1. ✅ Tạo `templates/element_map.json` — 20 element definitions (TV frames, textures, stats tables...)
2. ✅ Sửa `premiere_xml_generator.py`:
   - `_load_element_map()` — đọc element_map.json
   - `_resolve_element()` — auto-map hoặc CSV override
   - Tracks V3 (per-clip elements) + V4 (full-video texture/grain)
   - Opacity filter cho texture/grain (VD: 15%)
   - Element vẫn được đặt kể cả khi thiếu source clips
3. ✅ Sửa `main.py` — thêm `element_dir`, `texture_id` params
4. ✅ Sửa UI (index.html + renderer.js):
   - Card "8. Thư mục Element" (folder picker)
   - Card "9. Texture/Grain Overlay" (dropdown select)
   - Checklist items + result summary hiện element count
5. ✅ CLI test: 11 elements auto-placed (10 per-clip + 1 full-video texture)

**Cách dùng:**
- **Auto:** Chỉ cần chọn Element Dir, tool tự đặt overlay theo loai_source
- **Override:** Thêm cột `element` vào CSV, ghi `tv_retro`, `stats_table_2`, `none`...
- **Texture:** Chọn từ dropdown (paper_texture, film_grain, grid_orange...)

**Auto-mapping rules:**
| `loai_source` | Element ID | Track |
|---|---|---|
| `phong_van` | `tv_retro` | V3 |
| `anh_thong_so` | `stats_table` | V3 |
| `anh_thoi_diem` | `scout_frame` | V3 |
| `training` | `tv_sony` | V3 |
| Các loại khác | Không chèn | — |

**Track layout:**
```
V4: Texture overlay (paper texture, film grain... — full video, Opacity ~15%)
V3: Element overlay (TV frame, scout frame, stats table... — per-clip)
V2: Video clip phụ (nếu rải đôi)
V1: Video clip chính
A1: Voice
```

### ✅ #2 — Animation System (ĐÃ HOÀN THÀNH ✅)

**Đã triển khai ngày 2026-11-09 ~ 2026-11-10 (session 3):**

1. ✅ **Ken Burns zoom** — Scale keyframes 100%↔108% xen kẽ trên V1/V2 clips (effectid: `basic`)
2. ✅ **Opacity fade** — Fade in 10 frames + fade out 10 frames trên V3 elements (effectid: `opacity`)
3. ✅ **Transitions** — Cross Dissolve giữa clips cùng đoạn, Dip to Black ở ranh giới đoạn + đầu/cuối video
4. ✅ **User confirmed:** "Tôi đã thấy Animation chạy rồi, Khá mượt và khá ổn"
5. ✅ **Critical fix #20:** PNG image `<file>` elements had `<audio>` but NO `<video>` in `<media>` block → Premiere "File Import Failure". Fix: ALL files now get `<video>` with `<samplecharacteristics>`. Only non-image files get `<audio>`.
6. ✅ **Fix #21:** Voice file (mp4) in audio track had no `<video>` in `<media>` block → Added `<video><samplecharacteristics>` with width/height.
7. ✅ **Pick clips fallback level 4:** Ultimate fallback — use any clip from catalog when no type matches.
8. ✅ **Premiere track behavior:** Premiere auto-removes empty tracks and renumbers. Elements on V3/V4 DO render correctly.

**Animation settings:**
- `enable_animations` param (default: `true`)
- CLI flag: `--no-animations` để tắt
- Ken Burns zoom chỉ áp dụng cho video clips (V1/V2)
- Opacity fade chỉ áp dụng cho elements (V3)
- Transitions áp dụng giữa clips cùng đoạn (Cross Dissolve) và ranh giới đoạn (Dip to Black)

### 🟡 #3 — Fix nhỏ còn lại
- File `Xavi_Ini_Busi_VoiceTest.mp3` vẫn bị lock ở `D:\Edit SofaZone\Test\` (cần user xóa thủ công)
- Tab Quy tắc cần restart app để thấy (đã fix CSS nhưng user chưa confirm)

### 🟢 #4 — Việc cần làm tiếp
- ✅ **App Integration** — Đã thêm "Enable Animations" checkbox vào tab Gen XML (card #10)
- **Full pipeline test trên app UI** (user chạy `npm start` → test toàn bộ flow)
- Session persistence cho Tool A (lưu đường dẫn vào session.json)
- Tool B: UI reclassify clips sau khi cắt
- Premiere Effect Presets (.prfpset) cho override thủ công sau khi import

---

## 7. Bugs đã fix trong session này

| Bug | Fix |
|---|---|
| Tool A gửi `output_path` thay vì `output_dir` + `project_name` | Sửa renderer.js params |
| Tool A đọc `result.output` thay vì `result.output_path` | Sửa renderer.js |
| `app.commandLine` TypeError khi Electron chạy ngoài GUI | Bọc guard `if (app && app.commandLine)` |
| PowerShell dùng `&&` thay vì `;` | Sửa thành `;` |
| Tab Rules nằm ngoài `.app-container` → bị đen | Chuyển vào trong container |
| Tab Rules thiếu CSS flex layout | Thêm `display: flex; flex-direction: column; overflow: hidden` |
| Tool B "Phân tích trước" hiện `undefined` | Fix: đọc `result.stats.count` thay vì `result.scene_count` |
| Tool B "Cắt Clip" gửi sai `output_root` | Fix: gửi `out_root` khớp Flask |
| Tool B "Cắt Clip" đọc sai `clips_created` | Fix: đọc `result.total_clips` |
| **Session 3 (2026-11-10)** | |
| Premiere "File Import Failure" cho XML có ảnh/stillframe (#20) | Fix `_make_clip_item()`: ALL files get `<video>` trong media. Chỉ non-image files get `<audio>` |
| Voice file (mp4) thiếu `<video>` trong media block (#21) | Thêm `<video><samplecharacteristics>` cho voice media block |
| V3/V4 elements không hiện trên timeline Premiere | Premiere auto-removes empty tracks. Elements render correctly (verified) |

---

## 8. Quy tắc quan trọng cho AI

1. **Luôn đọc `AGENTS.md` trước khi code** — file đó có 11 mục rules chi tiết
2. **Tab mới phải nằm trong `.app-container`** (lỗi #15 trong AGENTS.md)
3. **CSS tab phải có:** `display: flex; flex-direction: column; overflow: hidden`
4. **Khi patch file JS phức tạp:** Dùng Python script thay vì `edit_file` (lỗi #14)
5. **`<script src="renderer.js">` phải ở cuối cùng** trước `</body>` — sau tất cả HTML/modals
6. **Electron không chạy được từ agent terminal** — yêu cầu user tự chạy `npm start`
7. **Params Flask endpoint phải khớp CHÍNH XÁC** tên field — đã bị lỗi 2 lần vì lệch tên

