"""
Source Suggester (Cong cu 1 — Goi y phan loai Source + Element + Animation theo phong cach ca nhan)
Su dung Gemini Embedding (RAG few-shot) + Gemini 3.8 Flash + Rule Set + Bang Phan Loai dong
de goi y cot `loai_source`, `element`, `anim` va `thoi_ky` tu file `1_CSV_Timeline.csv`,
xuat ra `2_CSV_PhanLoaiSource.csv`.
"""

import os
import re
import csv
import json
import math
import time
import base64
import shutil
import urllib.parse
from datetime import datetime
from google import genai
from google.genai import types
from token_tracker import record_usage


DEFAULT_SOURCE_TYPES = [
    {
        "code": "rai_1",
        "label": "Rải đơn",
        "description": "Video rải đơn (1 clip full màn hình) — cảnh thi đấu, pha bóng, dẫn chuyện chung",
    },
    {
        "code": "rai_2_1",
        "label": "Rải đôi 1",
        "description": "Video rải đôi kiểu 1 (2 clip chia đôi màn hình)",
    },
    {
        "code": "rai_2_2",
        "label": "Rải đôi 2",
        "description": "Video rải đôi kiểu 2 (2 clip bố cục phụ)",
    },
    {
        "code": "rai_3",
        "label": "Rải 3",
        "description": "Video rải 3 clip cùng lúc",
    },
    {
        "code": "rai_4",
        "label": "Rải 4 / Danh hiệu",
        "description": "Video rải 4 clip / tổng hợp danh hiệu, kết quả, cao trào nhiều góc",
    },
    {
        "code": "phong_van",
        "label": "Phỏng vấn",
        "description": "Cảnh phỏng vấn cầu thủ / HLV nói chuyện",
    },
    {
        "code": "training",
        "label": "Tập luyện",
        "description": "Cảnh tập luyện trên sân tập",
    },
    {
        "code": "binh_luan_chay",
        "label": "BLV nói",
        "description": "Cảnh bình luận viên / chuyên gia đang nói",
    },
    {
        "code": "khan_dai",
        "label": "Khán đài",
        "description": "Cảnh cổ động viên, khán đài, bầu không khí sân vận động",
    },
    {
        "code": "anh_thong_so",
        "label": "Bảng số liệu",
        "description": "Ảnh bảng thống kê, số liệu, biểu đồ so sánh",
    },
    {
        "code": "anh_thoi_diem",
        "label": "Ảnh khoảnh khắc",
        "description": "Ảnh chụp khoảnh khắc / đội hình / tin tức tại một thời điểm cụ thể",
    },
    {
        "code": "anh_chung_bao",
        "label": "Mặt báo",
        "description": "Ảnh mặt báo, tiêu đề báo chí truyền thông",
    },
    {
        "code": "sa_ban",
        "label": "Sa bàn",
        "description": "Sa bàn chiến thuật, sơ đồ đội hình",
    },
]

DEFAULT_ELEMENT_TYPES = [
    {
        "code": "auto",
        "label": "✨ Tự động (Auto)",
        "param": "",
        "description": "Tự động theo loại Source (phong_van->tv_retro, anh_thong_so->stats_table, anh_thoi_diem->scout_frame, còn lại không phủ)",
    },
    {
        "code": "none",
        "label": "🚫 Không phủ (None)",
        "param": "",
        "description": "Không dùng lớp phủ khung/texture ở câu này (để hình gốc thoáng mắt)",
    },
    {
        "code": "tv_retro",
        "label": "📺 Khung Sofa TV",
        "param": "tv FRAME2.png",
        "description": "Khung SOFA TV cổ điển (bo góc tối + màn hình CRT) — hợp cho ảnh đội hình, khoảnh khắc đáng nhớ, phỏng vấn",
    },
    {
        "code": "tv_green_frame",
        "label": "📺 Khung màn hình xanh",
        "param": "ChatGPT Image 20_46_49 15 thg 8, 2026.png",
        "description": "Khung màn hình xanh viền đen (TV / Monitor Green Screen)",
    },
    {
        "code": "tv_crt_gemini",
        "label": "📺 TV CRT cổ điển",
        "param": "Gemini_Generated_Image_xf3xbcxf3xbcxf3x.png",
        "description": "Khung TV CRT cổ điển trong phòng tối (Green Screen)",
    },
    {
        "code": "tv_sony",
        "label": "📺 TV Sony bàn gỗ",
        "param": "large-vecteezy_vintage-television-with-green-screen-on-a-wooden-table_54047797_large.mp4",
        "description": "Khung TV Sony cổ điển trên bàn gỗ (Video)",
    },
    {
        "code": "tv_dolly",
        "label": "📺 TV Dolly In",
        "param": "Television - Retro - Green Screen - Screen - Dolly In - Free Stock Video Footage 4K [ No Copyright ].webm",
        "description": "Hiệu ứng TV retro dolly-in (Video)",
    },
    {
        "code": "film_grain",
        "label": "🎞️ Phim 8mm hồi ức",
        "param": "8mm Film Frame Overlay - Free Retro Dirt Vintage Green Screen Effect for Editing look premiere HD - YouTube.mp4",
        "description": "Khung phim nhựa 8mm cổ điển (có lỗ cuốn phim bên cạnh) — rất hợp khi kể về thời niên thiếu, quá khứ xa, hồi ức",
    },
    {
        "code": "scout_frame",
        "label": "📋 Hồ sơ Scout",
        "param": "scout frame.png",
        "description": "Khung hồ sơ tuyển trạch / tin tức cầu thủ (scout frame)",
    },
    {
        "code": "stats_table",
        "label": "📊 Bảng / Vòng gốc (Vàng nâu)",
        "param": "Comparison Table List Infographic Graph.png",
        "description": "Khung bảng thống kê / vòng tròn màu vàng nâu (mẫu gốc)",
    },
    {
        "code": "stats_table_1",
        "label": "📊 Bảng / Vòng mẫu 1 (Xanh đậm)",
        "param": "Comparison Table List Infographic Graph (1).png",
        "description": "Bảng thống kê / vòng tròn mẫu 1 (Xanh đậm)",
    },
    {
        "code": "stats_table_2",
        "label": "📊 Bảng / Vòng mẫu 2 (Đỏ đậm)",
        "param": "Comparison Table List Infographic Graph (2).png",
        "description": "Bảng thống kê / vòng tròn mẫu 2 (Đỏ đậm)",
    },
    {
        "code": "stats_table_3",
        "label": "📊 Bảng / Vòng mẫu 3 (Đen xám)",
        "param": "Comparison Table List Infographic Graph (3).png",
        "description": "Bảng thống kê / vòng tròn mẫu 3 (Đen xám)",
    },
    {
        "code": "stats_table_4",
        "label": "📊 Bảng / Vòng mẫu 4 (Xanh lá)",
        "param": "Comparison Table List Infographic Graph (4).png",
        "description": "Bảng thống kê / vòng tròn mẫu 4 (Xanh lá)",
    },
    {
        "code": "stats_table_5",
        "label": "📊 Bảng / Vòng mẫu 5 (Tím)",
        "param": "Comparison Table List Infographic Graph (5).png",
        "description": "Bảng thống kê / vòng tròn mẫu 5 (Tím)",
    },
    {
        "code": "circle_gold",
        "label": "🌑 Viền tối góc xanh (5.png)",
        "param": "5.png",
        "description": "Viền tối spotlight góc xanh (5.png) — nhấn mạnh cầu thủ / danh hiệu",
    },
    {
        "code": "circle_blue",
        "label": "🔵 Vòng tròn xanh (o.png)",
        "param": "o.png",
        "description": "Vòng tròn spotlight xanh dương (o.png — đánh dấu vị trí cầu thủ)",
    },
    {
        "code": "paper_texture",
        "label": "📜 Giấy cũ 1 (Sáng)",
        "param": "paper texture.png",
        "description": "Lớp phủ giấy cũ 1 (paper texture.png) tạo chất liệu tư liệu",
    },
    {
        "code": "paper_texture_2",
        "label": "📜 Giấy cũ 2 (Tối)",
        "param": "paper texture 2.png",
        "description": "Lớp phủ giấy cũ 2 tối (paper texture 2.png)",
    },
    {
        "code": "texture_dark",
        "label": "🌑 Phủ xám tối (textture.png)",
        "param": "textture.png",
        "description": "Lớp phủ xám tối (textture.png) tạo chiều sâu trầm lắng, chuyển chương",
    },
    {
        "code": "texture_2",
        "label": "⬜ Phủ nền sáng (texture2.png)",
        "param": "texture2.png",
        "description": "Lớp phủ nền sáng (texture2.png) cho toàn video",
    },
    {
        "code": "grid_orange",
        "label": "🟧 Lưới cam (Video)",
        "param": "vecteezy_orange-grid-animation-with-gradient-color-background_48391360.mp4",
        "description": "Nền lưới cam chuyển động (grid animation video)",
    },
    {
        "code": "intro",
        "label": "🎬 Video Intro (intro.mp4)",
        "param": "intro.mp4",
        "description": "Video Intro mở đầu (intro.mp4)",
    },
]

