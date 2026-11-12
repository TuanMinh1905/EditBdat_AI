# Source và Thời điểm — 12/11/2026

## Cách dùng

Đóng hẳn ứng dụng rồi mở lại để nạp backend mới. Chọn `1_CSV_Timeline.csv` ở Gợi ý Source: AI đọc toàn bài, phân tích từng đoạn/câu/ý rồi điền Source, lớp phủ, Animation, BGM, SFX và bối cảnh lịch sử.

| Mã | Nội dung |
|---|---|
| `rai_1` | Tên nhóm Highlight; không chọn trực tiếp cho một ý |
| `rai_1_1` | Bàn thắng |
| `rai_1_2` | Kiến tạo |
| `rai_1_3` | Highlight chung: kỹ thuật, xử lý bóng, sút phạt, penalty… |
| `rai_2` | Bối cảnh: đường hầm, bước ra sân, ăn mừng, tri ân CĐV, cùng đồng đội… |

Các loại phỏng vấn, tập luyện, khán đài, ảnh thông số, ảnh thời điểm, mặt báo và sa bàn vẫn giữ riêng. Ví dụ sút phạt thành bàn có thể chọn `rai_1_1`, nhãn kỹ năng là `FreeKick`.

Ở đầu mỗi đoạn có **Xen rai_2 trong đoạn**. AI chỉ chọn rải bối cảnh khi lời thoại phù hợp. Tắt lựa chọn này sẽ gỡ `rai_2` khỏi đoạn; nếu Source còn trống, bấm AI để phân tích lại các ý đó.

## Đặt tên video khi nhập kho

Tool lấy phân loại từ **tên file**. Không cần xem lại hoặc dùng AI kiểm chứng video khi nhập kho.

```text
rai_1_1_Xavi_Spain_Euro2008_001.mp4
rai_1_2_Xavi_Barcelona_2010_001.mp4
rai_1_3_Iniesta_Barcelona_2008-2012_Skill_001.mp4
rai_2_Xavi_Spain_Euro2008_Celebrate_001.mp4
```

Thứ tự: `{loai}_{cau_thu}_{doi_bong}_{thoi_diem}_[ky_nang]_[STT].mp4`.

- Cầu thủ/đội: viết liền, không dấu, không có `_`, ví dụ `Xavi`, `AndresIniesta`, `Spain`, `Barcelona`.
- Thời điểm: năm (`2010`), khoảng năm đầy đủ (`2008-2012`), hoặc giải đấu kèm năm (`Euro2008`, `WorldCup2010`, `UCL2011`). Dùng `2010-2011` cho mùa giải, tránh `2010/11`.
- Kỹ năng và số thứ tự ở video đầu vào là tùy chọn. Tool B tự sinh số thứ tự cho clip con.
- Chưa rõ thời điểm: dùng `Unknown` hoặc để trống ô Thời điểm trong Tool B. Những clip này không được tự chọn cho câu cần mốc lịch sử.
- Khi chọn video, Tool B hiện ngay loại, cầu thủ, đội, kỹ năng và Thời điểm đã đọc từ tên file. Có thể sửa các ô trước khi cắt. Clip con và catalog kế thừa các thông tin này.

## Sửa bối cảnh trên bảng AI

Cột **Thời điểm · Cầu thủ · Đội** nằm ngay cạnh lời thoại. Bấm vào bối cảnh để mở các ô cầu thủ, đội bóng, thời điểm và giải đấu.

- Sửa trực tiếp một ý: tự bật **Giữ khi chạy AI**.
- **Áp dụng cho câu**: đưa bối cảnh sang các ý cùng câu, giữ các ý đã sửa riêng.
- **Áp dụng cho đoạn**: đưa bối cảnh sang các ý cùng đoạn, giữ các câu/ý đã sửa riêng.
- Bỏ chọn **Giữ khi chạy AI** khi muốn AI tự xác định lại.
- AI đọc ngữ cảnh đoạn → câu → ý, đổi bối cảnh khi lời thoại chuyển năm, đội hoặc cầu thủ. Ô gợi ý bối cảnh ở đầu bảng chỉ dùng làm gợi ý; không tự điền một năm cho toàn bài.

Đoạn quá chi tiết, chiến thuật phức tạp hoặc chưa xác định được thời điểm sẽ để trống, tô vàng và ghi lý do. Có nút **Làm thủ công** cho từng ý. Các dòng thủ công vẫn xuất CSV được và không đưa vào kho ví dụ.

