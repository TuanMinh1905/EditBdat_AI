# Kế hoạch triển khai 3 Giải pháp: Xác minh Mã → File

> Mục tiêu: Đảm bảo mã (code) trong Bảng 2 (Lớp phủ), Bảng 4 (BGM), Bảng 5 (SFX) luôn trỏ đúng tới file thực tế trên ổ đĩa.

> **Trạng thái 2026-11-11:** Đã triển khai cả 3 giải pháp. Đã đổi tên 20 Element + 10 BGM; `intro.mp4` giữ nguyên. Kiểm tra thực tế: 21 Element và 10 BGM có file; 8 SFX mới có mapping, chưa có file. Theo yêu cầu bổ sung của user, thiếu tài nguyên không chặn xuất XML: cảnh báo trước khi xuất, sau đó bỏ qua lớp phủ/âm thanh thiếu nếu chọn tiếp tục.
>
> Chi tiết sử dụng, bản sao lưu và kiểm thử: [Plan_3_Implementation.md](Plan_3_Implementation.md).

---

## 🥇 Giải pháp 1: Rename Asset Files = Code

**Script `python/rename_assets.py`** — Đổi tên tất cả file Element/BGM/SFX cho khớp mã.

### Bảng mapping cụ thể:

#### Elements (21 files trong `D:\Edit SofaZone\01_Tai_Nguyen_Co_Dinh\Elements`):

| Mã (code) | File gốc (hiện tại) | File mới |
|---|---|---|
| `tv_retro` | `tv FRAME2.png` | `tv_retro.png` |
| `tv_green_frame` | `ChatGPT Image 20_46_49 15 thg 8, 2026.png` | `tv_green_frame.png` |
| `tv_crt_gemini` | `Gemini_Generated_Image_xf3xbcxf3xbcxf3x.png` | `tv_crt_gemini.png` |
| `tv_sony` | `large-vecteezy_vintage-television-with-green-screen-on-a-wooden-table_54047797_large.mp4` | `tv_sony.mp4` |
| `tv_dolly` | `Television - Retro - Green Screen...webm` | `tv_dolly.webm` |
| `film_grain` | `8mm Film Frame Overlay...mp4` | `film_grain.mp4` |
| `scout_frame` | `scout frame.png` | `scout_frame.png` |
| `stats_table` | `Comparison Table List Infographic Graph.png` | `stats_table.png` |
| `stats_table_1` | `Comparison Table List Infographic Graph (1).png` | `stats_table_1.png` |
| `stats_table_2` | `Comparison Table List Infographic Graph (2).png` | `stats_table_2.png` |
| `stats_table_3` | `Comparison Table List Infographic Graph (3).png` | `stats_table_3.png` |
| `stats_table_4` | `Comparison Table List Infographic Graph (4).png` | `stats_table_4.png` |
| `stats_table_5` | `Comparison Table List Infographic Graph (5).png` | `stats_table_5.png` |
| `circle_gold` | `5.png` | `circle_gold.png` |
| `circle_blue` | `o.png` | `circle_blue.png` |
| `paper_texture` | `paper texture.png` | `paper_texture.png` |
| `paper_texture_2` | `paper texture 2.png` | `paper_texture_2.png` |
| `texture_dark` | `textture.png` | `texture_dark.png` |
| `texture_2` | `texture2.png` | `texture_2.png` |
| `grid_orange` | `vecteezy_orange-grid-animation...mp4` | `grid_orange.mp4` |
| `intro` | `intro.mp4` | `intro.mp4` ← đã đúng |

#### BGM (10 files trong `Sounds/Background/`):

