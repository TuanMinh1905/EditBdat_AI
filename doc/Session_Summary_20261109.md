# AE AI Tool — Session Summary (Cập nhật 2026-11-13)

## Sửa dấu Terminal và thông báo Key 3 bị bỏ qua (2026-11-13)

- User gửi ảnh phiên đã paused sau khi hai Gemini lỗi mạng/server, hỏi OpenAI có đang chạy không; sau đó bổ sung yêu cầu sửa dấu tiếng Việt ở Terminal VS Code. Giữ cả hai yêu cầu trong task.
- Đã đọc cấu hình thật theo metadata boolean: cả ba ô Sử dụng bật, Key1/2 có dữ liệu đã lưu, **Key3 chưa có API key đã lưu**. Không xuất/ghi lại giá trị credential. Đây là lý do OpenAI không được gọi trong lượt user gửi; không phải đang chạy ngầm. Không đổi lựa chọn/key thật của user, không gọi API thật.
- Router/API giữ thêm openai_enabled, key_status.openai_state (disabled/missing_key/ready) để phân biệt tắt với thiếu key. Khi thiếu key đã bật, log báo Bỏ qua OpenAI Key3 ngay lúc tạo nhóm; thông báo hết lựa chọn kèm hướng dẫn nhập/Lưu. Cài đặt cảnh báo vàng bên ô bật nhưng chưa lưu. Log gọi OpenAI ghi model/Key3/chờ phản hồi.
- Source bỏ live routing log đến muộn khi phase paused để giữ nguyên thông báo cuối; nút phân tích ghi Đã tạm dừng thay chữ AI đang phân tích cũ. Trạng thái paused không hiện đang dùng key từ kết quả cũ.
- Sửa Terminal: npm start/dev Windows chạy chcp 65001 trước Electron; spawn Python đặt PYTHONUTF8/PYTHONIOENCODING; main stdout/stderr setEncoding utf8 và ghép đủ dòng, flush dòng cuối. HTTP JSON cũng giải mã stream UTF-8 để không cắt giữa dấu tiếng Việt. Không sửa thành chữ ASCII mất dấu.
- Kiểm tra: **94 test Python đạt**, **71 test JavaScript đạt + 1 smoke bỏ qua** ở lượt thường; smoke backend thật riêng **9/9 đạt**. Có test chia từng byte của stdout/stderr/HTTP JSON, thiếu/tắt Key3, cảnh báo tại ô key và log đến muộn lúc paused. Probe terminal Windows thật với chcp 65001 in đúng câu Đã tạm dừng, giữ kết quả và Các lựa chọn Gemini được bật chưa thể tiếp tục; file probe tạm đã xóa. Không khởi chạy Electron hoặc gọi sinh nội dung thật.
- File sửa: package.json/main.js, router/API Python, renderer và các test liên quan; AGENTS, hướng dẫn API, workflows Cài đặt/Gợi ý Source. Không đổi luồng các tab khác. Cú pháp/diff kiểm tra trước commit/push. Giữ doc/aaa ngoài task.
- Bước dùng: đóng hẳn app, khởi động lại bằng npm start trong terminal máy user; phiên đã lưu vẫn giữ. Vào Cài đặt nhập OpenAI Key3 rồi Lưu, giữ tích Sử dụng và Continue. Không cần Làm mới. Các dòng terminal cũ đã hiển thị sai không sửa ngược; cần xem log mới sau khởi động.

## Xác minh mọi tổ hợp chọn key (2026-11-13)

- User hỏi đã xử lý chỉ một key và cặp Key 1+3/Key 2+3 chưa. Rà soát xác nhận bản `da0f46d` đã hỗ trợ mọi tổ hợp; không cần sửa logic chạy. Chỉ Key 3 dùng OpenAI từ đầu, chỉ Key 1/2 dùng Gemini của key đó; hai key chọn theo ưu tiên 1 → 2 → 3, bỏ qua ô tắt. Hết mọi key đang chọn thì Source tạm dừng/giữ kết quả, không tự dùng key đã bỏ tích.
- Ảnh user chỉ bật Key3 nhưng ô OpenAI trống; cần nhập/Lưu Key3. Key1/2 đã lưu nhưng bỏ tích không được dùng thay thế. Không đọc hay thay cấu hình/key thật trong lần kiểm tra này.
- Thêm kiểm thử đủ **8 tổ hợp × 3 tình huống** (provider hoạt động, Gemini hết quota, tất cả hết quota), kiểm tra bộ lọc cấu hình Source và timeline, thứ tự gọi thực tế và không gọi credential đã tắt. Thêm test UI đúng ảnh: chỉ Key3 bật nhưng trống/chưa lưu thì không gọi AI, kể cả Gemini còn key đã lưu.
- Kết quả: **22 test router Python đạt**, gồm 24 trường hợp của ma trận; **36 test Source JavaScript đạt**. Không gọi API thật, không mở Electron; các bộ khác không chạy lại vì không sửa runtime. Cú pháp/diff kiểm tra trước commit.
- Cập nhật bảng tổ hợp trong `doc/Gemini_API_Keys.md` và mục tương ứng ở `doc/workflows/settings.html`. Tab khác không đổi luồng. File sửa chỉ gồm hai bộ test và ba tài liệu; không sửa runtime/AGENTS vì không thêm cấu trúc hay quy tắc mới. Commit/push theo quy tắc bàn giao; `doc/aaa/` vẫn ngoài task.

