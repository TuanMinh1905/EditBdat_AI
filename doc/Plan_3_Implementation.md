# Hoàn tất Plan 3 — Mã tài nguyên, preview và xác minh

Ngày triển khai: 2026-11-11.

## Kết quả trên thư viện thật

- Đổi tên 20 Element và 10 BGM theo mã; giữ `intro.mp4` vì đã đúng tên.
- Đồng bộ `templates/element_map.json`, `templates/sound_map.json`, `templates/classifications.json` và giá trị mặc định trong `src/renderer.js`.
- Giữ nguyên mô tả, mã phân loại và chỉnh sửa đã có của người dùng.
- Kiểm tra lại: 21 Element + 10 BGM tồn tại; 8 SFX chưa có file. Không tạo file âm thanh giả.
- Script chạy lại không đổi tên hoặc ghi metadata thêm.

Backup metadata trước migration và danh sách tên cũ/mới nằm tại:
`output/asset_migrations/20261111_032327_004652/`.
File `manifest.json` có trạng thái `complete`. Nội dung media không bị chuyển mã hoặc chỉnh sửa. Nếu cần trả về tên cũ, dùng cặp `source`/`destination` trong manifest và bản sao metadata trong cùng thư mục; không khôi phục nguyên renderer cũ sau khi đã phát triển thêm tính năng.

Báo cáo tồn tại file sau migration: `output/plan3_asset_audit.json`.

## Cách dùng

1. Khởi động lại ứng dụng để nạp Python backend, Electron main/preload và UI mới. Chỉ `Ctrl+R` không nạp lại IPC/backend.
2. Trong **Gen XML**, kiểm tra **Thư mục Element** và **Thư mục Sounds**. Sounds là thư mục cha của `Background` và `SFX`. Hai đường dẫn được lưu và dùng chung cho preview/xác minh/xuất.
3. Trong **Gợi ý Source - Animation**, Bảng 2 tự hiện ảnh/video từ mapping thật. Bảng 4/5 nghe thử từ cùng mapping; âm thanh chưa có hiển thị **Thiếu file**. Ảnh/video minh họa do người dùng tải lên vẫn được ưu tiên.
4. Chọn input như trước và bấm **Gen XML**. Modal liệt kê mã, nhóm, file thực tế, dòng CSV sử dụng và trạng thái. Các mã tự động, lớp phủ ghép `+` và texture V4 đều được kiểm tra.
5. Có thể hủy để sửa hoặc chọn **Vẫn tiếp tục Gen XML**. Khi tiếp tục, generator bỏ qua lớp phủ/BGM/SFX không tồn tại hoặc mapping không hợp lệ, ghi lý do vào log và `skipped_assets`. Các track còn lại vẫn được xuất; Source/Voice vẫn dùng pipeline hiện tại.

Sau này chỉ cần bổ sung file SFX đúng tên vào `Sounds/SFX/` và tải lại dữ liệu/ứng dụng để nghe thử. Có thể đặt `bgm=none`, `sfx=none`, `element=none` trong CSV để tắt tài nguyên cho một dòng.

## Mã nguồn và giao tiếp

- `python/rename_assets.py`: mặc định chỉ dry-run; `--apply` mới thay đổi dữ liệu. Kiểm tra trùng tên, kiểm tra đường dẫn trong thư mục đã chọn, lưu backup và rollback khi lỗi. Bỏ qua sentinel `auto`/`none`, giữ đường dẫn con của sound tùy chỉnh.
- `python/asset_service.py`: đọc mapping, kiểm tra file và tổng hợp tham chiếu CSV. Dùng chung resolver với `premiere_xml_generator.py`.
- `POST /api/verify-assets`: `source_plan_csv` (hoặc `csv_path`), `element_dir`, `sound_root`, tùy chọn `texture_id`, `sound_map_path`. Trả `items`, `total`, `ok`, `missing`, `all_ok`, `rows`. Quét toàn bộ CSV phân loại, kể cả dòng chưa được timeline dùng.
- `POST /api/asset-thumbnail`: `element_dir`, `sound_root`; trả các tài nguyên và URL preview cho file tồn tại. Renderer lấy qua preload/IPC.
- `GET /api/asset-thumbnail/<token>/<filename>`: stream file đã được đăng ký từ mapping, hỗ trợ HTTP Range để tua video/audio. Không nhận đường dẫn file tùy ý từ URL.
- CSV/mapping không đọc được sẽ báo lỗi để sửa input. File tài nguyên thiếu là cảnh báo, không phải lỗi làm dừng export.
- BGM chỉ nối những đoạn cùng mã và liền frame, không kéo qua khoảng `none`.

## Kiểm thử

Kết quả cuối: **12/12 test backend + 12/12 test frontend đạt**. API preview của cả 31 file thật trả HTTP 206 và đúng 16 byte yêu cầu. Kiểm tra migration lần hai không phát sinh đổi tên hoặc thay đổi metadata.

Môi trường kiểm thử riêng `.venv` dùng Python 3.14 có trên máy, cài đúng `python/requirements.txt`. Không thay đổi tech stack hoặc dependency của project.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s python -p test_assets.py -v
node --test src/testAssetVerification.js
node --check main.js
node --check preload.js
node --check src/renderer.js
```

Backend kiểm tra: dry-run/apply/idempotency, trùng tên, rollback khi lỗi ghi metadata, sound trong thư mục con, auto/none/ghép mã/texture, mã lạ, thiếu root, CSV sai, chặn đường dẫn vượt thư mục, preview Range, đường dẫn XML, bỏ qua tài nguyên thiếu và giữ khoảng BGM tắt.

Frontend kiểm tra luồng verify → modal → export bằng mã hàm thực tế với DOM mô phỏng. Đã kiểm tra cú pháp toàn bộ Python bằng `ast.parse`, JavaScript bằng `node --check` và đối chiếu trực tiếp mapping với thư viện thật. Chưa kiểm thử bằng thao tác trong cửa sổ Electron/Premiere; không khởi chạy `npm start` từ terminal agent theo quy tắc dự án.
