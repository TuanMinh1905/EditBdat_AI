# AE AI Tool — Session Summary (Cập nhật 2026-11-11)

> **Mục đích file này:** Cho AI ở conversation mới đọc để nắm bắt toàn bộ bối cảnh, kiến trúc hệ thống, các tính năng đã hoàn thiện và các quy tắc cốt lõi của dự án.
>
> **Project path:** `c:\Users\GP\Desktop\Edit Bdat\Code_AI`  
> **Rules bắt buộc:** `c:\Users\GP\Desktop\Edit Bdat\Code_AI\.agents\AGENTS.md` — **AI BẮT BUỘC đọc kỹ trước khi viết code.**

---

## 1. Tổng quan Project & Mô hình Đối tượng "Time" (6 Thuộc Tính)

**AE AI Tool** là ứng dụng desktop tự động hóa quy trình hậu kỳ video cho kênh YouTube **SofaZone** (kênh phân tích bóng đá chuyên sâu mang phong cách tư liệu hoài niệm / vintage).

### 🎯 Mô hình đối tượng "Time" (Mỗi đoạn thời gian trong kịch bản):
Mỗi dòng trong timeline đại diện cho một đối tượng **Time** chứa đầy đủ **6 thuộc tính độc lập**:
1. **Voice (Lời thoại)**: Track **A1** (file voice gốc + timecode từ CapCut SRT / CSV)
2. **Source Video (`loai_source`)**: Track **V1/V2** (Rải đơn, rải đôi, rải 3, rải 4, phỏng vấn, khán đài, sa bàn...)
3. **Lớp phủ Design (`element`)**: Track **V3** (overlay per-clip như Khung Sofa TV CRT, Phim 8mm hồi ức, Scout frame, Bảng infographic...) và **V4** (Full-video Texture giấy cũ / Film grain 15%)
4. **Animation (`anim`)**: Chuyển động Ken Burns trên V1/V2 (`zoom_in` 100%→108%, `zoom_out` 108%→100%, `static`, `auto`)
5. **Sound nền (`bgm`)**: Track **A2** (Nhạc nền chạy xuyên suốt, tự động nối liền mạch các dòng liên tiếp có cùng mã `bgm`, âm lượng 0.15)
6. **Sound Effect (`sfx`)**: Track **A3** (Hiệu ứng âm thanh điểm nhấn: tiếng còi, tiếng tách máy ảnh, tiếng tivi rè, tiếng reo hò, tiếng beep số liệu... tại thời điểm xuất hiện, âm lượng 0.6)

---

## 2. Quy trình sản xuất 4 bước của User

```
[Bước 0 — Chuẩn bị ngoài]
Voice.mp3/mp4 (30p) + Word Kịch bản ──(CapCut + Whisper)──► 1_CSV_Timeline.csv (doan, cau, y, start, text)
                                                                │
    ┌───────────────────────────────────────────────────────────┘
    ▼
[Bước 1 — Tool 1: Gợi ý Source - Animation - Sound (Tab 💡 Gợi ý Source - Animation)] ✅
  • Đọc 1_CSV_Timeline.csv
  • AI học từ:
      1) File quy tắc .txt (templates/source_style_rules.txt): Nguyên tắc phong cách bất di bất dịch
      2) Kho ví dụ .json (templates/source_examples.json): Bài mẫu đã làm (Gemini Embedding Few-Shot)
      3) Hệ thống 5 Bảng Phân loại động (templates/classifications.json): Source, Element, Anim, BGM, SFX
  • AI đề xuất bộ 5 thông số (loai_source, element, anim, bgm, sfx) + thoi_ky cho từng dòng Time
  • User chỉnh sửa trực tiếp trên bảng Timeline 11 cột
  • Lưu bài mẫu vào Kho ví dụ để AI học thông minh hơn qua từng dự án
  • Xuất file 2_CSV_PhanLoaiSource.csv (9 cột)
    │
    ▼
[Bước 2 — Tool B: Cắt Clip (Tab ✂️ Cắt Clip)] ✅
  • Video highlight dài (10_Source_Xavi.mp4...) ──(FFmpeg Scene Detect)──► Cắt nhỏ + Ghi catalog.csv (14 cột)
  • Phân loại theo: loai, cau_thu, doi_bong, ky_nang, thoi_ky
    │
    ▼
[Bước 3 — Tool A: Gen XML Premiere (Tab 🎬 Gen XML)] ✅
  • Tổng hợp: 1_CSV_Timeline.csv + 2_CSV_PhanLoaiSource.csv + catalog.csv + Voice + Element + Sounds
  • Xuất file FCP XML (xmeml v4) import thẳng vào Premiere Pro:
      - Track A1: Voice chính
      - Track A2: Nhạc nền BGM (nối liền mạch các câu cùng bgm, gain 0.15)
      - Track A3: Sound Effect SFX (đặt tại frame bắt đầu của câu, gain 0.6, max 3s)
      - Track V1/V2: Clip/Ảnh Source + Ken Burns Zoom keyframes + Transitions (Dip to Black, Cross Dissolve)
      - Track V3: Lớp phủ Element overlay per-clip + Opacity Fade in/out
      - Track V4: Full-video Texture/Grain (opacity 15%)
      - Sequence Markers: Đánh dấu phân đoạn DOAN 1, DOAN 2... và cảnh báo thiếu source
```