## Lưu từng key, bật/tắt và dự phòng OpenAI Key 3 (2026-11-13, hiện hành)

- User đã chốt: thử **hết model Gemini Key 1 → hết model Key 2 → OpenAI Key 3**, thay thứ tự model trước key. Áp dụng mọi chức năng sinh/phân tích nội dung AI. OpenAI thành công làm tiếp đến hết lượt; tắt Key 3 hoặc Key 3 lỗi thì thử Gemini còn bật. Mọi key được bật đều lỗi thì **tạm dừng và thông báo**, không tự gửi lại định kỳ. Lỗi mạng/server Gemini thử lại một lần rồi sang key kế, tránh thử lặp mọi model trên server lỗi.
- Đã thêm Key 3, ô Sử dụng riêng cả ba key, Lưu/Chỉnh sửa/hiện ẩn cạnh từng ô và trạng thái lưu. Sử dụng lưu ngay; key lưu riêng merge đúng trường, ghi file tạm/rename/đọc kiểm tra. Bản chưa lưu không gọi API; lỗi ghi giữ bản nhập. Key cũ tương thích, Gemini1/2 mặc định bật, OpenAI3 mặc định tắt. Đã kiểm tra trước đó: Key1 nằm trong settings trên máy, Key2 chưa lưu; không ghi key vào Summary. Không tự đổi key thật của user trong task này.
- OpenAI dùng Responses API qua httpx sẵn có, model mặc định **gpt-6.1-sol**, reasoning medium, chỉnh model riêng rồi Lưu cài đặt; đối chiếu tài liệu OpenAI chính thức. Source dùng JSON schema nghiêm ngặt và bộ kiểm tra hiện có. Không tự điền lựa chọn giả; lượt bổ sung lỗi giữ dòng hợp lệ. Token theo đúng key/model thực tế, tách reasoning khỏi output để tránh cộng hai lần; dropdown xem Key3 riêng.
- Source hiện thông báo provider/model/key trên tiến độ và log theo run_id; Làm mới bỏ phản hồi/thông báo cũ. `all_providers_failed` đi nguyên vẹn qua HTTP/IPC để paused, giữ bảng và chờ Continue. Mỗi request/Continue dùng cấu hình đã lưu mới nhất từ main process. Phiên lưu thêm lựa chọn tiếp tục OpenAI, mở lại vẫn chờ user rồi làm phần chưa xong. Nạp file mới/Làm mới/chạy lại toàn bộ xóa ưu tiên provider của lượt trước.
- Timeout gateway Gemini 60s/lần, connect tối đa 20s, retry server/mạng một lần/key; OpenAI 120s. IPC tác vụ AI 900000ms. Gemini embedding tùy chọn 10s, không dùng nếu Gemini tắt hoặc lượt đã chuyển OpenAI; lỗi thì đối chiếu kho ví dụ theo từ khóa, không trộn vector provider khác. Client trực tiếp cũ còn retry TLS/503 riêng để tương thích test và công cụ cũ.
- File mới: `python/ai_provider_router.py`, `python/test_ai_provider_router.py`, `src/testApiKeySettings.js`. Sửa `main.js`, `preload.js`, Gemini client/key pool, Source/backend API, giao diện và test. Cập nhật AGENTS, hướng dẫn API/Source v2 và workflows Cài đặt/Tạo mới/Gợi ý Source; các tab Quy tắc/Cắt Clip/Gen XML không đổi thao tác.
- Kiểm tra cuối: toàn bộ **91 test Python đạt**, **66 test JavaScript đạt + 1 smoke bỏ qua** ở lượt thường; smoke backend Python thật chạy riêng **7/7 đạt**, không mở Electron. AST parse 22 file Python, node --check các JS đã sửa, kiểm tra ID HTML/khởi tạo/UTF-8 và git diff --check đạt. Kiểm thử có thứ tự key/model, retry server/mạng, OpenAI-only, API tạo/preview/export, sửa timeline, giữ phần hợp lệ, pause/Continue, đổi lựa chọn trong lúc dừng và lưu key qua phiên file thật.
- Giới hạn: sinh nội dung/HTTP/quota kiểm thử bằng mock, chưa gọi Gemini/OpenAI thật cho thay đổi này, chưa xác nhận Key3 có quyền dùng model/quota và chưa kiểm tra trực tiếp UI Electron. Không cần cung cấp key trong chat. Có thư mục `doc/aaa/` có sẵn ngoài task, không đưa vào commit.
- Bước dùng: **đóng hẳn/mở lại app**, vào Cài đặt, nhập Key3 và bấm Lưu cạnh ô, tích Sử dụng cho các key muốn dùng. Có thể giữ model mặc định hoặc đổi rồi Lưu cài đặt. Phân tích/Continue phiên đã lưu; không cần Làm mới. Commit/push thực hiện sau khi hoàn tất kiểm tra, xác nhận qua lịch sử Git/phản hồi cuối.