DEFAULT_ANIMATION_TYPES = [
    {
        "code": "auto",
        "label": "🔄 Mặc định (Auto)",
        "param": "auto",
        "description": "Tự động xen kẽ zoom nhẹ 100% <-> 108% giữa các clip",
    },
    {
        "code": "zoom_in",
        "label": "🔍 Phóng to (Zoom In)",
        "param": "100->108",
        "description": "Zoom In từ từ (100% -> 108%) — tập trung dần vào nhân vật/bức ảnh",
    },
    {
        "code": "zoom_out",
        "label": "🔎 Thu nhỏ (Zoom Out)",
        "param": "108->100",
        "description": "Zoom Out từ từ (108% -> 100%) — mở rộng góc nhìn toàn cảnh",
    },
    {
        "code": "static",
        "label": "⏹️ Đứng yên (Static)",
        "param": "100->100",
        "description": "Đứng yên (100%) — không phóng to thu nhỏ",
    },
]

DEFAULT_BGM_TYPES = [
    {
        "code": "auto",
        "label": "✨ Tự động (Auto)",
        "param": "",
        "description": "Tự động chọn và nối liền mạch nhạc nền theo từng Đoạn lớn (doan) & mạch cảm xúc",
    },
    {
        "code": "none",
        "label": "🔇 Không nhạc nền (None)",
        "param": "",
        "description": "Tắt nhạc nền ở đoạn này (nhường chỗ cho tiếng BLV gốc hoặc khoảng lặng kịch tính)",
    },
    {
        "code": "bgm_default",
        "label": "🎵 Nhạc nền chuẩn SofaZone",
        "param": "nhạc nền background.mp3",
        "description": "Nhạc nền chủ đạo mặc định của kênh (dẫn chuyện chung, phân tích chiến thuật)",
    },
    {
        "code": "bgm_momentum",
        "label": "🎵 Momentum (Nhịp độ nhanh)",
        "param": "chestnutmusicstudios-05-momentum-589472.mp3",
        "description": "Nhạc nền nhịp độ dồn dập, cuốn hút — hợp cho chuỗi pha bóng tốc độ, phản công, cao trào",
    },
    {
        "code": "bgm_dark_ambient",
        "label": "🎵 Dark Ambient (Trầm / Bí ẩn)",
        "param": "cinematic-soul-dark-ambient-background-music-617907.mp3",
        "description": "Nhạc nền trầm lắng, u tối, điện ảnh — hợp khi kể về khủng hoảng, thất bại, chấn thương, góc khuất",
    },
    {
        "code": "bgm_freedom",
        "label": "🎵 Price of Freedom (Hào hùng)",
        "param": "good_b_music-price-of-freedom-33106.mp3",
        "description": "Nhạc nền hào hùng, xúc động — hợp cho đoạn nâng cúp vô địch, khoảnh khắc huyền thoại, kết bài",
    },
    {
        "code": "bgm_nastelbom",
        "label": "🎵 Nastelbom (Kể chuyện)",
        "param": "nastelbom-background-music-617075.mp3",
        "description": "Nhạc nền kể chuyện hiện đại, mạch lạc — hợp cho phần mở bài hoặc giải thích bối cảnh",
    },
    {
        "code": "bgm_mid_1",
        "label": "🎵 Nhạc nền Mid 1",
        "param": "mid.mp3",
        "description": "Nhạc nền chuyển đoạn / dẫn chuyện nhịp vừa (mid.mp3)",
    },
    {
        "code": "bgm_mid_2",
        "label": "🎵 Nhạc nền Mid 2",
        "param": "mid2.mp3",
        "description": "Nhạc nền phân tích nhịp vừa 2 (mid2.mp3)",
    },
    {
        "code": "bgm_mid_3",
        "label": "🎵 Nhạc nền Mid 3",
        "param": "mid3.mp3",
        "description": "Nhạc nền phân tích nhịp vừa 3 (mid3.mp3)",
    },
    {
        "code": "bgm_mid_4",
        "label": "🎵 Nhạc nền Mid 4",
        "param": "mid4.mp3",
        "description": "Nhạc nền phân tích nhịp vừa 4 (mid4.mp3)",
    },
    {
        "code": "bgm_mid_5",
        "label": "🎵 Nhạc nền Mid 5",
        "param": "mid5.mp3",
        "description": "Nhạc nền phân tích nhịp vừa 5 (mid5.mp3)",
    },
]

DEFAULT_SFX_TYPES = [
    {
        "code": "auto",
        "label": "✨ Tự động (Auto)",
        "param": "",
        "description": "Tự động đặt SFX hợp với Lớp phủ / Source (mặt báo->camera_shutter, bảng số->data_beep, khán đài->crowd_cheer)",
    },
    {
        "code": "none",
        "label": "🔇 Không hiệu ứng (None)",
        "param": "",
        "description": "Không chèn hiệu ứng âm thanh ở câu này (giữ giọng đọc sạch)",
    },
    {
        "code": "whoosh",
        "label": "💨 Whoosh (Chuyển cảnh)",
        "param": "whoosh.mp3",
        "description": "Tiếng gió lướt nhanh khi chuyển cảnh, đổi chủ đề hoặc phóng to đột ngột",
    },
    {
        "code": "camera_shutter",
        "label": "📸 Chụp ảnh (Mặt báo / Ảnh)",
        "param": "camera_shutter.mp3",
        "description": "Tiếng tách máy ảnh khi hiện mặt báo (anh_chung_bao), ảnh khoảnh khắc (anh_thoi_diem) hoặc hồ sơ",
    },
    {
        "code": "data_beep",
        "label": "📊 Tiếng số liệu (Bảng thống kê)",
        "param": "data_beep.mp3",
        "description": "Tiếng nhảy số điện tử / gõ phím khi hiện bảng thống kê (anh_thong_so / stats_table)",
    },
    {
        "code": "crowd_cheer",
        "label": "🏟️ Khán đài reo hò",
        "param": "crowd_cheer.mp3",
        "description": "Tiếng cổ động viên hò reo vang dội khi ghi bàn, ăn mừng danh hiệu (rai_4, khan_dai)",
    },
    {
        "code": "whistle",
        "label": "📢 Tiếng còi trọng tài",
        "param": "whistle.mp3",
        "description": "Tiếng còi khai cuộc / mãn cuộc hoặc tình huống phạm lỗi tranh cãi",
    },
    {
        "code": "tv_glitch",
        "label": "📺 Tiếng bật TV / Nhiễu sóng",
        "param": "tv_glitch.mp3",
        "description": "Tiếng bật tivi CRT / nhiễu sóng nhẹ khi xuất hiện khung TV (tv_retro, tv_sony)",
    },
    {
        "code": "film_projector",
        "label": "🎞️ Máy chiếu phim 8mm",
        "param": "film_projector.mp3",
        "description": "Tiếng cuộn phim nhựa cổ điển quay đều khi dùng lớp phủ hồi ức (film_grain)",
    },
    {
        "code": "impact_boom",
        "label": "💥 Bass Boom / Hit (Điểm nhấn)",
        "param": "impact_boom.mp3",
        "description": "Tiếng trống trầm / Cinematic Hit tạo điểm nhấn mạnh cho câu chốt hạ hoặc bước ngoặt lớn",
    },
]

VALID_LOAI = [x["code"] for x in DEFAULT_SOURCE_TYPES]
LOAI_DESCRIPTIONS = {x["code"]: x["description"] for x in DEFAULT_SOURCE_TYPES}