---

## 3. Hệ thống 5 Bảng Phân loại Độc Lập (`templates/classifications.json`)

Toàn bộ hệ thống phân loại được tổ chức thành **5 bảng riêng biệt**, hiển thị trực tiếp trên giao diện tab **💡 Gợi ý Source - Animation** và đồng bộ sang tab **📋 Quy tắc**:

1. **Bảng 1: Phân loại Source (`source_types`)** — V1/V2:
   - Các loại: `rai_1` (Rải đơn), `rai_2_1`/`rai_2_2` (Rải đôi), `rai_3`, `rai_4` (Danh hiệu), `phong_van`, `training`, `binh_luan_chay`, `khan_dai`, `anh_thong_so`, `anh_thoi_diem`, `anh_chung_bao`, `sa_ban`.
   - Có cột **Ảnh / Video ví dụ** (5–10s, hover-play, click mở Lightbox).
2. **Bảng 2: Lớp phủ Design (`element_types`)** — V3/V4:
   - Đã đồng bộ toàn bộ 21 file tài nguyên trong `D:\Edit SofaZone\01_Tai_Nguyen_Co_Dinh\Elements` vào `templates/element_map.json`:
   - Bao gồm: `tv_retro` (Khung Sofa TV), `film_grain` (Phim 8mm hồi ức), `tv_sony`, `scout_frame`, các bảng `stats_table_1`..`5`, texture giấy cũ `paper_texture`, v.v.
   - Có cột **Ảnh / Video ví dụ** thực tế.
3. **Bảng 3: Phân loại Animation (`animation_types`)** — Ken Burns:
   - Các kiểu chuyển động: `auto` (Xen kẽ tự động), `zoom_in` (100% → 108%), `zoom_out` (108% → 100%), `static` (Đứng yên 100%).
   - Có cột **Ảnh / Video minh họa**.
4. **Bảng 4: Sound nền BGM (`bgm_types`)** — Track A2:
   - Gồm 10 bản BGM chuẩn kênh trong `Sounds/Background/`: `bgm_default`, `bgm_momentum` (nhịp nhanh dồn dập), `bgm_dark_ambient` (trầm u tối), `bgm_freedom` (hào hùng xúc động), `bgm_nastelbom` (kể chuyện hiện đại), `bgm_mid_1`..`5`.
   - Có nút **▶ Nghe thử / ⏹ Dừng** trực tiếp trên từng dòng.
5. **Bảng 5: Sound Effect SFX (`sfx_types`)** — Track A3:
   - Gồm các hiệu ứng trong `Sounds/SFX/`: `whoosh` (gió lướt chuyển cảnh), `camera_shutter` (tách máy ảnh), `data_beep` (nhảy số điện tử), `crowd_cheer` (cổ động viên hò reo), `whistle` (tiếng còi), `tv_glitch` (nhiễu tivi CRT), `film_projector` (máy chiếu 8mm), `impact_boom` (tiếng trống trầm cinematic).
   - Tự động map theo loại source (`auto_sfx_by_loai`: mặt báo → `camera_shutter`, số liệu → `data_beep`, khán đài → `crowd_cheer`...).
   - Có nút **▶ Nghe thử / ⏹ Dừng** trực tiếp trên từng dòng.

---

## 4. Cải tiến UI/UX & Bố Cục Khoa Học

### 1. Phân chia khu vực rõ ràng (Layout logic):
- **Cột Trái (Phần AI & Kịch bản)**:
  - Khung 1: File quy tắc `.txt` (`source_style_rules.txt`) có khóa/mở khóa an toàn.
  - Khung 2: Chọn CSV Timeline + Bối cảnh + Nút chạy **🤖 AI Gợi ý**.
  - Khung 3: Kho ví dụ đã dạy AI (`source_examples.json`).
- **Cột Phải (Phần Phân loại & Kết quả Timeline)**:
  - **Thanh lọc Filter Pills 5 bảng**: `Tất cả (5)`, `1. Source`, `2. Lớp phủ`, `3. Animation`, `4. Sound nền`, `5. Sound Effect`.
  - **Mỗi bảng có cụm nút độc lập ở góc phải**: `🔒 Đang khóa` / `✏️ Chỉnh sửa` / `＋ Thêm` / `💾 Lưu` / `✖ Hủy`.
  - **Bảng Timeline 11 cột đầy đủ**: `Đoạn/Câu`, `Lời thoại`, `Source chính`, `+ Source phụ`, `Lớp phủ (Element V3)`, `Chuyển động (Anim)`, `🎵 Sound nền`, `🔊 Sound Effect`, `Thời kỳ / Cầu thủ`, `Ghi chú dạy AI`, `Độ tự tin`.