## Model ưu tiên theo quota của user (2026-11-12, lịch sử trước thay đổi Key 3)

- User chốt A/Key 1 → A/Key 2 → B/Key 1 → B/Key 2, muốn phân tích liên tục và hiện thông báo khi chuyển. Đã tích hợp điều phối theo model trước key, thông báo live trên tiến độ có run_id để bỏ thông báo cũ sau Làm mới, usage theo model/key thực tế. Khi mọi lựa chọn quota 429, Source giữ phần đã xong, tự đếm ngược/thử lại dòng thiếu; Pause/Continue/Làm mới dùng được trong lúc chờ, mở lại app vẫn chờ user bấm Continue.
- Ảnh quota user cung cấp chọn 7 model có hạn mức >0 theo đề xuất: 3.8 Flash → 3.6 Flash → 3 Flash (`gemini-3-flash-preview`) → 2.5 Flash → 3.5 Flash-Lite → 3.1 Flash-Lite → 2.5 Flash-Lite. Bỏ 2 Flash/Flash-Lite, 2.5 Pro và 3.1 Pro có quota 0/0; không dùng Carbon/Argon ngoài ảnh. Có thể chỉnh danh sách trong Cài đặt. Đây là thứ tự ưu tiên đề xuất, không phải benchmark chất lượng thực tế.
- Đã cập nhật mặc định trong `main.js`, `python/gemini_key_pool.py`, `src/renderer.js` và riêng trường model ưu tiên trong settings app trên máy, giữ nguyên key/cấu hình khác. Mã model đối chiếu tài liệu Google. Đã thử ListModels bằng key lưu nhưng ConnectTimeout, không gọi sinh nội dung thật; Key 2 chưa lưu lúc kiểm tra. Quota ảnh 3.8 Flash 16/20 là ảnh chụp thời điểm đó, không dùng làm bộ đếm cứng trong app.
- Hướng dẫn đã cập nhật: `doc/Gemini_API_Keys.md`, workflows Cài đặt/Tạo mới/Gợi ý Source và quy tắc. Bộ điều phối/đếm ngược/thông báo nằm trong commit tích hợp `57199e6`; bản hiện tại chốt danh sách theo ảnh, giữ bản sửa TLS `2d0d359`.
- Kiểm tra sau khi chốt danh sách: 67 test Python đạt, 54 test JavaScript đạt, 1 smoke bỏ qua; cú pháp và diff check đạt. Có kiểm thử Flash 2.5 giữ thinking config khi fallback từ Flash 3.8. Chưa kiểm tra trực tiếp Electron, quota hai tài khoản hoặc chất lượng Gemini thật. Bước dùng: đóng hẳn/mở lại app, kiểm tra Model ưu tiên và nhập Key 2 trong Cài đặt, rồi Phân tích/Continue; không cần xóa phiên hiện tại.

## Sửa lỗi ConnectTimeout TLS tới Gemini (2026-11-12)

- Lỗi httpx.ConnectTimeout: handshake timed out do mạng/VPN/proxy/tường lửa chặn bắt tay HTTPS tới Gemini; trước đây mỗi lần chờ tới 120 giây. python/gemini_key_pool.py thêm transport giới hạn riêng timeout kết nối 20 giây (read timeout vẫn 120 giây). source_suggester.py thử tối đa 3 lần với nghỉ 2s/4s; các nhóm đã lưu vẫn được giữ, bấm Phân tích để chạy tiếp. 503 vẫn thử 2 lần.
- Phát hiện source_suggester.py trong working tree từng là bản cũ thiếu code key pool/source_metadata; đã khôi phục từ HEAD, bản cũ lưu ở scratch. Test Python 44 đạt; chưa gọi Gemini thật. Cần đóng/mở lại app. Nếu vẫn lỗi: kiểm tra mạng/VPN/proxy/antivirus.