VALID_ELEMENTS = [x["code"] for x in DEFAULT_ELEMENT_TYPES]
ELEMENT_DESCRIPTIONS = {x["code"]: x["description"] for x in DEFAULT_ELEMENT_TYPES}

VALID_ANIMS = [x["code"] for x in DEFAULT_ANIMATION_TYPES]
ANIM_DESCRIPTIONS = {x["code"]: x["description"] for x in DEFAULT_ANIMATION_TYPES}

VALID_BGMS = [x["code"] for x in DEFAULT_BGM_TYPES]
BGM_DESCRIPTIONS = {x["code"]: x["description"] for x in DEFAULT_BGM_TYPES}

VALID_SFXS = [x["code"] for x in DEFAULT_SFX_TYPES]
SFX_DESCRIPTIONS = {x["code"]: x["description"] for x in DEFAULT_SFX_TYPES}


class SourceSuggester:
    """Quan ly quy tac phong cach, 5 bang phan loai (Source/Element/Anim/BGM/SFX), kho vi du (RAG embedding) va goi AI."""

    def __init__(self, base_dir=None, log=None):
        """Khoi tao SourceSuggester voi duong dan luu tru trong templates/."""
        if base_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.base_dir = base_dir
        self.templates_dir = os.path.join(self.base_dir, "templates")
        os.makedirs(self.templates_dir, exist_ok=True)
        self.cls_media_dir = os.path.join(self.templates_dir, "cls_media")
        os.makedirs(self.cls_media_dir, exist_ok=True)

        self.rules_path = os.path.join(self.templates_dir, "source_style_rules.txt")
        self.examples_path = os.path.join(self.templates_dir, "source_examples.json")
        self.classifications_path = os.path.join(
            self.templates_dir, "classifications.json"
        )
        self.element_map_path = os.path.join(self.templates_dir, "element_map.json")
        self.sound_map_path = os.path.join(self.templates_dir, "sound_map.json")
        self.external_sync_dir = (
            r"D:\Edit SofaZone\01_Tai_Nguyen_Co_Dinh\Quy_Tac_AI_Prompt"
        )
        self.sounds_root_dir = r"D:\Edit SofaZone\01_Tai_Nguyen_Co_Dinh\Sounds"
        self._log = log or (lambda msg: print(msg, flush=True))

        # Dam bao thu muc SFX ton tai neu Sounds ton tai
        try:
            if os.path.isdir(self.sounds_root_dir):
                os.makedirs(os.path.join(self.sounds_root_dir, "Background"), exist_ok=True)
                os.makedirs(os.path.join(self.sounds_root_dir, "SFX"), exist_ok=True)
        except Exception:
            pass

        # Dam bao file ton tai
        if not os.path.exists(self.rules_path):
            with open(self.rules_path, "w", encoding="utf-8") as f:
                f.write("")
        if not os.path.exists(self.examples_path):
            with open(self.examples_path, "w", encoding="utf-8") as f:
                f.write("[]\n")
        if not os.path.exists(self.classifications_path):
            self._save_classifications_raw(
                {
                    "source_types": DEFAULT_SOURCE_TYPES,
                    "element_types": DEFAULT_ELEMENT_TYPES,
                    "animation_types": DEFAULT_ANIMATION_TYPES,
                    "bgm_types": DEFAULT_BGM_TYPES,
                    "sfx_types": DEFAULT_SFX_TYPES,
                }
            )

    def _sync_external_backup(self):
        """Dong bo ban sao .txt, .json sang 01_Tai_Nguyen_Co_Dinh."""
        try:
            if os.path.isdir(self.external_sync_dir):
                for src in (
                    self.rules_path,
                    self.examples_path,
                    self.classifications_path,
                    self.element_map_path,
                    self.sound_map_path,
                ):
                    if os.path.exists(src):
                        shutil.copy2(
                            src,
                            os.path.join(self.external_sync_dir, os.path.basename(src)),
                        )
        except Exception as e:
            self._log(f"[Suggester] Bo qua dong bo backup ngoai: {str(e)}")

    # ------------------------------------------------------------------
    # 0. Quan ly 5 Bang Phan Loai (classifications.json)
    # ------------------------------------------------------------------

    def _load_classifications_raw(self):
        """Doc file classifications.json, tra ve dict 5 bang: source_types, element_types, animation_types, bgm_types, sfx_types."""
        try:
            if os.path.exists(self.classifications_path):
                with open(self.classifications_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    src = data.get("source_types")
                    el = data.get("element_types")
                    anim = data.get("animation_types")
                    bgm = data.get("bgm_types")
                    sfx = data.get("sfx_types")
                    # Tuong thich nguoc neu file cu gop element va anim trong animation_types
                    if not isinstance(el, list) or len(el) == 0:
                        if isinstance(anim, list) and any(x.get("group") == "element" for x in anim):
                            el = [
                                {k: v for k, v in x.items() if k != "group"}
                                for x in anim
                                if x.get("group") != "anim"
                            ]
                            anim = [
                                {k: v for k, v in x.items() if k != "group"}
                                for x in anim
                                if x.get("group") == "anim"
                            ]
                        else:
                            el = list(DEFAULT_ELEMENT_TYPES)
                    else:
                        el = [{k: v for k, v in x.items() if k != "group"} for x in el]
                    if isinstance(anim, list) and len(anim) > 0:
                        anim = [{k: v for k, v in x.items() if k != "group"} for x in anim if x.get("group") != "element"]
                    else:
                        anim = list(DEFAULT_ANIMATION_TYPES)
                    if not isinstance(bgm, list) or len(bgm) == 0:
                        bgm = list(DEFAULT_BGM_TYPES)
                    if not isinstance(sfx, list) or len(sfx) == 0:
                        sfx = list(DEFAULT_SFX_TYPES)
                    return {
                        "source_types": src
                        if isinstance(src, list) and len(src) > 0
                        else list(DEFAULT_SOURCE_TYPES),
                        "element_types": el if len(el) > 0 else list(DEFAULT_ELEMENT_TYPES),
                        "animation_types": anim if len(anim) > 0 else list(DEFAULT_ANIMATION_TYPES),
                        "bgm_types": bgm,
                        "sfx_types": sfx,
                    }
        except Exception as e:
            self._log(f"[Suggester] Loi doc classifications.json: {str(e)}")
        return {
            "source_types": list(DEFAULT_SOURCE_TYPES),
            "element_types": list(DEFAULT_ELEMENT_TYPES),
            "animation_types": list(DEFAULT_ANIMATION_TYPES),
            "bgm_types": list(DEFAULT_BGM_TYPES),
            "sfx_types": list(DEFAULT_SFX_TYPES),
        }

    def _save_classifications_raw(self, data):
        """Ghi classifications.json va dong bo sang element_map.json + sound_map.json + backup ngoai."""
        with open(self.classifications_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        self._sync_element_map(data.get("element_types", []))
        self._sync_sound_map(data.get("bgm_types", []), data.get("sfx_types", []))
        self._sync_external_backup()

    def _sync_element_map(self, element_types):
        """Cap nhat templates/element_map.json khi user chinh sua hoac them element moi."""
        try:
            el_map_data = {"auto_map": {}, "elements": {}}
            if os.path.exists(self.element_map_path):
                with open(self.element_map_path, "r", encoding="utf-8-sig") as f:
                    el_map_data = json.load(f)
            elements_dict = el_map_data.get("elements", {})

            for item in element_types:
                code = str(item.get("code", "")).strip()
                param_file = str(item.get("param", "")).strip()
                desc = str(item.get("description", "")).strip()
                if not code or code in ("auto", "none"):
                    continue
                if param_file:
                    ext = os.path.splitext(param_file)[1].lower()
                    is_img = ext in (".png", ".jpg", ".jpeg", ".bmp", ".webp")
                    existing = elements_dict.get(code, {})
                    elements_dict[code] = {
                        "file": param_file,
                        "track": existing.get("track", "V3"),
                        "scope": existing.get("scope", "clip"),
                        "is_image": is_img,
                        "opacity": existing.get("opacity", 100),
                        "subject_isolation": existing.get("subject_isolation", False),
                        "note": desc or item.get("label", code),
                    }
            el_map_data["elements"] = elements_dict
            with open(self.element_map_path, "w", encoding="utf-8") as f:
                json.dump(el_map_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            self._log(f"[Suggester] Bo qua dong bo element_map.json: {str(e)}")

    def _sync_sound_map(self, bgm_types, sfx_types):
        """Cap nhat templates/sound_map.json khi user chinh sua hoac them BGM / SFX moi."""
        try:
            snd_map_data = {"bgm": {}, "sfx": {}, "auto_sfx_by_loai": {}}
            if os.path.exists(self.sound_map_path):
                with open(self.sound_map_path, "r", encoding="utf-8-sig") as f:
                    snd_map_data = json.load(f)
            bgm_dict = snd_map_data.get("bgm", {})
            sfx_dict = snd_map_data.get("sfx", {})

            for item in bgm_types:
                code = str(item.get("code", "")).strip()
                param_file = str(item.get("param", "")).strip()
                desc = str(item.get("description", "")).strip()
                if not code or code in ("auto", "none") or not param_file:
                    continue
                rel_file = param_file if ("/" in param_file or "\\" in param_file) else f"Background/{param_file}"
                bgm_dict[code] = {
                    "file": rel_file,
                    "description": desc or item.get("label", code),
                }

            for item in sfx_types:
                code = str(item.get("code", "")).strip()
                param_file = str(item.get("param", "")).strip()
                desc = str(item.get("description", "")).strip()
                if not code or code in ("auto", "none") or not param_file:
                    continue
                rel_file = param_file if ("/" in param_file or "\\" in param_file) else f"SFX/{param_file}"
                sfx_dict[code] = {
                    "file": rel_file,
                    "description": desc or item.get("label", code),
                }

            snd_map_data["bgm"] = bgm_dict
            snd_map_data["sfx"] = sfx_dict
            with open(self.sound_map_path, "w", encoding="utf-8") as f:
                json.dump(snd_map_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            self._log(f"[Suggester] Bo qua dong bo sound_map.json: {str(e)}")

    def get_classifications(self):
        """Tra ve du lieu 5 bang phan loai Source, Lop phu Design, Animation, Sound nen va Sound Effect cho UI."""
        data = self._load_classifications_raw()
        return {
            "source_types": data["source_types"],
            "element_types": data["element_types"],
            "animation_types": data["animation_types"],
            "bgm_types": data["bgm_types"],
            "sfx_types": data["sfx_types"],
            "classifications_path": self.classifications_path,
        }

    def _persist_cls_media(self, prefix, code, media_val):
        """Luu video/anh/audio minh hoa vao templates/cls_media/ (hoac Sounds/Background, Sounds/SFX) de khong lam nang file JSON."""
        if not media_val or media_val == "__none__":
            return media_val
        try:
            os.makedirs(self.cls_media_dir, exist_ok=True)
            # Xac dinh thu muc dich cho audio neu la bgm hoac sfx
            target_dir = self.cls_media_dir
            if prefix in ("bgm", "sfx") and os.path.isdir(self.sounds_root_dir):
                sub = "Background" if prefix == "bgm" else "SFX"
                target_dir = os.path.join(self.sounds_root_dir, sub)
                os.makedirs(target_dir, exist_ok=True)

            # 1A. Neu la data:audio/...;base64,... -> giai ma va ghi ra file am thanh
            if media_val.startswith("data:audio/"):
                header, b64_data = media_val.split(",", 1)
                mime = header.split(";")[0].replace("data:audio/", "").strip().lower()
                ext_map = {
                    "mpeg": ".mp3",
                    "mp3": ".mp3",
                    "wav": ".wav",
                    "x-wav": ".wav",
                    "ogg": ".ogg",
                    "mp4": ".m4a",
                    "x-m4a": ".m4a",
                    "aac": ".aac",
                    "flac": ".flac",
                }
                ext = ext_map.get(mime, ".mp3")
                fname = f"{code}{ext}" if prefix in ("bgm", "sfx") else f"{prefix}_{code}{ext}"
                out_path = os.path.join(target_dir, fname)
                with open(out_path, "wb") as f:
                    f.write(base64.b64decode(b64_data))
                url_path = urllib.parse.quote(out_path.replace("\\", "/"), safe="/:.-_")
                return f"file:///{url_path}?v={int(time.time())}"

            # 1B. Neu la data:video/...;base64,... -> giai ma va ghi ra file video
            if media_val.startswith("data:video/"):
                header, b64_data = media_val.split(",", 1)
                mime = header.split(";")[0].replace("data:video/", "").strip().lower()
                ext_map = {"mp4": ".mp4", "webm": ".webm", "quicktime": ".mov", "ogg": ".ogv"}
                ext = ext_map.get(mime, ".mp4")
                fname = f"{prefix}_{code}{ext}"
                out_path = os.path.join(self.cls_media_dir, fname)
                with open(out_path, "wb") as f:
                    f.write(base64.b64decode(b64_data))
                url_path = urllib.parse.quote(out_path.replace("\\", "/"), safe="/:.-_")
                return f"file:///{url_path}?v={int(time.time())}"

            # 2. Neu la file:///... tu ngoai -> copy vao target_dir de luu vinh vien
            if media_val.startswith("file:///"):
                raw_part = media_val[8:].split("?")[0].split("#")[0]
                local_path = urllib.parse.unquote(raw_part).replace("/", os.sep)
                if os.path.isfile(local_path):
                    norm_local = os.path.normcase(os.path.abspath(local_path))
                    norm_media_dir = os.path.normcase(os.path.abspath(self.cls_media_dir))
                    if not norm_local.startswith(norm_media_dir) and "01_tai_nguyen_co_dinh" not in norm_local:
                        ext = os.path.splitext(local_path)[1].lower() or (".mp3" if prefix in ("bgm", "sfx") else ".mp4")
                        orig_name = os.path.basename(local_path)
                        fname = orig_name if prefix in ("bgm", "sfx") else f"{prefix}_{code}{ext}"
                        out_path = os.path.join(target_dir, fname)
                        shutil.copy2(local_path, out_path)
                        url_path = urllib.parse.quote(out_path.replace("\\", "/"), safe="/:.-_")
                        return f"file:///{url_path}?v={int(time.time())}"
        except Exception as e:
            self._log(f"[Suggester] Bo qua copy cls_media ({code}): {str(e)}")
        return media_val

    def save_classifications(
        self,
        source_types=None,
        element_types=None,
        animation_types=None,
        bgm_types=None,
        sfx_types=None,
    ):
        """Luu cap nhat 5 bang Phan loai Source, Lop phu Design, Animation, Sound nen va Sound Effect tu UI."""
        current = self._load_classifications_raw()

        if source_types is not None and isinstance(source_types, list):
            clean_src = []
            seen_codes = set()
            for it in source_types:
                code = re.sub(
                    r"[^a-zA-Z0-9_]",
                    "_",
                    str(it.get("code", "")).strip().lower(),
                ).strip("_")
                if not code or code in seen_codes:
                    continue
                seen_codes.add(code)
                img_val = self._persist_cls_media("src", code, str(it.get("image", "")).strip())
                clean_src.append(
                    {
                        "code": code,
                        "label": str(it.get("label", code)).strip() or code,
                        "description": str(it.get("description", "")).strip(),
                        "image": img_val,
                    }
                )
            if clean_src:
                current["source_types"] = clean_src

        if element_types is not None and isinstance(element_types, list):
            clean_el = []
            seen_el = set()
            for it in element_types:
                code = re.sub(
                    r"[^a-zA-Z0-9_]",
                    "_",
                    str(it.get("code", "")).strip().lower(),
                ).strip("_")
                if not code or code in seen_el:
                    continue
                seen_el.add(code)
                img_val = self._persist_cls_media("element", code, str(it.get("image", "")).strip())
                clean_el.append(
                    {
                        "code": code,
                        "label": str(it.get("label", code)).strip() or code,
                        "param": str(it.get("param", "")).strip(),
                        "description": str(it.get("description", "")).strip(),
                        "image": img_val,
                    }
                )
            if clean_el:
                current["element_types"] = clean_el

        if animation_types is not None and isinstance(animation_types, list):
            clean_anim = []
            seen_anim = set()
            for it in animation_types:
                code = re.sub(
                    r"[^a-zA-Z0-9_]",
                    "_",
                    str(it.get("code", "")).strip().lower(),
                ).strip("_")
                if not code or code in seen_anim:
                    continue
                seen_anim.add(code)
                img_val = self._persist_cls_media("anim", code, str(it.get("image", "")).strip())
                clean_anim.append(
                    {
                        "code": code,
                        "label": str(it.get("label", code)).strip() or code,
                        "param": str(it.get("param", "")).strip(),
                        "description": str(it.get("description", "")).strip(),
                        "image": img_val,
                    }
                )
            if clean_anim:
                current["animation_types"] = clean_anim

        if bgm_types is not None and isinstance(bgm_types, list):
            clean_bgm = []
            seen_bgm = set()
            for it in bgm_types:
                code = re.sub(
                    r"[^a-zA-Z0-9_]",
                    "_",
                    str(it.get("code", "")).strip().lower(),
                ).strip("_")
                if not code or code in seen_bgm:
                    continue
                seen_bgm.add(code)
                img_val = self._persist_cls_media("bgm", code, str(it.get("image", "")).strip())
                param_val = str(it.get("param", "")).strip()
                if not param_val and img_val and img_val.startswith("file:///"):
                    raw_p = urllib.parse.unquote(img_val[8:].split("?")[0])
                    param_val = os.path.basename(raw_p)
                clean_bgm.append(
                    {
                        "code": code,
                        "label": str(it.get("label", code)).strip() or code,
                        "param": param_val,
                        "description": str(it.get("description", "")).strip(),
                        "image": img_val,
                    }
                )
            if clean_bgm:
                current["bgm_types"] = clean_bgm

        if sfx_types is not None and isinstance(sfx_types, list):
            clean_sfx = []
            seen_sfx = set()
            for it in sfx_types:
                code = re.sub(
                    r"[^a-zA-Z0-9_]",
                    "_",
                    str(it.get("code", "")).strip().lower(),
                ).strip("_")
                if not code or code in seen_sfx:
                    continue
                seen_sfx.add(code)
                img_val = self._persist_cls_media("sfx", code, str(it.get("image", "")).strip())
                param_val = str(it.get("param", "")).strip()
                if not param_val and img_val and img_val.startswith("file:///"):
                    raw_p = urllib.parse.unquote(img_val[8:].split("?")[0])
                    param_val = os.path.basename(raw_p)
                clean_sfx.append(
                    {
                        "code": code,
                        "label": str(it.get("label", code)).strip() or code,
                        "param": param_val,
                        "description": str(it.get("description", "")).strip(),
                        "image": img_val,
                    }
                )
            if clean_sfx:
                current["sfx_types"] = clean_sfx

        self._save_classifications_raw(current)
        self._log(
            f"[Suggester] Da luu 5 bang phan loai: {len(current['source_types'])} Source, {len(current['element_types'])} Lop phu, {len(current['animation_types'])} Animation, {len(current['bgm_types'])} Sound nen, {len(current['sfx_types'])} Sound Effect"
        )
        return self.get_classifications()

    def _get_dynamic_dicts(self):
        """Tra ve (loai_dict, element_dict, anim_dict, bgm_dict, sfx_dict) tu classifications.json."""
        cls_data = self._load_classifications_raw()
        loai_dict = {}
        for x in cls_data["source_types"]:
            c = x.get("code", "").strip()
            if c:
                lbl = x.get("label", "")
                desc = x.get("description", "")
                loai_dict[c] = f"{lbl} — {desc}" if lbl and desc else (desc or lbl or c)

        element_dict = {}
        for x in cls_data["element_types"]:
            c = x.get("code", "").strip()
            if not c:
                continue
            lbl = x.get("label", "")
            desc = x.get("description", "")
            param = x.get("param", "")
            full_desc = desc or lbl or c
            if param:
                full_desc = f"{full_desc} [File: {param}]"
            element_dict[c] = full_desc

        anim_dict = {}
        for x in cls_data["animation_types"]:
            c = x.get("code", "").strip()
            if not c:
                continue
            lbl = x.get("label", "")
            desc = x.get("description", "")
            param = x.get("param", "")
            full_desc = desc or lbl or c
            if param and param != "auto":
                full_desc = f"{full_desc} (Thông số: {param})"
            anim_dict[c] = full_desc

        bgm_dict = {}
        for x in cls_data.get("bgm_types", DEFAULT_BGM_TYPES):
            c = x.get("code", "").strip()
            if not c:
                continue
            lbl = x.get("label", "")
            desc = x.get("description", "")
            param = x.get("param", "")
            full_desc = desc or lbl or c
            if param:
                full_desc = f"{full_desc} [File: {param}]"
            bgm_dict[c] = full_desc

        sfx_dict = {}
        for x in cls_data.get("sfx_types", DEFAULT_SFX_TYPES):
            c = x.get("code", "").strip()
            if not c:
                continue
            lbl = x.get("label", "")
            desc = x.get("description", "")
            param = x.get("param", "")
            full_desc = desc or lbl or c
            if param:
                full_desc = f"{full_desc} [File: {param}]"
            sfx_dict[c] = full_desc

        if "auto" not in element_dict:
            element_dict["auto"] = ELEMENT_DESCRIPTIONS["auto"]
        if "none" not in element_dict:
            element_dict["none"] = ELEMENT_DESCRIPTIONS["none"]
        if "auto" not in anim_dict:
            anim_dict["auto"] = ANIM_DESCRIPTIONS["auto"]
        if "auto" not in bgm_dict:
            bgm_dict["auto"] = BGM_DESCRIPTIONS["auto"]
        if "none" not in bgm_dict:
            bgm_dict["none"] = BGM_DESCRIPTIONS["none"]
        if "auto" not in sfx_dict:
            sfx_dict["auto"] = SFX_DESCRIPTIONS["auto"]
        if "none" not in sfx_dict:
            sfx_dict["none"] = SFX_DESCRIPTIONS["none"]

        return (
            loai_dict or LOAI_DESCRIPTIONS,
            element_dict or ELEMENT_DESCRIPTIONS,
            anim_dict or ANIM_DESCRIPTIONS,
            bgm_dict or BGM_DESCRIPTIONS,
            sfx_dict or SFX_DESCRIPTIONS,
        )

    # ------------------------------------------------------------------
    # 1. Quan ly Quy tac phong cach (Style Rules)
    # ------------------------------------------------------------------

    def get_rules(self):
        """Doc noi dung quy tac phong cach tu file."""
        try:
            if not os.path.exists(self.rules_path):
                return ""
            with open(self.rules_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            self._log(f"[Suggester] Loi doc rules: {str(e)}")
            return ""

    def save_rules(self, rules_text):
        """Luu noi dung quy tac phong cach vao file."""
        with open(self.rules_path, "w", encoding="utf-8") as f:
            f.write(rules_text or "")
        self._sync_external_backup()
        self._log(
            f"[Suggester] Da luu quy tac phong cach ({len(rules_text or '')} ky tu)"
        )
        return True

    # ------------------------------------------------------------------
    # 2. Quan ly Kho vi du (Examples + Embeddings)
    # ------------------------------------------------------------------

    def _load_examples_raw(self):
        """Doc danh sach vi du day du (bao gom vector embedding neu co)."""
        try:
            if not os.path.exists(self.examples_path):
                return []
            with open(self.examples_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception as e:
            self._log(f"[Suggester] Loi doc examples: {str(e)}")
            return []

    def _save_examples_raw(self, examples):
        """Luu danh sach vi du xuong file JSON."""
        with open(self.examples_path, "w", encoding="utf-8") as f:
            json.dump(examples, f, ensure_ascii=False, indent=2)
        self._sync_external_backup()

    def get_examples(self):
        """Tra ve danh sach vi du cho UI (loai bo truong embedding nang)."""
        raw = self._load_examples_raw()
        clean = []
        for idx, ex in enumerate(raw):
            clean.append(
                {
                    "id": ex.get("id", idx + 1),
                    "text": ex.get("text", ""),
                    "loai_source": ex.get("loai_source", "rai_1"),
                    "element": ex.get("element", "auto"),
                    "anim": ex.get("anim", "auto"),
                    "bgm": ex.get("bgm", "auto"),
                    "sfx": ex.get("sfx", "auto"),
                    "thoi_ky": ex.get("thoi_ky", ""),
                    "note": ex.get("note", ""),
                    "has_embedding": bool(ex.get("embedding")),
                    "created_at": ex.get("created_at", ""),
                }
            )
        return clean

    def _embed_texts(self, client, texts):
        """
        Goi Gemini Embedding API cho danh sach texts.
        Thu lan luot text-embedding-004 va gemini-embedding-001.
        Tra ve list vector (hoac None neu loi).
        """
        if not texts or not client:
            return [None] * len(texts)

        for model_name in ("text-embedding-004", "gemini-embedding-001"):
            try:
                res = client.models.embed_content(
                    model=model_name,
                    contents=texts,
                )
                if hasattr(res, "embeddings") and res.embeddings:
                    return [list(e.values) for e in res.embeddings]
            except Exception as e:
                self._log(
                    f"[Suggester] Embedding model {model_name} khong kha dung: {str(e)}"
                )
                continue
        return [None] * len(texts)

    def add_examples(self, items, api_key=None):
        """
        Luu hoac cap nhat cac dong da sua vao kho vi du (bao gom loai_source, element, anim, bgm, sfx).
        Neu trung `text` thi cap nhat, neu moi thi them vao.
        """
        raw = self._load_examples_raw()
        by_text = {str(ex.get("text", "")).strip().lower(): ex for ex in raw}

        client = None
        if api_key and api_key.strip():
            try:
                client = genai.Client(api_key=api_key.strip())
            except Exception:
                client = None

        valid_items = []
        for it in items:
            txt = str(it.get("text", "")).strip()
            loai = self.sanitize_loai_source(it.get("loai_source", ""))
            el = self.sanitize_element(it.get("element", "auto"))
            anim = self.sanitize_anim(it.get("anim", "auto"))
            bgm = self.sanitize_bgm(it.get("bgm", "auto"))
            sfx = self.sanitize_sfx(it.get("sfx", "auto"))
            if not txt or not loai:
                continue
            valid_items.append(
                {
                    "text": txt,
                    "loai_source": loai,
                    "element": el,
                    "anim": anim,
                    "bgm": bgm,
                    "sfx": sfx,
                    "thoi_ky": str(it.get("thoi_ky", "")).strip(),
                    "note": str(it.get("note", "")).strip(),
                }
            )

        if not valid_items:
            return {"added": 0, "updated": 0, "total": len(raw)}

        embeddings = self._embed_texts(client, [x["text"] for x in valid_items])

        added = 0
        updated = 0
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

        next_id = max([int(ex.get("id", 0)) for ex in raw] + [0]) + 1

        for item, emb in zip(valid_items, embeddings):
            key = item["text"].lower()
            if key in by_text:
                existing = by_text[key]
                existing["loai_source"] = item["loai_source"]
                existing["element"] = item["element"]
                existing["anim"] = item["anim"]
                existing["bgm"] = item["bgm"]
                existing["sfx"] = item["sfx"]
                existing["thoi_ky"] = item["thoi_ky"]
                if item["note"]:
                    existing["note"] = item["note"]
                if emb:
                    existing["embedding"] = emb
                existing["created_at"] = now_str
                updated += 1
            else:
                new_ex = {
                    "id": next_id,
                    "text": item["text"],
                    "loai_source": item["loai_source"],
                    "element": item["element"],
                    "anim": item["anim"],
                    "bgm": item["bgm"],
                    "sfx": item["sfx"],
                    "thoi_ky": item["thoi_ky"],
                    "note": item["note"],
                    "embedding": emb,
                    "created_at": now_str,
                }
                next_id += 1
                raw.append(new_ex)
                by_text[key] = new_ex
                added += 1

        self._save_examples_raw(raw)
        self._log(
            f"[Suggester] Kho vi du: +{added} moi, ~{updated} cap nhat (tong: {len(raw)})"
        )
        return {"added": added, "updated": updated, "total": len(raw)}

    def delete_example(self, example_id):
        """Xoa 1 vi du khoi kho theo id."""
        raw = self._load_examples_raw()
        before = len(raw)
        raw = [ex for ex in raw if str(ex.get("id")) != str(example_id)]
        self._save_examples_raw(raw)
        return {"deleted": before - len(raw), "total": len(raw)}

    def clear_examples(self):
        """Xoa toan bo kho vi du."""
        self._save_examples_raw([])
        return {"total": 0}

    # ------------------------------------------------------------------
    # 3. Cosine Similarity & Retrieval (RAG)
    # ------------------------------------------------------------------

    @staticmethod
    def _cosine_sim(v1, v2):
        """Tinh cosine similarity giua 2 vector."""
        if not v1 or not v2 or len(v1) != len(v2):
            return 0.0
        dot = sum(a * b for a, b in zip(v1, v2))
        n1 = math.sqrt(sum(a * a for a in v1))
        n2 = math.sqrt(sum(b * b for b in v2))
        if n1 == 0 or n2 == 0:
            return 0.0
        return dot / (n1 * n2)

    @staticmethod
    def _word_overlap_sim(t1, t2):
        """Fallback similarity dua tren tu vung khi khong co vector embedding."""
        w1 = set(re.findall(r"\w+", (t1 or "").lower()))
        w2 = set(re.findall(r"\w+", (t2 or "").lower()))
        if not w1 or not w2:
            return 0.0
        return len(w1 & w2) / math.sqrt(len(w1) * len(w2))

    def _retrieve_similar_examples(self, query_text, query_emb, examples, top_k=6):
        """Tim top_k vi du giong nhat voi query_text."""
        if not examples:
            return []
        scored = []
        for ex in examples:
            ex_emb = ex.get("embedding")
            if query_emb and ex_emb:
                sim = self._cosine_sim(query_emb, ex_emb)
            else:
                sim = self._word_overlap_sim(query_text, ex.get("text", ""))
            scored.append((sim, ex))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:top_k]]

    # ------------------------------------------------------------------
    # 4. Sanitize & Validate loai_source, element, anim, bgm, sfx
    # ------------------------------------------------------------------

    def sanitize_loai_source(self, raw_val):
        """
        Dam bao loai_source chi chua toi da 2 ma hop le trong bang Phan loai Source,
        ngan cach boi ' + '. Neu khong co ma hop le nao -> fallback 'rai_1'.
        """
        loai_dict, _, _, _, _ = self._get_dynamic_dicts()
        valid_set = set(loai_dict.keys()) | set(VALID_LOAI)
        default_code = next(iter(loai_dict.keys()), "rai_1")
        if not raw_val:
            return default_code
        parts = re.split(r"[+,;/|]+", str(raw_val))
        valid_parts = []
        for p in parts:
            code = p.strip().lower()
            if code in valid_set and code not in valid_parts:
                valid_parts.append(code)
            if len(valid_parts) >= 2:
                break
        return " + ".join(valid_parts) if valid_parts else default_code

    def sanitize_element(self, raw_val):
        """Dam bao element nam trong bang Phan loai Element. Fallback 'auto'."""
        _, element_dict, _, _, _ = self._get_dynamic_dicts()
        valid_set = set(element_dict.keys()) | set(VALID_ELEMENTS)
        if not raw_val:
            return "auto"
        val = str(raw_val).strip().lower()
        return val if val in valid_set else "auto"

    def sanitize_anim(self, raw_val):
        """Dam bao anim nam trong bang Phan loai Anim. Fallback 'auto'."""
        _, _, anim_dict, _, _ = self._get_dynamic_dicts()
        valid_set = set(anim_dict.keys()) | set(VALID_ANIMS)
        if not raw_val:
            return "auto"
        val = str(raw_val).strip().lower()
        return val if val in valid_set else "auto"

    def sanitize_bgm(self, raw_val):
        """Dam bao bgm nam trong bang Phan loai Sound nen. Fallback 'auto'."""
        _, _, _, bgm_dict, _ = self._get_dynamic_dicts()
        valid_set = set(bgm_dict.keys()) | set(VALID_BGMS)
        if not raw_val:
            return "auto"
        val = str(raw_val).strip().lower()
        return val if val in valid_set else "auto"

    def sanitize_sfx(self, raw_val):
        """Dam bao sfx nam trong bang Phan loai Sound Effect. Fallback 'auto'."""
        _, _, _, _, sfx_dict = self._get_dynamic_dicts()
        valid_set = set(sfx_dict.keys()) | set(VALID_SFXS)
        if not raw_val:
            return "auto"
        val = str(raw_val).strip().lower()
        return val if val in valid_set else "auto"

    # ------------------------------------------------------------------
    # 5. Doc & Xuat CSV
    # ------------------------------------------------------------------

    def load_timeline_csv(self, csv_path):
        """Doc file 1_CSV_Timeline.csv (hoac 2_CSV_PhanLoaiSource.csv), tra ve danh sach dong."""
        if not csv_path or not os.path.exists(csv_path):
            raise FileNotFoundError(f"Khong tim thay file CSV: {csv_path}")

        rows = []
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for idx, r in enumerate(reader):
                rows.append(
                    {
                        "row_index": idx,
                        "doan": str(r.get("doan", "")).strip(),
                        "cau": str(r.get("cau", "")).strip(),
                        "y": str(r.get("y", "")).strip(),
                        "start": str(r.get("start", "")).strip(),
                        "text": str(r.get("text", "")).strip(),
                        "loai_source": str(r.get("loai_source", "")).strip(),
                        "thoi_ky": str(r.get("thoi_ky", "")).strip(),
                        "element": str(r.get("element", "")).strip(),
                        "anim": str(r.get("anim", "")).strip(),
                        "bgm": str(r.get("bgm", "")).strip(),
                        "sfx": str(r.get("sfx", "")).strip(),
                    }
                )
        return rows

    def export_source_plan_csv(self, rows, output_path):
        """
        Xuat danh sach dong ra file 2_CSV_PhanLoaiSource.csv (UTF-8 BOM).
        Cot: doan, cau, y, loai_source, thoi_ky, element, anim, bgm, sfx.
        Neu element == 'auto' -> de trong '' trong CSV de Premiere XML Generator dung auto_map mac dinh.
        """
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        fieldnames = ["doan", "cau", "y", "loai_source", "thoi_ky", "element", "anim", "bgm", "sfx"]

        with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for r in rows:
                el_val = self.sanitize_element(r.get("element", "auto"))
                anim_val = self.sanitize_anim(r.get("anim", "auto"))
                bgm_val = self.sanitize_bgm(r.get("bgm", "auto"))
                sfx_val = self.sanitize_sfx(r.get("sfx", "auto"))
                out_row = {
                    "doan": str(r.get("doan", "")).strip(),
                    "cau": str(r.get("cau", "")).strip(),
                    "y": str(r.get("y", "")).strip(),
                    "loai_source": self.sanitize_loai_source(
                        r.get("loai_source", "rai_1")
                    ),
                    "thoi_ky": str(r.get("thoi_ky", "")).strip(),
                    "element": "" if el_val == "auto" else el_val,
                    "anim": anim_val,
                    "bgm": bgm_val,
                    "sfx": sfx_val,
                }
                writer.writerow(out_row)

        self._log(
            f"[Suggester] Da xuat {len(rows)} dong (kem element + anim + bgm + sfx) -> {output_path}"
        )
        return output_path

    # ------------------------------------------------------------------
    # 6. Goi Gemini de goi y loai_source + element + anim + bgm + sfx + thoi_ky
    # ------------------------------------------------------------------

    def suggest_from_timeline(self, timeline_rows, api_key, default_thoi_ky=""):
        """
        Phan tich danh sach dong timeline (doi tuong Time) va goi y:
        `loai_source`, `element`, `anim`, `bgm`, `sfx`, `thoi_ky`, `confidence`, `reason`.
        Su dung:
          1. Quy tac phong cach cua user (source_style_rules.txt)
          2. Kho vi du da luu (source_examples.json) + Gemini Embedding RAG
          3. 5 bang Phan loai dong (classifications.json)
        """
        if not api_key or not api_key.strip():
            raise ValueError(
                "Chua co Gemini API Key. Vui long nhap API Key trong tab Cai dat."
            )

        client = genai.Client(api_key=api_key.strip())
        rules_text = self.get_rules().strip()
        examples = self._load_examples_raw()
        loai_dict, element_dict, anim_dict, bgm_dict, sfx_dict = self._get_dynamic_dicts()

        # Dam bao cac vi du trong kho co embedding
        missing_emb_indices = [
            i for i, ex in enumerate(examples) if not ex.get("embedding")
        ]
        if missing_emb_indices:
            self._log(
                f"[Suggester] Dang tao embedding cho {len(missing_emb_indices)} vi du trong kho..."
            )
            texts_to_embed = [examples[i].get("text", "") for i in missing_emb_indices]
            new_embs = self._embed_texts(client, texts_to_embed)
            changed = False
            for idx_pos, emb in zip(missing_emb_indices, new_embs):
                if emb:
                    examples[idx_pos]["embedding"] = emb
                    changed = True
            if changed:
                self._save_examples_raw(examples)

        # Tao embedding cho cac dong timeline can goi y (neu kho vi du > 0)
        query_texts = [r.get("text", "") for r in timeline_rows]
        query_embs = (
            self._embed_texts(client, query_texts)
            if examples
            else [None] * len(timeline_rows)
        )

        loai_list_str = "\n".join([f"- `{k}`: {v}" for k, v in loai_dict.items()])
        element_list_str = "\n".join([f"- `{k}`: {v}" for k, v in element_dict.items()])
        anim_list_str = "\n".join([f"- `{k}`: {v}" for k, v in anim_dict.items()])
        bgm_list_str = "\n".join([f"- `{k}`: {v}" for k, v in bgm_dict.items()])
        sfx_list_str = "\n".join([f"- `{k}`: {v}" for k, v in sfx_dict.items()])

        prompt_parts = [
            "Bạn là trợ lý đạo diễn hình ảnh & âm thanh cho kênh phân tích bóng đá SofaZone (phong cách tư liệu hoài niệm / vintage).",
            "Mỗi dòng trong kịch bản là một đối tượng `Time` (Đoạn thời gian) gồm 6 thuộc tính: Voice (Lời thoại), Source Video (`loai_source`), Lớp phủ Design (`element`), Animation (`anim`), Sound nền (`bgm`) và Sound Effect (`sfx`).",
            "Nhiệm vụ của bạn là gán bộ 5 thông số (`loai_source`, `element`, `anim`, `bgm`, `sfx`) và `thoi_ky` cho từng dòng `Time` theo ĐÚNG tư duy của người dùng, tinh tế, tiết chế.",
            "",
            "=== 1A. BẢNG 1: PHÂN LOẠI SOURCE (`loai_source` — TẦNG VIDEO/ẢNH V1-V2) ===",
            loai_list_str,
            "Quy tắc `loai_source`: Chỉ chọn 1 mã (VD: `rai_1`) hoặc tối đa 2 mã ghép bằng dấu cộng (VD: `anh_thong_so + rai_1`) nằm trong bảng trên. Không bịa mã mới.",
            "",
            "=== 1B. BẢNG 2: LỚP PHỦ DESIGN (`element` — KHUNG/TEXTURE V3) ===",
            element_list_str,
            "Quy tắc `element`: Không lạm dụng khung viền ở mọi câu gây ngộp! Câu dẫn chuyện pha bóng bình thường nên để `none` hoặc `auto`. Chỉ bật khung/lớp phủ khi phù hợp với mô tả trong bảng trên và quy tắc của người dùng.",
            "",
            "=== 1C. BẢNG 3: PHÂN LOẠI ANIMATION (`anim` — CHUYỂN ĐỘNG TRONG ĐOẠN) ===",
            anim_list_str,
            "",
            "=== 1D. BẢNG 4: SOUND NỀN (`bgm` — NHẠC NỀN TRACK A2) ===",
            bgm_list_str,
            "Quy tắc `bgm` CỰC KỲ QUAN TRỌNG: Nhạc nền cần chạy LIỀN MẠCH xuyên suốt cả một Đoạn lớn (`doan`) hoặc chuỗi nhiều câu cùng tâm trạng! Các câu liên tiếp cùng 1 mạch cảm xúc BẮT BUỘC phải giữ CÙNG MỘT MÃ `bgm` (hệ thống sẽ tự động nối liền mạch các dòng liên tiếp có cùng mã `bgm` trên Track A2). Chỉ đổi mã `bgm` khi sang Đoạn mới (`doan`) hoặc có bước ngoặt cảm xúc rõ rệt.",
            "",
            "=== 1E. BẢNG 5: SOUND EFFECT (`sfx` — HIỆU ỨNG ÂM THANH TRACK A3) ===",
            sfx_list_str,
            "Quy tắc `sfx`: Tiết chế! Đa số câu dẫn chuyện bình thường nên để `none` hoặc `auto`. Chỉ đặt `sfx` điểm nhấn (như `camera_shutter`, `data_beep`, `crowd_cheer`, `whoosh`, `impact_boom`) ở đúng câu xuất hiện mặt báo, bảng số liệu, ăn mừng danh hiệu hoặc chuyển đoạn.",
        ]

        if rules_text:
            prompt_parts.extend(
                [
                    "",
                    "=== 2. QUY TẮC PHONG CÁCH RIÊNG CỦA NGƯỜI DÙNG (ƯU TIÊN TUÂN THỦ TUYỆT ĐỐI) ===",
                    rules_text,
                ]
            )
        else:
            prompt_parts.extend(
                [
                    "",
                    "=== 2. QUY TẮC PHONG CÁCH RIÊNG CỦA NGƯỜI DÙNG ===",
                    "(Người dùng chưa nhập quy tắc riêng — hãy chọn tiết chế, tinh tế dựa theo mô tả trong 5 Bảng Phân Loại ở mục 1A-1E).",
                ]
            )

        if default_thoi_ky and default_thoi_ky.strip():
            prompt_parts.extend(
                [
                    "",
                    f"=== GỢI Ý BỐI CẢNH / THỜI KỲ MẶC ĐỊNH: {default_thoi_ky.strip()} ===",
                    "Format cột `thoi_ky` thường là: `<Giải đấu/Năm> · <Đội bóng> / <Cầu thủ>` (ví dụ: `Euro 2008 · Tây Ban Nha / Xavi`).",
                ]
            )
        else:
            prompt_parts.extend(
                [
                    "",
                    "=== QUY TẮC CỘT `thoi_ky` ===",
                    "Format cột `thoi_ky`: `<Giải đấu hoặc Giai đoạn> · <Đội bóng> / <Cầu thủ>` (ví dụ: `Euro 2008 · Tây Ban Nha / Xavi`).",
                ]
            )

        if examples:
            prompt_parts.extend(
                [
                    "",
                    f"=== 3. CÁC VÍ DỤ THẬT NGƯỜI DÙNG ĐÃ CHỌN TRƯỚC ĐÂY (Tổng kho: {len(examples)} mẫu) ===",
                    "Hãy bắt chước sát cách chọn combo (loai_source + element + anim + bgm + sfx) của người dùng trong các ví dụ tương tự dưới đây:",
                ]
            )
            selected_map = {}
            for q_txt, q_emb in zip(query_texts, query_embs):
                top_ex = self._retrieve_similar_examples(
                    q_txt, q_emb, examples, top_k=3
                )
                for ex in top_ex:
                    selected_map[ex.get("text", "")] = ex
                if len(selected_map) >= 20:
                    break
            for ex in list(selected_map.values())[:20]:
                note_part = f" (Lý do: {ex['note']})" if ex.get("note") else ""
                tk_part = (
                    f' | thoi_ky: "{ex.get("thoi_ky", "")}"'
                    if ex.get("thoi_ky")
                    else ""
                )
                prompt_parts.append(
                    f'- Câu: "{ex.get("text", "")}" -> loai_source: `{ex.get("loai_source", "rai_1")}` | element: `{ex.get("element", "auto")}` | anim: `{ex.get("anim", "auto")}` | bgm: `{ex.get("bgm", "auto")}` | sfx: `{ex.get("sfx", "auto")}`{tk_part}{note_part}'
                )

        input_items = []
        for idx, r in enumerate(timeline_rows):
            item = {
                "row_index": idx,
                "doan": r.get("doan", ""),
                "cau": r.get("cau", ""),
                "y": r.get("y", ""),
                "text": r.get("text", ""),
            }
            if examples:
                nearest = self._retrieve_similar_examples(
                    r.get("text", ""), query_embs[idx], examples, top_k=2
                )
                if nearest:
                    item["similar_past_choices"] = [
                        {
                            "text": n.get("text", ""),
                            "loai_source": n.get("loai_source", "rai_1"),
                            "element": n.get("element", "auto"),
                            "anim": n.get("anim", "auto"),
                            "bgm": n.get("bgm", "auto"),
                            "sfx": n.get("sfx", "auto"),
                        }
                        for n in nearest
                    ]
            input_items.append(item)

        prompt_parts.extend(
            [
                "",
                "=== 4. DANH SÁCH ĐỐI TƯỢNG TIME (CÂU THOẠI) CẦN GÁN ===",
                json.dumps(input_items, ensure_ascii=False, indent=2),
                "",
                "=== YÊU CẦU ĐẦU RA (CHỈ TRẢ VỀ JSON HỢP LỆ) ===",
                "Trả về một mảng JSON (JSON array) có đúng số phần tử tương ứng với từng `row_index` ở trên.",
                "Mỗi phần tử có cấu trúc:",
                "{",
                '  "row_index": 0,',
                '  "loai_source": "rai_1",',
                '  "element": "auto",',
                '  "anim": "zoom_in",',
                '  "bgm": "bgm_default",',
                '  "sfx": "none",',
                '  "thoi_ky": "Euro 2008 · Tây Ban Nha / Xavi",',
                '  "confidence": 0.85,',
                '  "reason": "Giải thích ngắn gọn 1 câu vì sao chọn combo này"',
                "}",
                "CHỈ trả về JSON array, không giải thích gì thêm bên ngoài.",
            ]
        )

        full_prompt = "\n".join(prompt_parts)
        self._log(
            f"[Suggester] Dang goi Gemini 3.8 Flash cho {len(timeline_rows)} dong Time (kho vi du: {len(examples)})..."
        )

        config = types.GenerateContentConfig(
            temperature=0.15,
            max_output_tokens=16384,
            thinking_config=types.ThinkingConfig(thinking_budget=4096),
        )

        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=full_prompt,
            config=config,
        )
        usage = record_usage(
            api_key, response, feature="source_suggester", model="gemini-3.8-flash"
        )
        if usage:
            self._log(
                f"[Suggester] Token luot goi: {usage['total_tokens']:,} "
                f"(in={usage['prompt_tokens']:,}, out={usage['output_tokens']:,}, think={usage['thoughts_tokens']:,})"
            )

        raw_text = response.text or ""
        parsed_list = self._parse_json_array(raw_text)

        by_idx = {}
        for item in parsed_list:
            if isinstance(item, dict) and "row_index" in item:
                by_idx[int(item["row_index"])] = item

        results = []
        for idx, r in enumerate(timeline_rows):
            ai_item = by_idx.get(idx, {})
            loai = self.sanitize_loai_source(ai_item.get("loai_source", "rai_1"))
            element = self.sanitize_element(ai_item.get("element", "auto"))
            anim = self.sanitize_anim(ai_item.get("anim", "auto"))
            bgm = self.sanitize_bgm(ai_item.get("bgm", "auto"))
            sfx = self.sanitize_sfx(ai_item.get("sfx", "auto"))
            thoi_ky = str(ai_item.get("thoi_ky", default_thoi_ky or "")).strip()
            try:
                conf = float(ai_item.get("confidence", 0.75))
                conf = max(0.0, min(1.0, conf))
            except (ValueError, TypeError):
                conf = 0.75
            reason = str(ai_item.get("reason", "")).strip()

            results.append(
                {
                    "row_index": idx,
                    "doan": r.get("doan", ""),
                    "cau": r.get("cau", ""),
                    "y": r.get("y", ""),
                    "start": r.get("start", ""),
                    "text": r.get("text", ""),
                    "loai_source": loai,
                    "element": element,
                    "anim": anim,
                    "bgm": bgm,
                    "sfx": sfx,
                    "thoi_ky": thoi_ky,
                    "confidence": round(conf, 2),
                    "reason": reason,
                }
            )

        self._log(f"[Suggester] Hoan tat goi y {len(results)} dong Time!")
        return results

    @staticmethod
    def _parse_json_array(raw_text):
        """Trich xuat JSON array tu response text cua Gemini."""
        text = (raw_text or "").strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        try:
            data = json.loads(text)
            if isinstance(data, list):
                return data
            if (
                isinstance(data, dict)
                and "items" in data
                and isinstance(data["items"], list)
            ):
                return data["items"]
        except json.JSONDecodeError:
            pass

        match = re.search(r"\[[\s\S]*\]", text)
        if match:
            try:
                data = json.loads(match.group(0))
                if isinstance(data, list):
                    return data
            except json.JSONDecodeError:
                pass

        raise ValueError(f"Khong the phan tich JSON tu Gemini response: {text[:300]}")
