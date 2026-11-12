# Hai API key Gemini — 12/11/2026

Trong **Cài đặt → Google Gemini API**, nhập **API Key 1 — ưu tiên** và **API Key 2 — dự phòng**, rồi bấm **Lưu cài đặt**. Các key được lưu cùng cấu hình ứng dụng trên máy, không nằm trong CSV, snapshot phân tích hay repository. Cấu hình một key cũ vẫn dùng bình thường; có thể chỉ nhập Key 2.

App ưu tiên Key 1. Khi API trả HTTP **429**, app thử lại cùng yêu cầu/model bằng key còn lại, tối đa một lượt cho mỗi key khác nhau. Key vừa dùng thành công được ưu tiên cho các nhóm tiếp theo trong cùng phiên backend. Key chạm quota được nghỉ ít nhất 60 giây, hoặc lâu hơn theo RetryInfo/Retry-After của Google. Trạng thái này áp dụng riêng cho mỗi model, không tự đổi model phân tích.

Nếu cả hai key chạm quota, phân tích dừng và giữ dữ liệu đã lưu. Bấm **Phân tích** để chạy tiếp sau khi quota cho phép. Timeout mạng, HTTP 400/403/404/503 và `MAX_TOKENS` không kích hoạt chuyển key. `MAX_TOKENS` là giới hạn độ dài của một phản hồi, khác quota API.

Cơ chế dự phòng dùng cho phân tích Source, embedding ví dụ và các chức năng tạo/preview/sửa timeline Gemini. Trong phần thống kê, chọn **Key 1 / Key 2** để xem bộ đếm riêng. Token được ghi cho key thực sự trả phản hồi; bộ đếm chỉ phản ánh usage app nhận được, không phải quota còn lại trên Google. Reset bộ đếm không cấp thêm quota.

Hai key cùng Google Cloud project dùng chung quota. Hai Gmail có Google AI Pro không tự bảo đảm hạn mức API cao hơn: quyền lợi thuê bao AI Studio và Gemini API của ứng dụng ngoài được quản lý riêng. Kiểm tra project và quota thực tế của mỗi key trong AI Studio.

Nguồn Google: [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Google AI plans — API usage](https://ai.google.dev/gemini-api/docs/google-ai-plans).

Sau khi cập nhật phiên bản này, đóng hẳn rồi mở lại ứng dụng để nạp main process/backend mới. Không cần làm mới hoặc xóa phiên phân tích đang có. Kiểm thử dùng key và phản hồi giả; chưa thử quota thật bằng hai tài khoản của user.
