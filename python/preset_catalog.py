"""
Preset Catalog — Danh mục preset hiệu ứng mà AI được phép dùng.

Danh sách này là "cuốn sổ tay" được đưa cho Gemini. Mỗi preset tương ứng với một
hàm trong templates/ae_runtime.jsx (AI.presets.<tên>). Khi thêm preset mới:
  1. Viết hàm trong ae_runtime.jsx
  2. Thêm mô tả vào PRESETS bên dưới (AI chỉ biết những gì được mô tả ở đây)
"""

# Quy ước toạ độ/thời gian đưa vào prompt cho AI
CONVENTIONS = """QUY ƯỚC CHO LAYER type="preset":
- "startTime" và "duration": thời điểm bắt đầu và thời lượng hiển thị của preset (giây, theo comp).
- MỌI thời gian trong "params" (delay, at, dur) là TƯƠNG ĐỐI so với startTime của preset đó.
- Vị trí "pos", "from", "to", "rect" là toạ độ CHUẨN HÓA 0..1: x từ trái sang phải, y từ trên xuống dưới.
  Nếu params có "pitch": true thì 0..1 tính theo SÂN BÓNG (preset "pitch" phải được tạo TRƯỚC, cùng khoảng thời gian).
  Trên sân: x=0 là khung thành nhà (Barca), x=1 là khung thành đối thủ; Barca tấn công từ trái sang phải; y=0 là biên trên, y=1 là biên dưới.
- Kích thước "w", "h", "r", "size" tính bằng pixel của comp.
- Màu: dùng tên trong brand kit (accent, accent2, alert, good, barcaBlue, barcaGarnet, text, textDim, dark...) hoặc mảng [r,g,b] 0..1.
- Chữ có nhiều dòng thì ngắt dòng bằng \\n. Chữ tiêu đề nên VIẾT HOA, ngắn gọn.
- Thứ tự mảng "layers": phần tử ĐẦU TIÊN nằm trên cùng. Hãy xếp: nhãn/mũi tên/vòng -> thẻ/chữ -> sân/đội hình -> footage -> nền lưới.
"""

