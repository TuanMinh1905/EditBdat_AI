# API AI: Gemini Key 1/2 và OpenAI Key 3 — 13/11/2026

Trong **Cài đặt → API AI**, mỗi key có **Chỉnh sửa**, **Lưu**, hiện/ẩn và ô **Sử dụng**. Nhập rồi bấm **Lưu ngay cạnh ô key**. Khi hiện “Đã lưu”, key sẽ tự nạp lại sau khi đóng/mở app. Key đã lưu được khóa; bấm Chỉnh sửa để thay, hoặc lưu ô trống để gỡ. Bản đang nhập chưa lưu không được dùng gọi API. Lưu riêng chỉ cập nhật ô đó, giữ các ô khác đang sửa.

Ô **Sử dụng** được lưu ngay, áp dụng từ yêu cầu AI kế tiếp và không xóa key. Yêu cầu đã gửi vẫn có thể hoàn tất. Có thể bật một key hoặc bất kỳ tổ hợp Key 1/2/3 nào. Cấu hình Gemini cũ mặc định bật Key 1/2; Key 3 mặc định tắt. Key nằm trong cấu hình ứng dụng trên máy, không nằm trong CSV, snapshot hay repository. Ghi thất bại thì app báo lỗi và giữ bản đang nhập.

## Thứ tự dự phòng hiện hành

**Thử hết model Gemini Key 1 → hết model Key 2 → OpenAI Key 3.** Ví dụ: A/Key 1 → B/Key 1 → A/Key 2 → B/Key 2 → OpenAI/Key 3. Bỏ qua key tắt, trống và key Gemini trùng. Đây là quyết định mới thay thứ tự model trước key ngày 12/11.

- Quota 429: bỏ qua cặp key/model ít nhất 60 giây, hoặc lâu hơn theo RetryInfo/Retry-After; thử model kế trên cùng key trước khi chuyển key.
- Model/key không dùng được (HTTP 400/401/403/404): bỏ qua cặp đó tạm thời và thử lựa chọn kế. Có thể sửa key/model rồi lưu.
- Mạng/timeout/server Gemini 408/500/502/503/504: thử lại **một lần** với cùng payload; vẫn lỗi thì sang key kế, không lặp mọi model trên server lỗi. Gemini chờ phản hồi tối đa 60 giây/lần, kết nối tối đa 20 giây.
- Gemini được bật đều không thể xử lý: dùng OpenAI nếu Key 3 đã lưu và bật. OpenAI thành công thì tiếp tục bằng OpenAI đến hết lượt, kể cả Continue/khôi phục phiên. Tắt Key 3 hoặc OpenAI lỗi thì thử các key Gemini còn bật.
- Tất cả key được bật đều lỗi: **Source tạm dừng, thông báo và giữ kết quả**, không tự gửi lại định kỳ. Kiểm tra/lưu cấu hình rồi **Continue**. Chỉ các dòng chưa xong được gửi lại. Tạo/preview/sửa timeline dừng và báo để chạy lại, giữ đầu vào.
- Thông báo model/provider/key xuất hiện ngay trên tiến độ Source và nhật ký; bỏ thông báo của lượt đã Làm mới.

MAX_TOKENS là giới hạn độ dài phản hồi, khác quota tài khoản. Gemini trống sẽ thử lựa chọn khác; phản hồi có nội dung vẫn qua kiểm tra JSON/mã và có thể yêu cầu bổ sung một lần. Lượt bổ sung lỗi giữ phần hợp lệ từ lượt đầu, không tự điền kết quả giả. OpenAI chưa hoàn tất/trả cấu trúc sai không được coi là thành công.

## Model và phạm vi

Gemini mặc định theo ảnh quota ngày 12/11: gemini-3.8-flash, gemini-3.6-flash, gemini-3-flash-preview, gemini-2.5-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-2.5-flash-lite. Chọn model có quota >0 trong ảnh, ưu tiên Flash rồi Flash-Lite; chưa benchmark trên bài user. Có thể sửa tối đa 8 mã rồi **Lưu cài đặt**.

OpenAI mặc định **gpt-6.1-sol**, reasoning medium, có ô model riêng để đổi rồi Lưu cài đặt. Dùng Responses API, store:false; Source dùng JSON schema nghiêm ngặt rồi qua bộ kiểm tra phân loại hiện có. Chưa xác nhận quyền truy cập/model/quota bằng Key 3 thực tế. Tài liệu: [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Dự phòng áp dụng cho **mọi chức năng sinh/phân tích nội dung AI**: Source và tạo/preview/sửa timeline. Kho ví dụ vẫn được dùng; Gemini embedding có timeout ngắn riêng, không gọi khi Gemini tắt hoặc lượt đã chuyển OpenAI. Không có embedding thì đối chiếu ví dụ theo từ khóa. Không trộn vector OpenAI vào kho Gemini.

Thống kê có **Key 1 / Key 2 / OpenAI Key 3**, ghi usage cho key/model thực sự trả phản hồi. Reasoning OpenAI tách khỏi output để tránh đếm hai lần. Bộ đếm chỉ phản ánh usage app nhận được, không phải quota còn lại; Reset không cấp thêm quota.

Hai key Gemini cùng Cloud project dùng chung quota. Google AI Pro và hạn mức Gemini API quản lý riêng. Nguồn: [Models](https://ai.google.dev/gemini-api/docs/models), [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Google AI plans](https://ai.google.dev/gemini-api/docs/google-ai-plans).

Sau cập nhật, **đóng hẳn rồi mở lại app** để nạp main/preload/backend mới. Phiên gần nhất vẫn giữ, không cần Làm mới. Điều phối/HTTP kiểm thử bằng mô phỏng, chưa gọi sinh nội dung thật bằng Gemini/OpenAI trong lần thay đổi này.