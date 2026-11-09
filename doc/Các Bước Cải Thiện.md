## Quy trình đầy đủ — sau khi bạn dựng thủ công xong

### Bước 1 — Trong After Effects (bạn làm)
```
1. Dựng xong 1 cảnh hiệu ứng trong AE
2. Mở comp đó (double click vào comp)
3. Vào: File > Scripts > Run Script File...
4. Chọn file: Code_AI/templates/AE_Extractor.jsx
5. Chạy → AE tự xuất ra file: TenComp_extracted.json
   (nằm cạnh file .aep của bạn)
```

### Bước 2 — Gửi cho tôi (bạn làm)
```
Mở file _extracted.json bằng Notepad
→ Copy toàn bộ nội dung
→ Paste vào chat này và nói:
  "Đây là cảnh [tên cảnh], dùng hiệu ứng [mô tả ngắn]"
```

### Bước 3 — Tôi xử lý (tôi làm, khoảng 5-10 phút/cảnh)
```
1. Đọc JSON → hiểu cấu trúc layer thực tế bạn dùng
2. Chuyển thành "cảnh mẫu" theo schema của tool
3. Viết prompt mẫu tương ứng
4. Thêm cặp (prompt → JSON mẫu) vào system prompt của Gemini
5. Test thử → báo kết quả
```

### Bước 4 — Kiểm tra (bạn làm)
```
Thử generate với prompt tương tự cảnh vừa dựng
→ So sánh kết quả JSX với cảnh thủ công
→ Nếu tốt → làm tiếp cảnh khác
→ Nếu chưa đúng → chỉ ra điểm khác → tôi tinh chỉnh
```

---

## Ưu tiên nên dựng những cảnh nào trước?

Dựa vào file PDF của bạn, thứ tự tôi đề xuất:

| # | Cảnh | Lý do ưu tiên |
|---|---|---|
| 1 | **Text reveal** (chữ lớn, hiện từng nhịp) | Xuất hiện ở ~80% cảnh |
| 2 | **Data card** (thẻ số liệu nền tối) | Cảnh thống kê xG, possession... |
| 3 | **Footage + freeze frame + chữ đè** | Cảnh mở đầu, pha bóng |
| 4 | **2 thẻ song song** (so sánh 2 đội) | Cảnh tương phản |
| 5 | **Sân bóng + mũi tên** | Cảnh chiến thuật |

**Không cần dựng cả 54 cảnh** — chỉ cần ~5 cảnh đại diện là AI đã học được pattern và tự áp dụng cho phần còn lại.

### Planner Response

Push thành công ✅

---

## Tóm tắt những gì bạn có trong tay

### 📄 File mới: [`AE_Extractor.jsx`](file:///c:/Users/GP/Desktop/Edit%20Bdat/Code_AI/templates/AE_Extractor.jsx)

Script này giải quyết đúng vấn đề bạn đặt ra — **không cần mô tả, không cần chụp màn hình**. AE tự đọc toàn bộ dữ liệu thật và xuất ra JSON bao gồm:

- Tất cả layers + loại layer
- Vị trí, scale, opacity, rotation (có keyframe hay không)
- Toàn bộ keyframes + easing thực tế
- Effects đã áp dụng + params
- Text: font, size, màu, căn chỉnh
- Time Remap (freeze frame)
- Masks, blending mode

---

## Khi nào bạn sẵn sàng, thứ tự làm là:

**1.** Dựng cảnh thủ công trong AE (bắt đầu từ **Text Reveal** hoặc **Data Card**)

**2.** Chạy `AE_Extractor.jsx` → gửi file JSON cho tôi

**3.** Tôi tích hợp ngay vào Gemini system prompt → **AI sẽ sinh ra đúng style của bạn**

Càng nhiều cảnh mẫu → AI càng hiểu chính xác phong cách edit của bạn. Bắt đầu từ 1 cảnh thôi cũng đã có tác động rõ rệt.