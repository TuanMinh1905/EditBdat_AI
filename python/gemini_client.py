"""
Gemini Client — Gọi Google Gemini API để sinh timeline JSON từ prompt
"""

import json
import re
from google.genai import types

from preset_catalog import catalog_prompt


# System prompt hướng dẫn AI sinh timeline JSON đúng schema
SYSTEM_PROMPT = """Bạn là một chuyên gia After Effects. Nhiệm vụ của bạn là tạo một timeline JSON dựa trên:
1. Danh sách media files (với metadata)
2. Prompt mô tả hiệu ứng/animation từ người dùng

Bạn PHẢI trả về JSON hợp lệ theo schema sau (KHÔNG có markdown, KHÔNG có giải thích, CHỈ JSON):

{
  "composition": {
    "name": "Main Comp",
    "width": <số nguyên>,
    "height": <số nguyên>,
    "fps": <số>,
    "duration": <tổng thời lượng tính bằng giây>,
    "backgroundColor": [0, 0, 0]
  },
  "layers": [
    {
      "type": "footage" | "solid" | "text" | "audio" | "adjustment" | "preset",
      "name": "<tên layer>",
      "source": "<tên file nguồn - PHẢI khớp chính xác với tên file trong danh sách media>",
      "startTime": <thời điểm bắt đầu trong comp (giây)>,
      "inPoint": <điểm cắt bắt đầu trong source (giây), mặc định 0>,
      "outPoint": <điểm cắt kết thúc trong source (giây)>,
      "duration": <thời lượng hiển thị (giây)>,
      "position": {"x": <pixel>, "y": <pixel>},
      "scale": {"x": 100, "y": 100},
      "rotation": 0,
      "opacity": 100,
      "blendingMode": "normal",
      "keyframes": [
        {
          "property": "opacity" | "position" | "positionX" | "positionY" | "scale" | "scaleX" | "scaleY" | "rotation",
          "time": <giây tính từ đầu layer>,
          "value": <giá trị - số hoặc [x,y]>,
          "easing": "linear" | "easeIn" | "easeOut" | "easeInOut"
        }
      ],
      "effects": [
        {
          "type": "gaussianBlur" | "brightnessContrast" | "hueSaturation" | "tint" | "glow" | "dropShadow" | "fill",
          "params": {}
        }
      ],
      "text": {
        "content": "<nội dung>",
        "font": "Arial",
        "size": 72,
        "color": [1, 1, 1],
        "justification": "center",
        "bold": false,
        "italic": false
      }
    }
  ],
  "transitions": [
    {
      "type": "crossDissolve" | "slideLeft" | "slideRight" | "slideUp" | "slideDown" | "pushLeft" | "pushRight" | "wipeLeft" | "wipeRight" | "zoomIn" | "zoomOut",
      "fromLayerIndex": <index trong mảng layers>,
      "toLayerIndex": <index trong mảng layers>,
      "duration": <giây>
    }
  ]
}

QUY TẮC QUAN TRỌNG:
1. "source" PHẢI khớp chính xác với tên file trong danh sách media (phân biệt hoa thường).
2. Layers được liệt kê từ trên xuống dưới (layer đầu tiên ở trên cùng trong After Effects).
3. Đặt audio layers và footage layers riêng. Audio thường ở dưới cùng.
4. Nếu prompt nói "fade", dùng keyframe opacity. Nếu nói "slide", dùng keyframe position.
5. Transition "crossDissolve" = overlap 2 layer và fade opacity. Duration là thời gian chồng lấp.
6. position mặc định nên là giữa comp: {"x": width/2, "y": height/2}
7. Đảm bảo tổng duration của composition đủ chứa tất cả layers.
8. Cho footage video: outPoint không được vượt quá duration thực tế của source file.
9. Khi người dùng mô tả "cắt thẳng", dùng cắt thẳng (startTime của cảnh sau = thời điểm kết thúc cảnh trước, KHÔNG thêm transition). Chỉ dùng transition khi prompt yêu cầu.
10. Trả về CHỈ JSON, không có bất kỳ text nào khác.
"""

# Quy tắc dựng cảnh nâng cao (dùng thư viện preset)
DIRECTOR_RULES = """
QUY TẮC DỰNG CẢNH CHUYÊN NGHIỆP (RẤT QUAN TRỌNG):
A. Với mọi đồ họa (thẻ, chữ lớn, mũi tên, vòng đánh dấu, sân, đội hình, nền lưới): LUÔN dùng layer type "preset". KHÔNG tự vẽ bằng solid/text thô.
B. Chỉ dùng type "text" cho dòng chữ đơn giản nhất. Tiêu đề, câu hỏi, luận điểm phải dùng preset "text_reveal".
C. Mỗi cảnh trong prompt người dùng: tạo đủ các lớp theo thứ tự đọc hình (ảnh/footage -> chữ/thẻ -> chuyển động). Cảnh có nhiều nhịp thì dùng nhiều layer preset với delay/startTime khác nhau, KHÔNG cho mọi thứ hiện cùng lúc.
D. Nền: cảnh dữ liệu/chữ/tiêu đề dùng preset "grid_background" phủ suốt cảnh. Cảnh sơ đồ chiến thuật dùng preset "pitch".
E. Footage thật: dùng type "footage" với "freeze" khi prompt nói "dừng hình"; "motion" cho ảnh tĩnh; punch-in bằng keyframe scale 100 -> 108.
F. Giữ nguyên chữ do người dùng yêu cầu (viết hoa, tiếng Việt có dấu). KHÔNG bịa số liệu: nếu thiếu số, chỉ dùng chữ mô tả như người dùng đã nêu.
G. Âm thanh/tiếng chạm/nhạc: bỏ qua (chưa hỗ trợ), không tạo layer cho chúng.
H. Thời lượng mỗi cảnh: nếu prompt không nói, ước lượng 3-6 giây; nối tiếp các cảnh theo thứ tự (startTime cảnh sau = startTime + duration cảnh trước). Footage đã có độ dài thật, KHÔNG vượt quá.
I. Vị trí chữ/thẻ phải nằm trong khung (toạ độ chuẩn hóa 0.08..0.92), không đè lên nhau; hai thẻ cạnh nhau thì pos x khoảng 0.28 và 0.72.
"""