## Tài liệu luồng hoạt động từng tab (2026-11-12)

- Thêm nút “Luồng hoạt động” cho cả 6 tab; chỉ mở cửa sổ đọc khi bấm, có nút đóng, Escape, cuộn và kéo kích thước. Nội dung lưu trong `doc/workflows/{tab}.html`, dùng chung `doc/workflows.css`; không cần gọi AI/backend để đọc.
- Tài liệu mô tả quy trình, đầu vào/đầu ra, quan hệ giữa tab, lưu/khôi phục và lưu ý xử lý lỗi. Không yêu cầu user tự ghi note. Cài đặt phân biệt quota 429, MAX_TOKENS, lỗi mạng và thứ tự model/key.
- Thêm `src/workflowHelp.js`, tích hợp trước renderer, khởi tạo độc lập trong init; bổ sung CSS. `.agents/AGENTS.md` có quy tắc #16 kiểm tra/cập nhật tài liệu tab liên quan sau mỗi task, cùng Summary và commit/push.
- Workspace đã có thay đổi chưa commit về nhiều model/key và retry từ trước; giữ nguyên ngoài commit task này. Tài liệu Cài đặt ghi rõ phần nhiều model mô tả workspace hiện tại, không phải mọi bản cũ. Mục hai key bên dưới là lịch sử cơ chế cũ.
- Kiểm tra: syntax JS đạt; bộ kiểm thử JS hiện có 48 đạt, 1 smoke bỏ qua. Chưa kiểm tra trực tiếp cửa sổ Electron hoặc gọi Gemini thật. Kiểm tra file tài liệu và diff trước commit; commit/push riêng phần task này.
- Sử dụng: Ctrl+R để nạp giao diện, vào tab bất kỳ rồi bấm nút ở góc dưới bên phải. Cần đóng/mở lại nếu muốn nạp cả backend thay đổi sẵn trong workspace.

## Hai API key Gemini dự phòng (2026-11-12, lịch sử trước thay đổi nhiều model)

- User muốn dùng thêm key từ Gmail Google AI Pro thứ hai: key đang dùng chạm quota thì chuyển key còn lại. Đã giải thích Google AI Pro không tự cấp quota API cho ứng dụng ngoài; hạn mức API tính theo Cloud project, hai key cùng project dùng chung quota. Không tự đổi model phân tích.
- Cài đặt có Key 1 ưu tiên, Key 2 dự phòng, hiện/ẩn và lưu lại khi mở app. Request chuyển hai slot qua IPC/backend; cấu hình cũ một key vẫn tương thích. Có thể chỉ nhập Key 2.
- `python/gemini_key_pool.py` thử key dự phòng khi HTTP 429, giữ nguyên model/payload, bỏ qua key trùng; nhớ key thành công và cooldown riêng từng model trong phiên backend. RetryInfo/Retry-After được tôn trọng với thời gian nghỉ tối thiểu 60 giây. Cả hai key giới hạn thì dừng và giữ kết quả. Không đổi key do timeout/503/MAX_TOKENS.
- Dùng chung cho phân tích Source, embedding và tạo/preview/sửa timeline. Thống kê token có chọn Key 1/2; ghi usage đúng key thực sự trả phản hồi, không coi bộ đếm cục bộ là quota còn lại.
- File mới: `python/gemini_key_pool.py`, `python/test_gemini_key_pool.py`, `doc/Gemini_API_Keys.md`. Sửa settings/main/backend/gemini_client/source_suggester, giao diện và test JS/Python, `.agents/AGENTS.md`, `doc/Source_ThoiDiem_v2.md`.
- Kiểm thử đúng nội dung chuẩn bị commit trong bản sao tách biệt: 50 test Python và 48 test JavaScript đạt, 1 smoke bỏ qua; cú pháp và diff check đạt. Working tree có thêm các sửa lỗi TLS/503 của task khác cũng đã chạy qua kiểm thử, được giữ nguyên ngoài commit này. Chưa gọi Gemini thật hoặc kiểm tra trực tiếp Electron; chưa xác nhận quota thực tế của hai tài khoản user.
- Bước dùng: đóng hẳn/mở lại app, vào Cài đặt nhập hai key rồi Lưu; không cần xóa phiên đang phân tích. Key ưu tiên/cooldown được nhớ trong phiên backend; thống kê token và hai key cấu hình được lưu giữa các lần mở app.

## Quy tắc bàn giao sau mỗi task (2026-11-12)

