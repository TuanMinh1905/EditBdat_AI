# AE AI Tool — Session Summary (Cập nhật 2026-11-10)

> **Mục đích file này:** Cho AI ở conversation mới đọc để hiểu ngay bối cảnh, kiến trúc, tiến độ đã hoàn thành, và việc cần làm tiếp theo.
>
> **Project path:** `c:\Users\GP\Desktop\Edit Bdat\Code_AI`
> **Rules bắt buộc:** `c:\Users\GP\Desktop\Edit Bdat\Code_AI\.agents\AGENTS.md` — **AI BẮT BUỘC đọc file này trước khi viết code.**

---

## 1. Tổng quan Project & Quy trình Sản xuất

**AE AI Tool** là ứng dụng desktop hỗ trợ tự động hóa quy trình dựng video cho kênh YouTube **SofaZone** (kênh phân tích bóng đá chuyên sâu, phong cách tư liệu hoài niệm / vintage).

### Quy trình sản xuất 4 bước của User:
```
[Bước 0 — Chuẩn bị bên ngoài]
Voice_A (30p) + Word_B (Kịch bản) ──(CapCut + GPT Web)──► 1_CSV_Timeline.csv (doan, cau, y, start, text)
                                                               │
    ┌──────────────────────────────────────────────────────────┘
    ▼
[Bước 1 — Tool 1: Gợi ý Source - Animation (Tab 💡 Gợi ý Source - Animation)] ✅ ĐÃ HOÀN THÀNH
  • Đọc 1_CSV_Timeline.csv
  • Kết hợp:
      1) File .txt (templates/source_style_rules.txt): Nguyên tắc tổng quát dặn AI (luôn áp dụng cho mọi câu)
      2) File .json (templates/source_examples.json): Bài mẫu đã làm sẵn (Gemini Embedding RAG few-shot)
  • AI gợi ý combo cho từng câu: loai_source + element (Lớp phủ V3) + anim (Chuyển động Zoom) + thoi_ky
  • User chỉnh sửa inline trên bảng → Lưu vào Kho ví dụ (.json) để dạy AI → Xuất ra 2_CSV_PhanLoaiSource.csv (7 cột)
    │
    ▼
[Bước 2 — Tool B: Cắt Clip (Tab ✂️ Cắt Clip)] ✅ ĐÃ HOÀN THÀNH
  • Video highlight gốc (10_Sorce_Xavi.mp4...) → FFmpeg scene detect → Cắt ra các clip nhỏ + ghi vào catalog.csv
    │
    ▼
[Bước 3 — Tool A: Gen XML (Tab 🎬 Gen XML)] ✅ ĐÃ HOÀN THÀNH
  • Kết hợp: 1_CSV_Timeline.csv + 2_CSV_PhanLoaiSource.csv + catalog.csv + Voice + SRT + Thư mục Element
  • Sinh file FCP XML (xmeml v4) → Import vào Premiere Pro:
      - Track A1: Voice
      - Track V1/V2: Video/Ảnh Source + Ken Burns Zoom (theo cột anim: zoom_in, zoom_out, static, auto) + Transitions
      - Track V3: Lớp phủ Element per-clip (TV frame, scout frame, bảng thống kê, 8mm film...) + Opacity fade
      - Track V4: Full-video Texture/Grain (paper texture, film grain... Opacity ~15%)
      - Markers: Đánh dấu từng đoạn/câu trên timeline
```

### Tech Stack (KHÔNG ĐƯỢC THAY ĐỔI):
| Thành phần | Công nghệ |
|---|---|
| Desktop UI | Electron 28.x (frameless window, `minWidth: 720`, `minHeight: 560`) |
| Frontend | HTML + Vanilla CSS + Vanilla JS |
| Backend | Python 3.13 + Flask 3.1 + waitress 3.0 |
| AI API | Google Gemini `gemini-3.8-flash` & Embedding `text-embedding-004` (`google-genai`) |
| Port | `127.0.0.1:5599` |
| Git Repo | `https://github.com/TuanMinh1905/EditBdat_AI.git` (branch `main`) |

---

## 2. Các Tool & Tính năng đã hoàn thành

