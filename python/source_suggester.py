"""
Source Suggester (Cong cu 1 — Goi y phan loai Source + Element + Animation theo phong cach ca nhan)
Su dung Gemini Embedding (RAG few-shot) + Gemini 3.8 Flash + Rule Set co dinh
de goi y cot `loai_source`, `element`, `anim` va `thoi_ky` tu file `1_CSV_Timeline.csv`,
xuat ra `2_CSV_PhanLoaiSource.csv`.
"""

import os
import re
import csv
import json
import math
from datetime import datetime
from google import genai
from google.genai import types
from token_tracker import record_usage


VALID_LOAI = [
    "rai_1",
    "rai_2_1",
    "rai_2_2",
    "rai_3",
    "rai_4",
    "phong_van",
    "training",
    "binh_luan_chay",
    "khan_dai",
    "anh_thong_so",
    "anh_thoi_diem",
    "anh_chung_bao",
    "sa_ban",
]

LOAI_DESCRIPTIONS = {
    "rai_1": "Video rải đơn (1 clip full màn hình) — cảnh thi đấu, pha bóng, dẫn chuyện chung",
    "rai_2_1": "Video rải đôi kiểu 1 (2 clip chia đôi màn hình)",
    "rai_2_2": "Video rải đôi kiểu 2 (2 clip bố cục phụ)",
    "rai_3": "Video rải 3 clip cùng lúc",
    "rai_4": "Video rải 4 clip / tổng hợp danh hiệu, kết quả, cao trào nhiều góc",
    "phong_van": "Cảnh phỏng vấn cầu thủ / HLV nói chuyện",
    "training": "Cảnh tập luyện trên sân tập",
    "binh_luan_chay": "Cảnh bình luận viên / chuyên gia đang nói",
    "khan_dai": "Cảnh cổ động viên, khán đài, bầu không khí sân vận động",
    "anh_thong_so": "Ảnh bảng thống kê, số liệu, biểu đồ so sánh",
    "anh_thoi_diem": "Ảnh chụp khoảnh khắc / đội hình / tin tức tại một thời điểm cụ thể",
    "anh_chung_bao": "Ảnh mặt báo, tiêu đề báo chí truyền thông",
    "sa_ban": "Sa bàn chiến thuật, sơ đồ đội hình",
}

VALID_ELEMENTS = [
    "auto",
    "none",
    "tv_retro",
    "tv_sony",
    "tv_dolly",
    "film_grain",
    "scout_frame",
    "stats_table",
    "stats_table_1",
    "stats_table_2",
    "circle_gold",
    "circle_blue",
    "paper_texture",
    "paper_texture_2",
    "texture_dark",
    "grid_orange",
]

ELEMENT_DESCRIPTIONS = {
    "auto": "Tự động theo loại Source (phong_van->tv_retro, anh_thong_so->stats_table, anh_thoi_diem->scout_frame, còn lại không phủ)",
    "none": "Không dùng lớp phủ khung/texture ở câu này (để hình gốc thoáng mắt)",
    "tv_retro": "Khung SOFA TV cổ điển (bo góc tối + màn hình CRT) — hợp cho ảnh đội hình, khoảnh khắc đáng nhớ, phỏng vấn",
    "tv_sony": "Khung TV Sony cổ điển trên bàn gỗ",
    "tv_dolly": "Hiệu ứng TV retro dolly-in",
    "film_grain": "Khung phim nhựa 8mm cổ điển (có lỗ cuốn phim bên cạnh) — rất hợp khi kể về thời niên thiếu, quá khứ xa, hồi ức",
    "scout_frame": "Khung hồ sơ tuyển trạch / tin tức cầu thủ (scout frame)",
    "stats_table": "Khung bảng thống kê / so sánh số liệu",
    "stats_table_1": "Bảng thống kê mẫu 1",
    "stats_table_2": "Bảng thống kê mẫu 2",
    "circle_gold": "Vòng tròn spotlight vàng (nhấn mạnh cầu thủ / danh hiệu Quả bóng vàng)",
    "circle_blue": "Vòng tròn spotlight xanh dương (đánh dấu vị trí cầu thủ)",
    "paper_texture": "Lớp phủ giấy cũ (paper texture) tạo chất liệu tư liệu",
    "paper_texture_2": "Lớp phủ giấy cũ mẫu 2",
    "texture_dark": "Lớp phủ tối (dark vignette/texture) tạo chiều sâu trầm lắng, chuyển chương",
    "grid_orange": "Nền lưới cam chuyển động (grid animation)",
}

VALID_ANIMS = [
    "auto",
    "zoom_in",
    "zoom_out",
    "static",
]