| Mã | File gốc | File mới |
|---|---|---|
| `bgm_default` | `nhạc nền background.mp3` | `bgm_default.mp3` |
| `bgm_momentum` | `chestnutmusicstudios-05-momentum-589472.mp3` | `bgm_momentum.mp3` |
| `bgm_dark_ambient` | `cinematic-soul-dark-ambient-background-music-617907.mp3` | `bgm_dark_ambient.mp3` |
| `bgm_freedom` | `good_b_music-price-of-freedom-33106.mp3` | `bgm_freedom.mp3` |
| `bgm_nastelbom` | `nastelbom-background-music-617075.mp3` | `bgm_nastelbom.mp3` |
| `bgm_mid_1` | `mid.mp3` | `bgm_mid_1.mp3` |
| `bgm_mid_2` | `mid2.mp3` | `bgm_mid_2.mp3` |
| `bgm_mid_3` | `mid3.mp3` | `bgm_mid_3.mp3` |
| `bgm_mid_4` | `mid4.mp3` | `bgm_mid_4.mp3` |
| `bgm_mid_5` | `mid5.mp3` | `bgm_mid_5.mp3` |

#### SFX (8 files trong `Sounds/SFX/`):

| Mã | File gốc | File mới |
|---|---|---|
| `whoosh` | `whoosh.mp3` | `whoosh.mp3` ← đã đúng |
| `camera_shutter` | `camera_shutter.mp3` | `camera_shutter.mp3` ← đã đúng |
| `data_beep` | `data_beep.mp3` | `data_beep.mp3` ← đã đúng |
| `crowd_cheer` | `crowd_cheer.mp3` | `crowd_cheer.mp3` ← đã đúng |
| `whistle` | `whistle.mp3` | `whistle.mp3` ← đã đúng |
| `tv_glitch` | `tv_glitch.mp3` | `tv_glitch.mp3` ← đã đúng |
| `film_projector` | `film_projector.mp3` | `film_projector.mp3` ← đã đúng |
| `impact_boom` | `impact_boom.mp3` | `impact_boom.mp3` ← đã đúng |

> [!NOTE]
> Các tên SFX trong mapping đã đúng. Kiểm tra ổ đĩa ngày 2026-11-11 cho thấy chưa có 8 file SFX; script báo thiếu và giữ mapping để bổ sung sau.

### Sau khi rename, script sẽ tự động cập nhật:
1. `templates/element_map.json` — đổi field `"file"` cho mỗi element
2. `templates/sound_map.json` — đổi field `"file"` cho mỗi BGM
3. `templates/classifications.json` — đổi field `"param"` cho element_types và bgm_types
4. `src/renderer.js` — đổi `DEFAULT_ELEMENT_TYPES` và `DEFAULT_BGM_TYPES` (const arrays)

---

## 🥈 Giải pháp 2: Preview Ảnh/Video trong Bảng phân loại

UI đã có cột "Ảnh / Video" và cơ sở hạ tầng (lightbox modal, drag-drop upload, hover-play video). Hiện tại cột đang trống vì field `image` = `""`.

Sau khi rename xong (🥇), có thể tự động gắn thumbnail bằng cách load trực tiếp từ file đã đổi tên trong thư mục Elements/Sounds.

**Cách làm:** Thêm API endpoint `/api/asset-thumbnail` để serve file ảnh/video từ thư mục tài nguyên → frontend hiển thị trực tiếp.

---

## 🥉 Giải pháp 3: Verification trước Gen XML

Thêm **bước xác minh** trước khi Gen XML:
1. API endpoint `/api/verify-assets` — nhận CSV path + element_dir + sound_root → quét tất cả mã → kiểm tra file tồn tại
2. UI: Hiện bảng kết quả ✅/❌ trong modal trước khi Gen XML
3. Nếu tất cả ✅ → cho phép Gen XML; nếu có ❌ → cảnh báo nhưng vẫn cho phép tiếp tục

---

## Thứ tự thực hiện

1. **🥇 Tạo `python/rename_assets.py`** — Script đổi tên file + cập nhật JSON + JS
2. **Chạy script** — User xác nhận rồi chạy
3. **🥉 Thêm API `/api/verify-assets`** — Endpoint kiểm tra
4. **🥉 Thêm UI verification** — Modal hiển thị kết quả
5. **🥈 Kết nối preview** — Sau rename, thumbnail tự động hiện
6. **Commit & push**