### ✅ Tool 1 — Source & Animation Suggester (`python/source_suggester.py`) — *MỚI (2026-11-10)*
- **Mục đích:** Giải quyết vấn đề GPT web gán Source/Animation quá màu mè hoặc sai mã code; giúp AI học đúng gu dựng video tư liệu của user qua từng dự án.
- **Hai tầng tri thức dạy AI:**
  1. **File `.txt` (`templates/source_style_rules.txt`)**: Nguyên tắc tổng quát user dặn AI (luôn áp dụng cho mọi câu).
     - Hiển thị trực tiếp nguyên file `.txt` trên giao diện ở Card 1.
     - Mặc định ở trạng thái **🔒 Đang khóa** (`readonly`) để tránh sửa nhầm. Khi bấm **✏️ Chỉnh sửa** mới mở khóa cho sửa, sau đó bấm **💾 Lưu & Khóa lại** (có hộp thoại xác nhận lần 2) hoặc **✖ Hủy**.
  2. **File `.json` (`templates/source_examples.json`)**: Kho bài mẫu user đã làm sẵn (RAG Few-Shot).
     - Khi user chỉnh sửa bảng bên phải và bấm **"🧠 Lưu vào Kho ví dụ (Dạy AI)"**, hệ thống gọi Gemini Embedding (`text-embedding-004`, fallback `gemini-embedding-001` / word-overlap) để vector hóa câu thoại kèm combo `loai_source` + `element` + `anim` + `thoi_ky` + `user_note`.
     - Ở những video tiếp theo, gặp câu thoại có ngữ cảnh tương tự, AI tự động lôi Top-K bài mẫu tương ứng ra bắt chước.
- **Giới hạn chặt danh sách hợp lệ (không bịa mã ngoài hệ thống):**
  - `VALID_LOAI`: `rai_1`, `rai_2_1`, `rai_2_2`, `rai_3`, `rai_4`, `phong_van`, `training`, `binh_luan_chay`, `khan_dai`, `anh_thong_so`, `anh_thoi_diem`, `anh_chung_bao`, `sa_ban`.
  - `VALID_ELEMENTS`: `auto`, `none`, `tv_retro`, `tv_retro_2`, `tv_sony`, `tv_old_video`, `tv_green_1`, `tv_green_2`, `scout_frame`, `circle_frame`, `gold_circle`, `stats_table`, `stats_table_1`..`5`, `film_grain`, `paper_texture`, `paper_texture_2`.
  - `VALID_ANIMS`: `auto` (Xen kẽ tự động), `zoom_in` (100% → 108%), `zoom_out` (108% → 100%), `static` (Đứng yên 100%).
- **Bảng kết quả 9 cột chỉnh sửa trực tiếp (Inline Editable):**
  - `Đoạn/Câu`, `Lời thoại (text)`, `Source chính`, `+ Source phụ`, `Lớp phủ (Element V3)`, `Chuyển động`, `Thời kỳ / Cầu thủ` (có nút `⬇ Điền trống` hàng loạt), `Ghi chú dạy AI`, `Độ tự tin` (badge màu Xanh/Vàng/Đỏ + lý do AI chọn).
- **Xuất file & Đồng bộ sang Tool A:**
  - Xuất ra `2_CSV_PhanLoaiSource.csv` gồm **7 cột**: `doan, cau, y, loai_source, thoi_ky, element, anim` (UTF-8 BOM) và tự động điền đường dẫn sang ô CSV #2 của tab **Gen XML**.
- **7 API Endpoints (`python/main.py`):**
  - `POST /api/source-suggester/get-state`
  - `POST /api/source-suggester/save-rules`
  - `POST /api/source-suggester/load-csv`
  - `POST /api/source-suggester/suggest`
  - `POST /api/source-suggester/save-examples`
  - `POST /api/source-suggester/delete-example`
  - `POST /api/source-suggester/export-csv`

---

### ✅ Tool B — Clip Splitter (`python/clip_splitter.py`)
- **Chức năng:** Nhận video highlight dài → FFmpeg scene detect → cắt ra nhiều clip nhỏ + ghi `catalog.csv`.
- **Format tên clip:** `{loai}_{cau_thu}_{doi_bong}_{ky_nang}_{STT:03d}.mp4`
- **Ngưỡng scene detect mặc định:** `0.10` (đã test với Busquets → 131 clip).
- **Catalog schema (14 cột):** `ten_file, loai, cau_thu, doi_bong, ky_nang, stt, video_nguon, start_s, end_s, duration_s, start_tc, end_tc, fps, ghi_chu`
- **API:** `POST /api/clip-splitter/analyze` và `POST /api/clip-splitter/split`
- **UI:** Tab "Cắt Clip" với dropdown Kỹ năng (`Mixed`, `Skill`, `Bàn thắng`, `Kiến tạo`, `Đá Phạt`, `Đá Pen` + custom).