## Khi chọn Source để dựng XML

Tool đối chiếu loại Source, cầu thủ, đội, thời điểm và giải đấu đã khai báo. Thời điểm này là lịch sử nội dung, khác cột `start` và timecode trên timeline.

- Câu về Xavi, Spain, Euro2008 không được lấy Iniesta, Barcelona hoặc clip 2018.
- Câu cho phép giai đoạn 2008–2012 có thể lấy clip năm 2010.
- Câu yêu cầu riêng 2008 không tự lấy video tổng hợp ghi 2008–2012: tên file chưa cho biết phần nào thuộc 2008. Khi cần đúng một năm, nên chuẩn bị video mang mốc đó.
- Yêu cầu Euro2008 cần clip có thông tin Euro; chỉ ghi `2008` chưa đủ xác định giải đấu.
- Không đủ clip phù hợp: giữ khoảng trống và đặt marker `THIEU SOURCE DUNG THOI DIEM`. Không lấy clip khác năm, khác cầu thủ hoặc clip bất kỳ để lấp chỗ trống.
- Source để trống từ bước phân loại: marker `CAN LAM THU CONG`.

## Dữ liệu cũ

`schema_version=2` phân biệt nghĩa mới/cũ của `rai_2`. CSV phân loại và catalog mới có cột phiên bản này; không xóa cột khi chỉnh ngoài ứng dụng.

| Dữ liệu v1 | Được đọc thành |
|---|---|
| `rai_4` | `rai_2` bối cảnh |
| `rai_1`, `rai_2`, `rai_2_1`, `rai_2_2`, `rai_3` + Goal/Assist rõ ràng | `rai_1_1` / `rai_1_2` |
| Các mã rải cũ chưa có nhãn hành động | `rai_1_3` chung |

Tên `rai_2` không có phiên bản/thời điểm được coi là mã cũ. Để dùng nghĩa mới trong tên video, hãy thêm Thời điểm hoặc `Unknown` theo ví dụ trên.

Catalog cũ được chuyển cách đọc trong bộ nhớ, giữ đường dẫn vật lý cũ qua `source_relpath`; không di chuyển hàng loạt video. Khi ghi lại catalog hoặc xuất đè CSV v1, tool tạo bản `.v1.bak` một lần. Thời điểm chưa có trong tên file/dữ liệu thì để trống. Có thể nạp lại video có tên theo quy ước mới để tạo catalog đủ thời điểm, hoặc bổ sung các cột thời điểm/giải đấu cho catalog đang có.

Bản phân loại và quy tắc trước refactor được giữ tại `templates/backups/source_v1_before_20261112/`. Những quy tắc riêng về lớp phủ, Animation và cảnh làm thủ công được giữ lại. Cache phân tích v1 không tự áp vào bảng v2; được lưu ở `sg_analysis_v1_backup` khi khôi phục phiên cũ.

CSV v2 giữ 10 cột cũ và bổ sung `cau_thu,doi_bong,thoi_diem,su_kien,context_locked,context_scope,allow_rai_2,schema_version,analysis_status,reason,start,text`. `thoi_ky` còn giữ để tương thích; bốn cột bối cảnh riêng là dữ liệu dùng để chọn clip. Nạp CSV phân loại đã xuất sẽ mở để chỉnh, không tự chạy lại AI.

## Kiểm thử

```powershell
node --check main.js
node --check preload.js
node --check src/renderer.js
node --test src/testSourceSuggester.js src/testAssetPreviewLoading.js src/testAssetVerification.js src/testBackendStartup.js
# Từ thư mục python:
..\.venv\Scripts\python.exe -m unittest test_source_metadata test_source_suggester test_assets
# Từ thư mục gốc, chỉ chạy backend riêng; không mở Electron:
node src/testBackendStartup.js --smoke
```

Kiểm thử AI dùng phản hồi mô phỏng, có bài 406 dòng, giữ bối cảnh sửa tay, cấm `rai_2`, cảnh thủ công và đọc/ghi CSV. Đã thử FFmpeg thật với video mẫu: cắt hai clip + thumbnail, đọc catalog, chọn đủ 60 frame và đổi loại mà giữ thời điểm. Đã đọc thử file phân loại thực tế 406 dòng mà không sửa file gốc. Chưa kiểm tra trực tiếp trong Electron; Browser không có kết nối `iab` trong phiên triển khai. Chưa xác nhận chất lượng trả lời Gemini thật cho prompt v2.