PRESETS = {
    "grid_background": {
        "desc": "Nền lưới tối có vignette, lưới trôi nhẹ. Dùng làm nền cho thẻ dữ liệu, chữ, tiêu đề chương.",
        "params": {"color": "tên màu nền (mặc định bg)", "cell": "kích thước ô lưới px (mặc định 60)", "vignette": "0-100 (mặc định 55)"},
    },
    "text_reveal": {
        "desc": "Chữ hiện lần lượt (câu hỏi, tiêu đề, luận điểm, mục lục). Mỗi dòng một layer riêng, hiện nối tiếp nhau.",
        "params": {
            "lines": "mảng [{text, size, color, font(title|body|number), style, delay}] - style: typewriter | slideUp | slideDown | slideLeft | slideRight | pop | zoom | fade",
            "pos": "[x,y] tâm khối chữ (mặc định [0.5,0.5])",
            "align": "center | left",
            "bar": "true để thêm thanh nhấn màu dưới chữ",
            "step": "giây giữa các dòng (mặc định 0.5)",
        },
    },
    "data_card": {
        "desc": "Thẻ dữ liệu bo góc phát sáng. Dùng cho xG, số liệu, ô quy trình, mục lục ba chương. Có thể đặt nhiều thẻ cạnh nhau.",
        "params": {
            "pos": "[x,y] tâm thẻ", "w": "rộng px (mặc định 520)", "h": "cao px (mặc định 300)",
            "title": "nhãn/tiêu đề (có thể rất dài, tự ngắt dòng)", "value": "số/cụm chính hiện lớn (tuỳ chọn)", "sub": "dòng phụ nhỏ (tuỳ chọn)",
            "accent": "màu nhấn", "enter": "slideLeft | slideRight | slideUp | slideDown | pop | zoom | fade",
            "delay": "giây", "scale": "1.0-1.15 (thẻ nhấn mạnh to hơn)", "dimAt": "giây: từ lúc này làm mờ thẻ", "dimTo": "độ mờ còn lại % (mặc định 35)",
        },
    },
    "flow": {
        "desc": "Chuỗi các ô nối bằng mũi tên vẽ dần (IB -> Khách hàng -> XM, quy trình 3 bước, chuỗi pressing). Hỗ trợ đường bỏ qua bước.",
        "params": {
            "nodes": "mảng [{title, sub, value, accent}] (2-5 ô)", "pos": "[x,y] tâm cả chuỗi",
            "labels": "mảng chữ nhỏ đặt trên từng mũi tên nối (độ dài = số ô - 1)",
            "bypass": "mảng [{from, to, label, color}] chỉ số ô: vẽ mũi tên cong đứt nét bỏ qua các ô giữa",
            "step": "giây giữa các ô (mặc định 0.8)", "highlight": "chỉ số ô được nhấn", "highlightAt": "giây bắt đầu làm mờ các ô còn lại",
        },
    },
    "scoreboard": {
        "desc": "Bảng tỷ số cách điệu, số bật lên khi đổi.",
        "params": {"left": "tên đội trái", "right": "tên đội phải", "pos": "[x,y]", "changes": "mảng [{side:left|right, value, at}]", "caption": "chú thích nhỏ bên dưới"},
    },
    "label_tag": {
        "desc": "Nhãn viên thuốc nhỏ (ví dụ 'TRIGGER', 'BÓNG 2', '1 KÈM 1', 'ZONE 14').",
        "params": {"text": "nội dung", "pos": "[x,y]", "fill": "màu nền nhãn", "textColor": "màu chữ", "size": "cỡ chữ", "enter": "pop | slideUp | fade", "delay": "giây", "pitch": "bool"},
    },
    "player_ring": {
        "desc": "Vòng tròn đánh dấu cầu thủ hoặc quả bóng, có vòng lan toả (ping). Đặt lên footage hoặc sân.",
        "params": {"pos": "[x,y]", "r": "bán kính px (mặc định 46)", "color": "mặc định alert", "label": "nhãn nhỏ phía trên (tuỳ chọn)", "ping": "true/false", "delay": "giây", "pitch": "bool"},
    },
    "spotlight": {
        "desc": "Làm tối toàn khung hình trừ vùng sáng quanh một điểm (nhấn cầu thủ trên footage dừng hình).",
        "params": {"pos": "[x,y]", "r": "bán kính vùng sáng px", "dim": "độ tối 0-100 (mặc định 55)", "delay": "giây", "pitch": "bool"},
    },
    "tactical_arrow": {
        "desc": "Mũi tên chiến thuật vẽ dần bằng Trim Paths, có thể nét đứt hoặc cong. Dùng cho đường chuyền, hướng chạy, hướng pressing.",
        "params": {
            "from": "[x,y]", "to": "[x,y]", "color": "mặc định alert", "width": "độ dày px (mặc định 7)",
            "dashed": "true = nét đứt", "curve": "-1..1 độ cong (0 = thẳng)", "draw": "giây vẽ (mặc định 0.5)",
            "label": "nhãn giữa mũi tên (tuỳ chọn)", "head": "false để bỏ đầu mũi tên", "delay": "giây", "pitch": "bool",
        },
    },
    "zone": {
        "desc": "Vùng tô trong suốt (khu vực pressing, Zone 14, vòng cấm, khoảng hở, vùng rủi ro).",
        "params": {
            "rect": "[x0,y0,x1,y1] hai góc đối diện", "shape": "rect | ellipse", "color": "mặc định accent2", "opacity": "độ đặc 0-100 (mặc định 28)",
            "label": "nhãn giữa vùng", "reveal": "fade | wipe (quét từ trái sang)", "delay": "giây", "pitch": "bool",
        },
    },
    "pitch": {
        "desc": "Sân bóng nhìn từ trên xuống (vạch đầy đủ). Tạo trước rồi các preset khác dùng pitch=true để vẽ trên sân.",
        "params": {"pos": "[x,y] tâm sân (mặc định [0.5,0.5])", "w": "chiều dài sân px (mặc định 1500)", "delay": "giây"},
    },
    "formation": {
        "desc": "Đội hình bằng các chấm có số, di chuyển mượt, nối bằng đường, đánh dấu bằng vòng. Dùng cho 4-2-2-2, 4-2-4, pressing 1 kèm 1, việt vị.",
        "params": {
            "pitch": "true để dùng toạ độ sân", "color": "màu mặc định của chấm",
            "dots": "mảng [{id, pos:[x,y], color, label, at}] (id duy nhất; at = giây hiện)",
            "moves": "mảng [{id, to:[x,y], at, dur}] chấm di chuyển mượt tới vị trí mới",
            "links": "mảng [{from:id, to:id, at, color, dashed, curve, label}] đường nối giữa hai chấm (vị trí tính tại thời điểm at)",
            "rings": "mảng [{id, at, color, label}] vòng đánh dấu một chấm tại thời điểm at",
            "size": "đường kính chấm px (mặc định 42)", "step": "giây giữa các chấm khi chưa có at (mặc định 0.12)", "delay": "giây",
        },
    },
}

# Các tính năng bổ sung cho layer footage / ảnh (không phải preset)
FOOTAGE_FEATURES = """TÍNH NĂNG BỔ SUNG CHO layer type="footage" (video hoặc ảnh):
- "fit": "cover" | "contain" | "none" (mặc định tự chọn: lấp đầy khung nếu cùng tỷ lệ 16:9). Scale 100 luôn nghĩa là "vừa khung".
- "freeze": {"at": <giây tính từ đầu đoạn cắt>, "hold": <giây giữ hình>} dừng hình rồi cho chạy tiếp (Time Remap).
- "motion": {"type": "pushIn" | "pullOut" | "panLeft" | "panRight" | "driftUp", "amount": 6-15} chuyển động camera nhẹ (ảnh tĩnh nên dùng).
- "inPoint"/"duration": cắt đoạn video: bắt đầu từ giây inPoint trong file, hiển thị "duration" giây.
- "keyframes" vẫn dùng được: scale 100->110 tạo punch-in; "time" tính từ đầu layer.
"""


def preset_names():
    """Trả về danh sách tên preset hợp lệ."""
    return list(PRESETS.keys())


def catalog_prompt():
    """Sinh đoạn văn bản mô tả toàn bộ preset để đưa vào prompt cho AI."""
    lines = [CONVENTIONS, "DANH SÁCH PRESET (layer {\"type\":\"preset\",\"preset\":\"<tên>\",\"name\":...,\"startTime\":...,\"duration\":...,\"params\":{...}}):"]
    for name, info in PRESETS.items():
        lines.append(f"\n* {name}: {info['desc']}")
        for pname, pdesc in info["params"].items():
            lines.append(f"    - {pname}: {pdesc}")
    lines.append("\n" + FOOTAGE_FEATURES)
    return "\n".join(lines)