SYSTEM_PROMPT = SYSTEM_PROMPT + DIRECTOR_RULES + "\n" + catalog_prompt()


class GeminiClient:
    """Client gọi Google Gemini API để sinh timeline JSON."""

    def __init__(self, api_key):
        if not api_key:
            raise ValueError("Gemini API key không được để trống")
        self.api_key = api_key
        self._init_client()

    def _init_client(self):
        """Khởi tạo Gemini client."""
        from google import genai
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = "gemini-2.5-flash"

    def _make_config(self, temperature=0.2, max_output_tokens=16384):
        """Tạo GenerateContentConfig với ThinkingConfig cho thinking model."""
        return types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            thinking_config=types.ThinkingConfig(
                thinking_budget=4096
            )
        )

    def generate_timeline(self, media_context, prompt, comp_width=1920, comp_height=1080, comp_fps=30):
        """
        Sinh timeline JSON từ media context và prompt.

        Args:
            media_context: List of dicts với thông tin media files
            prompt: Mô tả hiệu ứng từ người dùng
            comp_width: Chiều rộng composition
            comp_height: Chiều cao composition
            comp_fps: FPS của composition

        Returns:
            dict: Timeline JSON object
        """
        # Build user message
        user_message = self._build_user_message(media_context, prompt, comp_width, comp_height, comp_fps)

        # Call Gemini (thinking model — cần config riêng)
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=[
                {"role": "user", "parts": [{"text": SYSTEM_PROMPT}]},
                {"role": "model", "parts": [{"text": "Tôi hiểu. Tôi sẽ sinh timeline JSON theo đúng schema đã cho. Hãy cung cấp media files và prompt."}]},
                {"role": "user", "parts": [{"text": user_message}]}
            ],
            config=self._make_config(temperature=0.2, max_output_tokens=32768)
        )

        # Parse response — thinking model có thể trả text=None nếu hết token
        raw_text = response.text
        if not raw_text:
            raise ValueError(
                f"Gemini trả về response trống (finish_reason: "
                f"{response.candidates[0].finish_reason if response.candidates else 'unknown'}). "
                f"Có thể model đang dùng hết token cho thinking."
            )
        timeline = self._parse_json_response(raw_text.strip())

        return timeline

    def fix_timeline(self, timeline, errors):
        """Nhờ AI sửa lỗi trong timeline."""
        fix_prompt = f"""Timeline JSON sau đây có lỗi. Hãy sửa và trả về JSON đã sửa (CHỈ JSON, không giải thích):

Lỗi:
{json.dumps(errors, ensure_ascii=False, indent=2)}

Timeline hiện tại:
{json.dumps(timeline, ensure_ascii=False, indent=2)}

Hãy sửa các lỗi trên và trả về JSON hoàn chỉnh đã sửa."""

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=fix_prompt,
            config=self._make_config(temperature=0.1, max_output_tokens=32768)
        )

        raw_text = response.text
        if not raw_text:
            raise ValueError("Gemini trả về response trống khi fix timeline")
        return self._parse_json_response(raw_text.strip())

    def _build_user_message(self, media_context, prompt, comp_width, comp_height, comp_fps):
        """Xây dựng message cho AI."""
        media_list = ""
        for i, m in enumerate(media_context):
            media_list += f"\n{i + 1}. File: \"{m['name']}\"\n"
            media_list += f"   Loại: {m.get('type', 'unknown')}\n"
            if m.get('duration'):
                media_list += f"   Thời lượng: {m['duration']:.2f} giây\n"
            if m.get('width') and m.get('height'):
                media_list += f"   Kích thước: {m['width']}x{m['height']}\n"
            if m.get('fps'):
                media_list += f"   FPS: {m['fps']}\n"

        return f"""MEDIA FILES:
{media_list}

COMPOSITION MẶC ĐỊNH:
- Width: {comp_width}
- Height: {comp_height}
- FPS: {comp_fps}

PROMPT CỦA NGƯỜI DÙNG:
{prompt}

Hãy tạo timeline JSON cho After Effects dựa trên thông tin trên. Trả về CHỈ JSON."""

    def _parse_json_response(self, raw_text):
        """Parse JSON từ response text (có thể bọc trong markdown code block)."""
        text = raw_text.strip()

        # Remove markdown code fences if present
        if text.startswith('```'):
            # Remove opening fence (```json or ```)
            text = re.sub(r'^```(?:json)?\s*\n?', '', text)
            # Remove closing fence
            text = re.sub(r'\n?```\s*$', '', text)
            text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            # Try to find JSON object in the text
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    pass
            raise ValueError(f"Không thể parse JSON từ AI response: {str(e)}\nResponse: {text[:500]}")