---

### ✅ Tool A — Premiere XML Generator (`python/premiere_xml_generator.py`)
- **Chức năng:** Đọc `1_CSV_Timeline.csv` + `2_CSV_PhanLoaiSource.csv` + `catalog.csv` + `voice` + `SRT` + `Element Dir` → sinh FCP XML (`xmeml` v4) → import vào Premiere Pro.
- **Pick clips fallback 4 mức:** `(loai+cau_thu+ky_nang)` → `(loai+cau_thu)` → `(loai)` → `(any clip)`.
- **Đọc cột `element` và `anim` từ `2_CSV_PhanLoaiSource.csv`:**
  - Cột `element`: Hỗ trợ `auto`, `none`, hoặc mã cụ thể (`tv_retro`, `scout_frame`, `film_grain`, `paper_texture`, `stats_table`...) đặt lên track V3 cho từng câu.
  - Cột `anim`: Hỗ trợ `zoom_in` (100→108%), `zoom_out` (108→100%), `static` (không zoom), `auto` (xen kẽ) cho cả video lẫn ảnh tĩnh trên V1/V2.
- **Transitions & Opacity:**
  - Cross Dissolve giữa clips cùng đoạn, Dip to Black ở ranh giới đoạn.
  - Opacity fade-in 10f + fade-out 10f cho V3 elements; Opacity ~15% cho V4 full-video texture.

---

### ✅ Quản lý Token & Cài đặt (`python/token_tracker.py`) — *MỚI (2026-11-10)*
- Tự động đếm và lưu lượng Token (`input_tokens`, `output_tokens`, `thinking_tokens`, `total_tokens`, `requests`) theo từng API Key (masked) vào `templates/token_usage.json`.
- Hiển thị bảng thống kê Token theo từng API Key ngay trong tab **⚙️ Cài đặt** kèm nút làm mới, xóa thống kê và mở trang Google AI Studio Quota.
- **API:** `POST /api/token-usage/get`, `POST /api/token-usage/reset`.

---

### ✅ Cải tiến Giao diện (UI/UX) — *MỚI (2026-11-10)*
1. **Sắp xếp lại 6 Tab Sidebar theo đúng luồng công việc:**
   - `➕ Tạo mới` (`#tab-create`)
   - `📋 Quy tắc` (`#tab-rules`)
   - `💡 Gợi ý Source - Animation` (`#tab-source-suggester`)
   - `✂️ Cắt Clip` (`#tab-clip-splitter`)
   - `🎬 Gen XML` (`#tab-premiere-gen`)
   - `⚙️ Cài đặt` (`#tab-settings`)
2. **Thanh kéo thay đổi kích thước (Draggable Resizers — Ngang, Dọc & Cột Bảng) & Responsive cho toàn bộ Container lớn/nhỏ:**
   - **Kéo rộng ngang (`.split-resizer` & `.inner-split-resizer`)**:
     - Giữa 2 cột lớn (Trái ↔ Phải) ở cả 4 tab (`Tạo mới`, `Gợi ý Source - Animation`, `Cắt Clip`, `Gen XML`).
     - Giữa các Container nhỏ nằm cạnh nhau: **Bảng 1 (Phân loại Source) ↔ Bảng 2 (Phân loại Animation)** trong `#sg-cls-grid` và **2 khung Phân loại Source ↔ Animation** trong `#tab-rules`.
   - **Kéo dài dọc (`.v-split-resizer`)**:
     - Nằm ngay bên dưới mọi khung container nhỏ trên toàn Project: khung 2 bảng Phân loại (`#sg-cls-grid`), ô Quy tắc `.txt` (`#sg-rules-input`), Kho ví dụ (`#sg-examples-list`), Nhật ký (`#sg-log-box`), Drop zone (`#drop-zone`), ô Prompt (`#prompt-input`), bảng Catalog (`#sp-catalog-table-wrap`), danh sách Thiếu source (`#pg-missing-list`), và các khung Log.
   - **Kéo rộng từng cột bảng (`.th-col-resizer`)**:
     - Tự động gắn thanh kéo ở mép phải mỗi tiêu đề cột (`<th>`) trong tất cả các bảng (`.sg-cls-table`, `.sg-table`, `.sp-catalog-table`, `.rules-table`).
   - Mọi kích thước sau khi kéo đều tự động lưu vào `localStorage` (`split_w_*`, `vsplit_h_*`, `col_w_*`) và hỗ trợ **Nhấp đúp (Double-click)** để khôi phục mặc định.
   - **Responsive thông minh theo từng Container (`container-type: inline-size` + `@container` & `@media`)**: Khi kéo hẹp bất kỳ cột nào hoặc thu nhỏ cửa sổ, các container con tự động chuyển sang xếp chồng dọc (`flex-direction: column`), không bao giờ làm tràn hay khuất chữ.