### 2. Kéo giãn (Resizable) & Responsive toàn bộ container:
- **Kéo rộng ngang (`.split-resizer` & `.inner-split-resizer`)**: 2 cột chính của mọi tab và giữa các bảng phân loại nằm cạnh nhau.
- **Kéo dài dọc (`.v-split-resizer`)**: Nằm dưới mọi bảng, khung danh sách, textarea quy tắc, log box.
- **Kéo rộng cột bảng (`.th-col-resizer`)**: Mọi cột trong các bảng dữ liệu đều kéo rộng/hẹp được.
- **Responsive `@container`**: Tự động chuyển bố cục dọc khi một bên bị kéo hẹp lại, không bao giờ bị cắt mất nội dung.

---

## 5. Cấu trúc File & Thư mục quan trọng

```
Code_AI/
├── .agents/
│   └── AGENTS.md                    ← FILE LUẬT CHÍNH — AI phải đọc trước khi code
├── doc/
│   └── Session_Summary_20261109.md  ← FILE NÀY — Bản tóm tắt tổng thể hệ thống
├── src/
│   ├── index.html                   # UI 6 tab chính (script renderer.js ở cuối body)
│   ├── index.css                    # CSS hệ thống, layout, resizers, filter pills, audio cells
│   └── renderer.js                  # Toàn bộ logic giao diện, 5 bảng phân loại, audio preview, IPC
├── python/
│   ├── main.py                      # Flask API server port 5599
│   ├── source_suggester.py          # AI Suggester 5 bảng (RAG Embedding + Gemini 3.8 Flash)
│   ├── premiere_xml_generator.py    # FCP XML Generator (V1-V4, A1-A3, BGM merge, SFX, Transitions)
│   ├── clip_splitter.py             # FFmpeg scene detect cắt clip highlight
│   └── token_tracker.py             # Quản lý quota Token Gemini theo từng API Key
└── templates/
    ├── classifications.json         # Dữ liệu 5 bảng phân loại (Source, Element, Anim, BGM, SFX)
    ├── element_map.json             # 21 file overlay/texture trong D:\Edit SofaZone\...\Elements
    ├── sound_map.json               # Mapping BGM (Background/) & SFX (SFX/) + auto_sfx_by_loai
    ├── source_style_rules.txt       # File dặn AI quy tắc phong cách dựng
    └── source_examples.json         # Kho bài mẫu embedding dạy AI
```

---

## 6. Cấu trúc CSV Xuất Ra (`2_CSV_PhanLoaiSource.csv` — 9 Cột)

```csv
doan,cau,y,loai_source,thoi_ky,element,anim,bgm,sfx
1,1,1,rai_1,Euro 2008 · Tây Ban Nha / Xavi,auto,zoom_in,bgm_default,none
1,1,1.1,anh_thong_so + rai_1,Euro 2008 · Xavi / Tây Ban Nha,stats_table_1,static,bgm_default,data_beep
1,2,,rai_4 + anh_thoi_diem,Euro 2008 · Tây Ban Nha / Xavi,scout_frame,zoom_out,bgm_momentum,camera_shutter
```

---

## 7. Các Quy tắc Bắt buộc Khi Tiếp Tục Phát Triển (Trích AGENTS.md)

1. **Tech Stack bất di bất dịch**: Electron 28.x + HTML/Vanilla JS/CSS + Python 3.13 Flask + Google Gemini (`gemini-3.8-flash`).
2. **Rule #11**: Trong `index.html`, thẻ `<script src="renderer.js"></script>` **bắt buộc** nằm ở dòng cuối cùng trước `</body>`. Trong `renderer.js`, lệnh `init();` **bắt buộc** nằm ở dòng cuối cùng của file, mỗi `init*()` bọc `try/catch` riêng.
3. **Rule #13**: Sau mỗi lần chỉnh sửa hoặc viết code mới, **bắt buộc** tự động chạy syntax check (`ast.parse` cho Python, `node --check` cho JS), sau đó chạy `git add`, `git commit -m "Mô tả tiếng Việt"` và `git push`.
4. **Rule #14**: Mọi container lớn nhỏ đều phải có resizer (ngang/dọc/cột) và responsive `@container`.
5. **Rule #17**: Mọi card trong flex column container bắt buộc phải có `flex-shrink: 0;` để không bị bẹp khi co giãn.
6. **Không chạy `npm start` từ terminal AI**: Luôn để user tự chạy trên terminal máy hoặc bấm `Ctrl+R` trên ứng dụng Electron.