ANIM_DESCRIPTIONS = {
    "auto": "Mặc định (tự động xen kẽ zoom nhẹ)",
    "zoom_in": "Zoom In từ từ (100% -> 108%) — tập trung dần vào nhân vật/bức ảnh",
    "zoom_out": "Zoom Out từ từ (108% -> 100%) — mở rộng góc nhìn toàn cảnh",
    "static": "Đứng yên (100%) — không zoom",
}


class SourceSuggester:
    """Quan ly quy tac phong cach, kho vi du (RAG embedding) va goi AI goi y Source + Element + Anim."""

    def __init__(self, base_dir=None, log=None):
        """Khoi tao SourceSuggester voi duong dan luu tru trong templates/."""
        if base_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.base_dir = base_dir
        self.templates_dir = os.path.join(self.base_dir, "templates")
        os.makedirs(self.templates_dir, exist_ok=True)

        self.rules_path = os.path.join(self.templates_dir, "source_style_rules.txt")
        self.examples_path = os.path.join(self.templates_dir, "source_examples.json")
        self._log = log or (lambda msg: print(msg, flush=True))

        # Dam bao file ton tai
        if not os.path.exists(self.rules_path):
            with open(self.rules_path, "w", encoding="utf-8") as f:
                f.write("")
        if not os.path.exists(self.examples_path):
            with open(self.examples_path, "w", encoding="utf-8") as f:
                f.write("[]\n")

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
        Luu hoac cap nhat cac dong da sua vao kho vi du (bao gom loai_source, element, anim).
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
            if not txt or not loai:
                continue
            valid_items.append(
                {
                    "text": txt,
                    "loai_source": loai,
                    "element": el,
                    "anim": anim,
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
    # 4. Sanitize & Validate loai_source, element, anim
    # ------------------------------------------------------------------

    @staticmethod
    def sanitize_loai_source(raw_val):
        """
        Dam bao loai_source chi chua toi da 2 ma hop le trong VALID_LOAI,
        ngan cach boi ' + '. Neu khong co ma hop le nao -> fallback 'rai_1'.
        """
        if not raw_val:
            return "rai_1"
        parts = re.split(r"[+,;/|]+", str(raw_val))
        valid_parts = []
        for p in parts:
            code = p.strip().lower()
            if code in VALID_LOAI and code not in valid_parts:
                valid_parts.append(code)
            if len(valid_parts) >= 2:
                break
        return " + ".join(valid_parts) if valid_parts else "rai_1"

    @staticmethod
    def sanitize_element(raw_val):
        """Dam bao element nam trong VALID_ELEMENTS. Fallback 'auto'."""
        if not raw_val:
            return "auto"
        val = str(raw_val).strip().lower()
        return val if val in VALID_ELEMENTS else "auto"

    @staticmethod
    def sanitize_anim(raw_val):
        """Dam bao anim nam trong VALID_ANIMS. Fallback 'auto'."""
        if not raw_val:
            return "auto"
        val = str(raw_val).strip().lower()
        return val if val in VALID_ANIMS else "auto"

    # ------------------------------------------------------------------
    # 5. Doc & Xuat CSV
    # ------------------------------------------------------------------

    def load_timeline_csv(self, csv_path):
        """Doc file 1_CSV_Timeline.csv, tra ve danh sach dong."""
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
                    }
                )
        return rows

    def export_source_plan_csv(self, rows, output_path):
        """
        Xuat danh sach dong ra file 2_CSV_PhanLoaiSource.csv (UTF-8 BOM).
        Cot: doan, cau, y, loai_source, thoi_ky, element, anim.
        Neu element == 'auto' -> de trong '' trong CSV de Premiere XML Generator dung auto_map mac dinh.
        """
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        fieldnames = ["doan", "cau", "y", "loai_source", "thoi_ky", "element", "anim"]

        with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for r in rows:
                el_val = self.sanitize_element(r.get("element", "auto"))
                anim_val = self.sanitize_anim(r.get("anim", "auto"))
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
                }
                writer.writerow(out_row)

        self._log(
            f"[Suggester] Da xuat {len(rows)} dong (kem element + anim) -> {output_path}"
        )
        return output_path

    # ------------------------------------------------------------------
    # 6. Goi Gemini de goi y loai_source + element + anim + thoi_ky
    # ------------------------------------------------------------------

    def suggest_from_timeline(self, timeline_rows, api_key, default_thoi_ky=""):
        """
        Phan tich danh sach dong timeline va goi y:
        `loai_source`, `element`, `anim`, `thoi_ky`, `confidence`, `reason`.
        Su dung:
          1. Quy tac phong cach cua user (source_style_rules.txt)
          2. Kho vi du da luu (source_examples.json) + Gemini Embedding RAG
          3. Danh sach co dinh VALID_LOAI, VALID_ELEMENTS, VALID_ANIMS
        """
        if not api_key or not api_key.strip():
            raise ValueError(
                "Chua co Gemini API Key. Vui long nhap API Key trong tab Cai dat."
            )

        client = genai.Client(api_key=api_key.strip())
        rules_text = self.get_rules().strip()
        examples = self._load_examples_raw()

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

        loai_list_str = "\n".join(
            [f"- `{k}`: {v}" for k, v in LOAI_DESCRIPTIONS.items()]
        )
        element_list_str = "\n".join(
            [f"- `{k}`: {v}" for k, v in ELEMENT_DESCRIPTIONS.items()]
        )
        anim_list_str = "\n".join(
            [f"- `{k}`: {v}" for k, v in ANIM_DESCRIPTIONS.items()]
        )

        prompt_parts = [
            "Bạn là trợ lý đạo diễn hình ảnh cho kênh phân tích bóng đá SofaZone (phong cách tư liệu hoài niệm / vintage).",
            "Nhiệm vụ của bạn là gán bộ 3 thông số (`loai_source`, `element`, `anim`) và `thoi_ky` cho từng câu thoại theo ĐÚNG tư duy của người dùng, KHÔNG tự ý làm màu mè rối mắt.",
            "",
            "=== 1A. DANH SÁCH MÃ `loai_source` HỢP LỆ (TẦNG VIDEO/ẢNH V1-V2) ===",
            loai_list_str,
            "Quy tắc `loai_source`: Chỉ chọn 1 mã (VD: `rai_1`) hoặc tối đa 2 mã ghép bằng dấu cộng (VD: `anh_thong_so + rai_1`). Không bịa mã mới.",
            "",
            "=== 1B. DANH SÁCH MÃ `element` HỢP LỆ (LỚP PHỦ KHUNG/TEXTURE V3) ===",
            element_list_str,
            "Quy tắc `element`: Không lạm dụng khung viền ở mọi câu gây ngộp! Câu dẫn chuyện pha bóng bình thường nên để `none` hoặc `auto`. Chỉ bật `tv_retro`, `film_grain`, `scout_frame`, `stats_table`... khi câu thoại thực sự nhấn mạnh điểm chuyển thời kỳ, hồi ức thời niên thiếu, ảnh chụp đội hình, phỏng vấn hoặc bảng số liệu.",
            "",
            "=== 1C. DANH SÁCH MÃ `anim` HỢP LỆ (CHUYỂN ĐỘNG ZOOM) ===",
            anim_list_str,
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
                    "(Người dùng chưa nhập quy tắc riêng — hãy chọn tiết chế, tinh tế: câu dẫn chuyện bình thường dùng `loai_source: rai_1`, `element: none` hoặc `auto`, `anim: auto`; câu hồi ức thời trẻ dùng `element: film_grain`; câu giới thiệu ảnh đội hình/khoảnh khắc dùng `element: tv_retro` kèm `anim: zoom_in`; câu có số liệu thống kê dùng `loai_source: anh_thong_so`, `element: stats_table`).",
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
                    "Hãy bắt chước sát cách chọn combo (loai_source + element + anim) của người dùng trong các ví dụ tương tự dưới đây:",
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
                    f'- Câu: "{ex.get("text", "")}" -> loai_source: `{ex.get("loai_source", "rai_1")}` | element: `{ex.get("element", "auto")}` | anim: `{ex.get("anim", "auto")}`{tk_part}{note_part}'
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
                        }
                        for n in nearest
                    ]
            input_items.append(item)

        prompt_parts.extend(
            [
                "",
                "=== 4. DANH SÁCH CÂU THOẠI CẦN GÁN SOURCE & ANIMATION ===",
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
                '  "thoi_ky": "Euro 2008 · Tây Ban Nha / Xavi",',
                '  "confidence": 0.85,',
                '  "reason": "Giải thích ngắn gọn 1 câu vì sao chọn combo Source + Element + Anim này"',
                "}",
                "CHỈ trả về JSON array, không giải thích gì thêm bên ngoài.",
            ]
        )

        full_prompt = "\n".join(prompt_parts)
        self._log(
            f"[Suggester] Dang goi Gemini 3.8 Flash cho {len(timeline_rows)} dong (kho vi du: {len(examples)})..."
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
        usage = record_usage(api_key, response, feature="source_suggester", model="gemini-3.8-flash")
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
                    "thoi_ky": thoi_ky,
                    "confidence": round(conf, 2),
                    "reason": reason,
                }
            )

        self._log(f"[Suggester] Hoan tat goi y {len(results)} dong!")
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