3. **2 Bảng Phân loại Source & Animation hiển thị và chỉnh sửa trực tiếp trên UI (`templates/classifications.json`):**
   - Hiển thị trực tiếp trên tab **💡 Gợi ý Source - Animation** (`#sg-cls-card`) gồm **Bảng 1: Phân loại Source (13 loại mặc định)** và **Bảng 2: Phân loại Animation & Lớp phủ (20 loại mặc định: 4 chuyển động Zoom + 16 lớp phủ V3)**.
   - Hỗ trợ chế độ **🔒 Đang khóa** (click vào mã để copy hoặc chèn thẳng vào ô Quy tắc `.txt`) và **✏️ Chỉnh sửa 2 bảng** (thêm dòng mới, sửa mã/tên/thông số/mô tả, xóa dòng có xác nhận, bấm **💾 Lưu & Áp dụng**).
   - Khi lưu, toàn bộ **AI Prompt** (`python/source_suggester.py`), **Dropdown bảng Timeline**, **Tab 📋 Quy tắc**, **Dropdown Tool B (`python/clip_splitter.py`)** và **Tool A (`python/premiere_xml_generator.py` + `templates/element_map.json`)** tự động lấy danh sách mới nhất ra sử dụng.
4. **Hộp thoại xác nhận lần 2 (`#modal-confirm` + `askConfirm()`):**
   - Mọi thao tác chỉnh sửa/lưu/xóa quan trọng đều hiện modal xác nhận 2 bước rõ ràng để tránh bấm nhầm:
     - Lưu chỉnh sửa vào file `source_style_rules.txt`
     - Hủy chỉnh sửa khi đang gõ dở trong file `.txt`
     - Điền hàng loạt vào cột `Thời kỳ / Cầu thủ`
     - Lưu vào Kho ví dụ dạy AI (`source_examples.json`)
     - Xóa 1 mẫu hoặc xóa toàn bộ Kho ví dụ (`.json`)
     - Xóa kỹ năng trong tab Quy tắc
     - Lưu cài đặt hệ thống / Đặt lại bộ đếm Token

---

## 3. Cấu trúc file quan trọng hiện tại

### Frontend (`src/`):
- `src/index.html` — Giao diện chính gồm 6 tab + `#modal-timeline` + `#modal-confirm` (thẻ `<script src="renderer.js"></script>` nằm ở dòng cuối cùng trước `</body>`).
- `src/index.css` — Design system dark theme, styles cho 6 tab, `.split-resizer`, `.confirm-modal-box`, responsive breakpoints.
- `src/renderer.js` — Toàn bộ UI logic, state, `askConfirm()`, `initSplitResizers()`, `initSourceSuggester()`, `initClipSplitter()`, `initPremiereGen()`.

### Backend (`python/`):
- `python/main.py` — Flask API server (port `5599`).
- `python/source_suggester.py` — Tool 1: AI gợi ý `loai_source` + `element` + `anim` + `thoi_ky` (Gemini + RAG Embedding).
- `python/clip_splitter.py` — Tool B: Cắt clip highlight + `catalog.csv`.
- `python/premiere_xml_generator.py` — Tool A: Sinh FCP XML v4 cho Premiere Pro.
- `python/token_tracker.py` — Đếm & lưu trữ lượng Token Gemini API theo từng API Key.
- `python/gemini_client.py`, `python/media_analyzer.py`, `python/timeline_validator.py`, `python/jsx_generator.py`.

### Templates & Data (`templates/`):
- `templates/classifications.json` — Bảng Phân loại Source & Animation động (cập nhật trực tiếp từ UI và đồng bộ toàn hệ thống).
- `templates/element_map.json` — Mapping 20 `element_id` → file ảnh/video overlay trong thư mục Element.
- `templates/source_style_rules.txt` — File `.txt` lưu nguyên tắc chọn Source & Animation của user.
- `templates/source_examples.json` — File `.json` lưu kho bài mẫu kèm vector embedding để dạy AI.

---

## 4. CSV Format chi tiết