- User yêu cầu bổ sung quy tắc để conversation sau tiếp tục được bối cảnh.
- Đã thêm quy tắc #15 và lịch sử thay đổi trong `.agents/AGENTS.md`: đầu conversation đọc Rules + Summary, cuối mỗi task cập nhật Summary; commit/push tài liệu bàn giao cùng thay đổi thuộc task.
- File sửa: `.agents/AGENTS.md`, `doc/Session_Summary_20261109.md`. Không sửa code ứng dụng; không chạy test ứng dụng. Kiểm tra bằng rà soát diff và `git diff --cached --check` trước commit.
- Chỉ stage phần tài liệu của task này; các thay đổi code và đoạn ConnectTimeout có sẵn trong AGENTS.md được giữ ngoài commit. Commit/push thực hiện sau cập nhật này; xác nhận kết quả qua phản hồi cuối và lịch sử Git.
- Bước tiếp theo: conversation mới đọc hai tài liệu trên và kiểm tra trạng thái Git trước khi tiếp tục công việc ứng dụng.

## Sửa timeout phân tích (2026-11-12)

- User gặp `Request timed out` đúng khoảng 5 phút khi nhóm đầu chưa trả kết quả. Thông báo do HTTP helper trong Electron cắt kết nối ở 300000ms; chưa xác nhận vì sao Gemini không trả kịp.
- Giảm nhóm từ 32 xuống 8 dòng ở frontend/backend, giữ toàn bài làm ngữ cảnh. Gemini client đặt timeout riêng 120000ms; IPC phân tích dùng timeout 600000ms để chờ nhiều bước, API khác giữ mức cũ.
- Chỉ nhóm đang xử lý chuyển error; dòng chưa gửi giữ pending. Lượt AI bổ sung lỗi không làm mất kết quả hợp lệ của lượt đầu. Thêm log lượt gọi và thông báo lỗi rõ hơn.
- Kiểm thử: 44 test JavaScript đạt, 1 smoke bỏ qua; 41 test Python đạt; cú pháp và git diff --check đạt. AI được mock, chưa gọi Gemini thật. Cần đóng hẳn/mở lại app để nạp main process và backend mới; phiên đã lưu tự khôi phục, bấm Phân tích chạy tiếp, không cần Làm mới.

## Quản lý phiên phân tích mới (2026-11-12)

- Thay luồng tự chạy cũ: chọn Timeline chỉ hiện tên file; Phân tích mới nạp bảng và gọi AI.
- Thanh tiến độ xanh/tím/hồng theo ảnh user, có phần trăm và số dòng. Pause giữ nhóm đang chạy rồi dừng; Continue tiếp tục. Làm mới có xác nhận, xóa phiên và bỏ qua phản hồi cũ, giữ file vật lý/cấu hình/kho ví dụ.
- Nút nạp CSV phân loại riêng trên bảng, mở chỉnh sửa không gọi AI; cache cũ không ghi đè file vừa nạp.
- Tự lưu/khôi phục trực tiếp từ localStorage: file đã chọn, bảng, chỉnh sửa, bối cảnh và tiến độ. Phiên đang chạy khi đóng app khôi phục tạm dừng; nhóm chưa nhận kết quả cần xử lý lại. Không tự gọi AI khi mở app.
- Kiểm thử JS: 43 đạt, 1 smoke bỏ qua; gồm chọn file, Pause/Continue, reset khi đang chạy/tạm dừng/đọc CSV, phản hồi đến muộn, khôi phục và nạp phân loại. Chưa kiểm tra trực tiếp Electron/Gemini thật cho thay đổi này.
- Chỉ đổi frontend: Ctrl+R để nạp giao diện mới. Hướng dẫn tại `Source_ThoiDiem_v2.md`.

## Trạng thái bàn giao trước đó (2026-11-12)

