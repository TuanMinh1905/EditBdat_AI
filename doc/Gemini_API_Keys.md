# Hai API key Gemini — 12/11/2026

Trong **Cài đặt → Google Gemini API**, nhập **API Key 1 — ưu tiên** và **API Key 2 — dự phòng**, rồi bấm **Lưu cài đặt**. Các key được lưu cùng cấu hình ứng dụng trên máy, không nằm trong CSV, snapshot phân tích hay repository. Cấu hình một key cũ vẫn dùng bình thường; có thể chỉ nhập Key 2.

Trong **Model ưu tiên**, đặt mã model theo thứ tự cao xuống thấp, cách nhau bằng dấu phẩy (tối đa 8 model). App chạy **A/Key 1 → A/Key 2 → B/Key 1 → B/Key 2…**: chỉ sang model sau khi các key của model trước bị giới hạn hoặc không khả dụng. Key trùng bị bỏ qua. Mỗi cặp chạm quota nghỉ ít nhất 60 giây, hoặc lâu hơn theo RetryInfo/Retry-After. Khi quota lựa chọn ưu tiên phục hồi, app lại ưu tiên lựa chọn đó.

Mặc định đề xuất **Gemini 4 Carbon → Gemini 4 Argon → Gemini 3.8 Flash → Gemini 3.6 Flash → Gemini 3.5 Flash-Lite**, dựa trên tài liệu công khai; chưa kiểm chứng chất lượng trên bài user hay quyền dùng từng key. Có thể sửa danh sách trong Cài đặt rồi lưu. Thông báo đổi model/key hiện trên thanh tiến độ và nhật ký, được lọc theo lượt đang chạy để bỏ thông báo cũ sau khi Làm mới.

Nếu mọi model/key chạm quota, **phân tích Source tự chờ rồi thử lại các dòng còn thiếu**, có đếm ngược. Pause/Continue/Làm mới vẫn hoạt động. Phần đã xong được giữ, kể cả quota hết trong lượt AI bổ sung. Đóng/mở lại app khôi phục tạm dừng, giữ thời điểm chờ; bấm Continue khi muốn tiếp tục.

Với nhiều model, HTTP 403/404 khiến cặp không có quyền/không khả dụng bị bỏ qua 15 phút và có thông báo. Mọi cặp đều không có quyền thì cần sửa key/model. Timeout, HTTP 400/503 và `MAX_TOKENS` không được coi là quota; tác vụ có thể retry riêng hoặc báo lỗi. `MAX_TOKENS` là giới hạn độ dài một phản hồi, khác quota API.

Cơ chế dự phòng dùng cho phân tích Source, embedding ví dụ và các chức năng tạo/preview/sửa timeline Gemini. Trong phần thống kê, chọn **Key 1 / Key 2** để xem bộ đếm riêng. Token được ghi cho key thực sự trả phản hồi; bộ đếm chỉ phản ánh usage app nhận được, không phải quota còn lại trên Google. Reset bộ đếm không cấp thêm quota.

Hai key cùng Google Cloud project dùng chung quota. Hai Gmail có Google AI Pro không tự bảo đảm hạn mức API cao hơn: quyền lợi thuê bao AI Studio và Gemini API của ứng dụng ngoài được quản lý riêng. Kiểm tra project và quota thực tế của mỗi key trong AI Studio.

Nguồn Google: [Models](https://ai.google.dev/gemini-api/docs/models), [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Google AI plans — API usage](https://ai.google.dev/gemini-api/docs/google-ai-plans).

Sau khi cập nhật, đóng hẳn rồi mở lại app để nạp main process/backend mới; không cần xóa phiên đang có. Sinh nội dung/quota được kiểm thử bằng mock. Đã thử đọc danh sách model bằng key lưu trong app nhưng gặp ConnectTimeout; Key 2 chưa được lưu lúc kiểm tra. Không gửi bài phân tích cho Google trong lần kiểm tra danh sách này.