### `1_CSV_Timeline.csv` (Đầu vào của Tool 1 & Tool A):
```csv
doan,cau,y,start,text
1,1,1,00:00:00:05,"Euro 2008,"
1,1,1.1,00:00:01:12,Xavi Hernandez có một pha kiến tạo.
1,2,,00:00:03:10,Tây Ban Nha vô địch và anh là cầu thủ xuất sắc nhất giải.
```

### `2_CSV_PhanLoaiSource.csv` (Đầu ra của Tool 1 → Đầu vào của Tool A — 7 cột):
```csv
doan,cau,y,loai_source,thoi_ky,element,anim
1,1,1,rai_1,Euro 2008 · Tây Ban Nha / Xavi,auto,zoom_in
1,1,1.1,anh_thong_so + rai_1,Euro 2008 · Xavi / Tây Ban Nha,stats_table,static
1,2,,rai_4 + anh_thoi_diem,Euro 2008 · Tây Ban Nha / Xavi,scout_frame,zoom_out
```
- `loai_source`: có thể đơn (`rai_1`) hoặc ghép (`anh_thong_so + rai_1`).
- `thoi_ky`: format `"Giải đấu · Đội bóng / Cầu thủ"` (VD: `Euro 2008 · Tây Ban Nha / Xavi`).
- `element`: mã lớp phủ V3 (`auto`, `none`, `tv_retro`, `scout_frame`, `film_grain`...).
- `anim`: chuyển động Ken Burns (`auto`, `zoom_in`, `zoom_out`, `static`).

---

## 5. Việc cần làm tiếp theo (Backlog cho Conversation mới)

1. **Test thực tế toàn bộ luồng (End-to-End Pipeline) với dữ liệu thật của User:**
   - User nhập nguyên tắc vào `templates/source_style_rules.txt` trên giao diện tab **💡 Gợi ý Source - Animation**.
   - Load file `1_CSV_Timeline.csv` → chạy **🤖 AI Gợi ý Source + Animation** → kiểm tra chất lượng gợi ý → chỉnh sửa & bấm **Lưu vào Kho ví dụ** → xuất `2_CSV_PhanLoaiSource.csv`.
   - Chuyển sang tab **🎬 Gen XML** → bấm Generate XML → import vào Premiere Pro kiểm tra toàn bộ V1/V2/V3/V4 và Animation.
2. **Session Persistence mở rộng:**
   - Lưu tự động các đường dẫn đã chọn ở tab **Gợi ý Source - Animation**, **Cắt Clip**, và **Gen XML** vào `localStorage` / `session.json` để khi tắt mở lại app không phải chọn lại file.
3. **Tool B — UI Phân loại lại (Reclassify) clip sau khi cắt:**
   - Giao diện xem nhanh các clip trong `chua_phan_loai/` và đổi sang `rai_1`, `training`, `phong_van`... đồng thời tự động rename file + cập nhật `catalog.csv`.
4. **Premiere Effect Presets (`.prfpset`):**
   - Tạo bộ preset hiệu ứng cho Premiere để user có thể kéo thả thủ công khi muốn tinh chỉnh thêm.

---

## 6. Quy tắc BẮT BUỘC cho AI ở Conversation mới (Tóm tắt từ `AGENTS.md`)

1. **Luôn đọc `.agents/AGENTS.md` trước khi viết code.**
2. **Tự động Commit & Push Git bằng tiếng Việt (Rule #13):**
   - Cứ mỗi lần hoàn thành chỉnh sửa hoặc viết code mới (sau khi kiểm tra cú pháp `ast.parse` cho Python và `node --check` cho JS), **BẮT BUỘC** tự động chạy:
     ```powershell
     git add <files>; git commit -m "Mô tả rõ ràng bằng tiếng Việt"; git push origin main
     ```
3. **PowerShell trên Windows:** Dùng `;` thay vì `&&` để nối lệnh.
4. **Không chạy `npm start` từ terminal của AI:** Electron cần GUI thật của Windows, hãy nhắc user tự chạy hoặc reload cửa sổ Electron (`Ctrl+R`).
5. **Giữ nguyên vị trí `<script src="renderer.js"></script>`:** Luôn nằm ở dòng cuối cùng ngay trước `</body>` (sau tất cả các tab và modal `#modal-timeline`, `#modal-confirm`).
6. **Flexbox Card Rule:** Mọi card (`.sp-card`, `.rules-card`) nằm trong flex column có `overflow-y: auto` bắt buộc phải có `flex-shrink: 0;`.