- Refactor Source và Thời điểm đã hoàn tất, commit [`7e4791d`](https://github.com/TuanMinh1905/EditBdat_AI/commit/7e4791d) đã push thành công lên nhánh `main` của repo [`TuanMinh1905/EditBdat_AI`](https://github.com/TuanMinh1905/EditBdat_AI). User đã xác nhận trực tiếp repo này và yêu cầu push; bước đồng bộ mã không còn bị chặn.
- Chốt yêu cầu: **phân loại video dựa vào tên file**; không thêm bước AI xem/kiểm chứng video khi nhập kho. Nội dung quá chi tiết hoặc không xử lý được thì **để trống, tô vàng và ghi lý do** để user làm thủ công.
- Kiểm thử đã qua: **38 test Python + 36 test JavaScript**, kiểm tra cú pháp, smoke test khởi động backend thật và cắt video bằng FFmpeg thật. Các test AI dùng phản hồi mô phỏng; chưa xác nhận chất lượng Gemini thật với prompt v2 và chưa kiểm tra trực tiếp giao diện Electron.
- Đã đọc tương thích file `D:\Edit SofaZone\03_Projects\02_X_I_B_TestAI\2_CSV_PhanTich\2_CSV_PhanLoaiSource.csv` gồm **406 dòng**, không sửa file gốc. Không tự đổi tên/di chuyển hàng loạt video trong kho.
- Bước sử dụng tiếp theo: **đóng hẳn rồi mở lại ứng dụng**, sau đó nạp lại `1_CSV_Timeline.csv` để AI phân tích theo cấu trúc mới. `Ctrl+R` chỉ tải lại renderer, không nạp lại Python backend.
- Nếu làm tiếp trong phiên sau: dùng [Source_ThoiDiem_v2.md](Source_ThoiDiem_v2.md) làm tài liệu hiện hành; kiểm tra phản hồi Gemini thật/giao diện khi có điều kiện, không coi test mô phỏng là xác nhận chất lượng phân loại thực tế.

## Refactor Source và Thời điểm (2026-11-12)

- Đã triển khai theo user chốt: phân loại video từ tên file; `rai_1` là nhóm gồm `rai_1_1` bàn thắng, `rai_1_2` kiến tạo, `rai_1_3` chung; `rai_2` là bối cảnh đường hầm/CĐV/ăn mừng.
- Thêm `cau_thu`, `doi_bong`, `thoi_diem`, `su_kien` xuyên suốt tên file -> clip con -> catalog -> AI/CSV -> XML. Không đồng nhất thời điểm lịch sử với start/timecode.
- Cột bối cảnh cạnh lời thoại có sửa riêng/áp dụng cho câu/đoạn, khóa bối cảnh khi chạy AI; từng đoạn có cờ cho phép rai_2. Cảnh quá cụ thể/chưa đủ thông tin để trống, tô vàng, có nút Làm thủ công.
- Matcher bỏ hoàn toàn fallback clip bất kỳ; chỉ chọn Source đúng điều kiện. Thiếu Source đúng năm/đội/cầu thủ/giải đấu thì đặt marker, kể cả phần đuôi thiếu clip.
- Dữ liệu có `schema_version=2`; adapter chuyển mã v1 và giữ đường dẫn cũ, backup `.v1.bak` khi ghi catalog/CSV cũ. Bản quy tắc hiện tại trước refactor được giữ tại `templates/backups/source_v1_before_20261112/`.
- Quy ước tên video: `{loai}_{cau_thu}_{doi_bong}_{thoi_diem}_[ky_nang]_[STT].mp4`; ví dụ `rai_1_2_Xavi_Spain_Euro2008_001.mp4`, `rai_1_3_Iniesta_Barcelona_2008-2012_Skill_001.mp4`, `rai_2_Xavi_Spain_Euro2008_Celebrate_001.mp4`. Kỹ năng/STT đầu vào tùy chọn; clip con tự có STT và kế thừa thời điểm.
- Phân biệt nghĩa mã cũ/mới: `rai_4` v1 -> `rai_2` v2; các nhóm rải v1 khác -> highlight bàn thắng/kiến tạo khi có nhãn hành động rõ, còn lại `rai_1_3`. `rai_2` cũ không được tự hiểu thành cảnh bối cảnh mới. Cache phân tích v1 được lưu riêng khi khôi phục, không tự áp vào bảng v2.
- Điều kiện thời điểm: yêu cầu 2008 không lấy clip 2018 hoặc video tổng hợp 2008-2012; yêu cầu giai đoạn 2008-2012 có thể lấy clip 2010. Yêu cầu Euro2008 cần thông tin giải Euro, không chỉ năm 2008. Thiếu clip phù hợp đặt marker `THIEU SOURCE DUNG THOI DIEM`; ý để trống thủ công đặt `CAN LAM THU CONG`.
- CSV v2 giữ 10 cột cũ, bổ sung `cau_thu,doi_bong,thoi_diem,su_kien,context_locked,context_scope,allow_rai_2,schema_version,analysis_status,reason,start,text`. Nạp CSV phân loại đã xuất mở để chỉnh, không tự chạy lại AI; bối cảnh sửa tay có khóa để giữ qua lượt phân tích lại.
- Đã thử video FFmpeg thật và đọc tương thích file phân loại thực tế 406 dòng (không sửa file gốc). Kiểm thử AI dùng mock; chưa xác nhận Gemini thật cho prompt v2. Browser không có kết nối iab, chưa kiểm tra trực tiếp Electron. Cần đóng/mở lại app.
- Hướng dẫn và chi tiết kỹ thuật hiện hành: [Source_ThoiDiem_v2.md](Source_ThoiDiem_v2.md). Các mục bên dưới là lịch sử; thông tin 10 cột, rai_1 mặc định và fallback cũ đã được thay thế.

## Sửa luồng phân loại Timeline (2026-11-11)

- Chọn `1_CSV_Timeline.csv` bắt đầu phân tích AI ngay. Trước khi có kết quả, các ô phân loại để trống và ghi trạng thái chờ; không điền sẵn `rai_1`/`auto`.
- Mỗi lượt xử lý tối đa 32 dòng, kèm toàn bộ bài (`context_rows`) và lựa chọn ngay trước nhóm đó (`previous_rows`) để hiểu từng đoạn/câu/ý và nối BGM. Có tiến độ; lỗi giữa chừng giữ kết quả đã xong, lần chạy tiếp chỉ xử lý dòng còn thiếu.
- AI phải chọn mã cụ thể theo 5 bảng và quy tắc hiện tại, có lý do; hỗ trợ lớp phủ ghép `tv_retro + texture_2`, Animation tùy chỉnh và `si`. Quy tắc gửi trong request chỉ dùng cho lượt chạy, không tự lưu đè file quy tắc.
- Dòng làm thủ công: `needs_review=true`, `analysis_status=manual`, các lựa chọn để trống và tô vàng. Kết quả thiếu, trùng, sai mã hoặc `auto` được yêu cầu bổ sung một lần; nếu vẫn sai thì đánh dấu lỗi, không thay bằng mặc định hay độ tin cậy 75%.
- Lưu kết quả trong `localStorage.sg_analysis` theo đường dẫn và nội dung CSV; khôi phục khi mở lại mà không tự gọi AI. Không xuất khi còn dòng chờ/lỗi; không đưa dòng thủ công/lỗi vào kho ví dụ. CSV vẫn giữ 10 cột; XML để trống cảnh có Source trống và đặt marker làm thủ công, không lấy clip ngẫu nhiên từ catalog.
- Kiểm thử: `node --test src/testSourceSuggester.js src/testAssetPreviewLoading.js src/testAssetVerification.js src/testBackendStartup.js`; từ `python/`, chạy `..\.venv\Scripts\python.exe -m unittest test_source_suggester test_assets`. Gemini được mô phỏng trong các test. Sau khi user cho phép dùng khóa đã lưu và gửi kịch bản, đã gọi Gemini thật với 12 câu mẫu cùng toàn bài 406 dòng; dịch vụ trả `503 UNAVAILABLE` (quá tải), chưa có kết quả phân loại thật để xác nhận.
- Đọc API key dự phòng từ `state.settings.geminiApiKey` đúng với cấu hình ứng dụng (trước đó phần gợi ý/huấn luyện dùng nhầm `apiKey`); đã thêm kiểm thử khi ô nhập key trống nhưng cấu hình đã lưu có key.
- Cần đóng/mở lại ứng dụng để nạp Python backend mới, rồi chọn CSV. `Ctrl+R` chỉ tải lại giao diện.

---

> **Mục đích file này:** Cho AI ở conversation mới đọc để nắm bắt toàn bộ bối cảnh, kiến trúc hệ thống, các tính năng đã hoàn thiện và các quy tắc cốt lõi của dự án.
>
> **Project path:** `c:\Users\GP\Desktop\Edit Bdat\Code_AI`  
> **Rules bắt buộc:** `c:\Users\GP\Desktop\Edit Bdat\Code_AI\.agents\AGENTS.md` — **AI BẮT BUỘC đọc kỹ trước khi viết code.**

---

## 1. Tổng quan Project & Mô hình Đối tượng "Time" (7 thuộc tính, cập nhật v2)

**Mốc trước đó (2026-11-11 — Plan 3):** Đã chuẩn hóa tên 20 Element + 10 BGM theo mã, giữ `intro.mp4`. Có API preview `/api/asset-thumbnail`, API xác minh `/api/verify-assets`, modal kiểm tra trước Gen XML và ô chọn Sounds dùng chung cho preview/xuất. Tại lần kiểm tra đó, 21 Element + 10 BGM có file; 8 SFX chưa có file. Khi user chọn tiếp tục, generator bỏ qua lớp phủ/âm thanh thiếu và ghi `skipped_assets`, vẫn xuất XML. Chi tiết/bản sao lưu: [Plan_3_Implementation.md](Plan_3_Implementation.md).

**AE AI Tool** là ứng dụng desktop tự động hóa quy trình hậu kỳ video cho kênh YouTube **SofaZone** (kênh phân tích bóng đá chuyên sâu mang phong cách tư liệu hoài niệm / vintage).

### 🎯 Mô hình đối tượng "Time" (Mỗi đoạn thời gian trong kịch bản):
Mỗi dòng trong timeline đại diện cho một đối tượng **Time/Clip** chứa **7 thuộc tính**:
1. **Voice (Lời thoại)**: Track **A1** (file voice gốc + timecode từ CapCut SRT / CSV)
2. **Source Video (`loai_source`)**: Track **V1/V2** (`rai_1_1` bàn thắng, `rai_1_2` kiến tạo, `rai_1_3` highlight chung, `rai_2` bối cảnh, phỏng vấn, khán đài, sa bàn...)
3. **Lớp phủ Design (`element`)**: Track **V3** (overlay per-clip như Khung Sofa TV CRT, Phim 8mm hồi ức, Scout frame, Bảng infographic...) và **V4** (Full-video Texture giấy cũ / Film grain 15%)
4. **Animation (`anim`)**: Chuyển động Ken Burns trên V1/V2 (`zoom_in` 100%→108%, `zoom_out` 108%→100%, `static`, `auto`)
5. **Sound nền (`bgm`)**: Track **A2** (Nhạc nền chạy xuyên suốt, tự động nối liền mạch các dòng liên tiếp có cùng mã `bgm`, âm lượng 0.15)
6. **Sound Effect (`sfx`)**: Track **A3** (Hiệu ứng âm thanh điểm nhấn: tiếng còi, tiếng tách máy ảnh, tiếng tivi rè, tiếng reo hò, tiếng beep số liệu... tại thời điểm xuất hiện, âm lượng 0.6)
7. **Thời điểm / bối cảnh lịch sử**: `cau_thu`, `doi_bong`, `thoi_diem`, `su_kien`; dùng để chọn Source đúng nội dung, không phải vị trí/timecode trên timeline.

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
  • Xuất file 2_CSV_PhanLoaiSource.csv (10 cột, có thêm cột si cho Subject Isolation)
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
  - **Bảng Timeline 12 cột đầy đủ**: `Đoạn/Câu`, `Lời thoại`, `Source chính`, `+ Source phụ`, `Lớp phủ (Element V3)`, `👤 Tách nền (SI)`, `Chuyển động (Anim)`, `🎵 Sound nền`, `🔊 Sound Effect`, `Thời kỳ / Cầu thủ`, `Ghi chú dạy AI`, `Độ tự tin`.

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

## 6. Cấu trúc CSV Xuất Ra (`2_CSV_PhanLoaiSource.csv` — 10 Cột)

```csv
doan,cau,y,loai_source,thoi_ky,element,anim,bgm,sfx,si
1,1,1,rai_1,Euro 2008 · Tây Ban Nha / Xavi,auto,zoom_in,bgm_default,none,
1,1,1.1,anh_thong_so + rai_1,Euro 2008 · Xavi / Tây Ban Nha,stats_table_1,static,bgm_default,data_beep,
1,2,,rai_4 + anh_thoi_diem,Euro 2008 · Tây Ban Nha / Xavi,scout_frame,zoom_out,bgm_momentum,camera_shutter,yes
```

---

## 7. Các Quy tắc Bắt buộc Khi Tiếp Tục Phát Triển (Trích AGENTS.md)

1. **Tech Stack bất di bất dịch**: Electron 28.x + HTML/Vanilla JS/CSS + Python 3.13 Flask + Google Gemini (`gemini-3.8-flash`).
2. **Rule #11**: Trong `index.html`, thẻ `<script src="renderer.js"></script>` **bắt buộc** nằm ở dòng cuối cùng trước `</body>`. Trong `renderer.js`, lệnh `init();` **bắt buộc** nằm ở dòng cuối cùng của file, mỗi `init*()` bọc `try/catch` riêng.
3. **Rule #13**: Sau mỗi lần chỉnh sửa hoặc viết code mới, **bắt buộc** tự động chạy syntax check (`ast.parse` cho Python, `node --check` cho JS), sau đó chạy `git add`, `git commit -m "Mô tả tiếng Việt"` và `git push`.
4. **Rule #14**: Mọi container lớn nhỏ đều phải có resizer (ngang/dọc/cột) và responsive `@container`.
5. **Rule #17**: Mọi card trong flex column container bắt buộc phải có `flex-shrink: 0;` để không bị bẹp khi co giãn.
6. **Không chạy `npm start` từ terminal AI**: Luôn để user tự chạy trên terminal máy hoặc bấm `Ctrl+R` trên ứng dụng Electron.
