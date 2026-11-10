"""
Premiere XML Generator (Cong cu A — phan Premiere)
Sinh FCP XML (xmeml v4) tu:
  - 1_CSV_Timeline.csv    : moc thoi gian + loi thoai
  - 2_CSV_PhanLoaiSource.csv : loai source cho tung cau/y
  - catalog.csv           : kho clip da cat (clip_splitter.py)
  - Voice.srt             : phu de tu CapCut (thay the hoac bo sung timecode)
  - Voice.mp3/mp4         : file voice chinh

Output: file .xml -> import File > Import trong Premiere (bat ky phien ban)
Timeline: 1920x1080, 30fps
"""

import os
import re
import csv
import sys
import unicodedata
import xml.etree.ElementTree as ET
from urllib.parse import quote
from datetime import timedelta


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FPS = 30
SEQ_W, SEQ_H = 1920, 1080

MARKER_COLORS = {
    "doan": "Red",
    "cau": "Blue",
    "thieu_source": "Yellow",
}


def tc_to_frames(tc, fps=FPS):
    """
    Chuyen timecode nhieu dinh dang sang so frame.
    Ho tro: HH:MM:SS:FF, HH:MM:SS,mmm (srt), HH:MM:SS.mmm, so giay thuan
    """
    tc = str(tc).strip()
    # HH:MM:SS:FF
    m = re.match(r"^(\d+):(\d+):(\d+):(\d+)$", tc)
    if m:
        h, mi, s, f = int(m[1]), int(m[2]), int(m[3]), int(m[4])
        return (h * 3600 + mi * 60 + s) * fps + f

    # SRT: HH:MM:SS,mmm hoac HH:MM:SS.mmm
    m = re.match(r"^(\d+):(\d+):(\d+)[,.](\d+)$", tc)
    if m:
        h, mi, s, ms = int(m[1]), int(m[2]), int(m[3]), int(m[4])
        total_ms = (h * 3600 + mi * 60 + s) * 1000 + ms
        return int(round(total_ms * fps / 1000))

    # So giay thuan
    try:
        return int(round(float(tc) * fps))
    except ValueError:
        return 0


def frames_to_tc(frames, fps=FPS):
    """So frame → HH:MM:SS:FF"""
    ff = frames % fps
    total_s = frames // fps
    return f"{total_s // 3600:02d}:{(total_s % 3600) // 60:02d}:{total_s % 60:02d}:{ff:02d}"


def slugify_loose(text):
    """Bo dau, giu chu va so, khong doi hoa thuong → dung de khop catalog."""
    text = (text or "").replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^A-Za-z0-9]", "", text).lower()


def norm(s):
    """Chuan hoa: trim + slugify_loose, dung de so sanh catalog voi CSV."""
    return slugify_loose(str(s or ""))


def path_to_url(filepath):
    """Chuyen duong dan Windows sang file URL co encode dung cho Premiere."""
    # Chuan hoa dau gach cheo
    p = filepath.replace("\\", "/")
    # Encode ki tu dac biet (giu lai '/', ':', '-', '_', '.')
    p = quote(p, safe="/:.-_")
    return "file:///" + p.lstrip("/")


# ---------------------------------------------------------------------------
# Doc file dau vao
# ---------------------------------------------------------------------------


def read_csv(path, encoding="utf-8-sig"):
    """Doc CSV, tra ve list dict. Ho tro UTF-8 BOM (Excel)."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Khong tim thay: {path}")
    with open(path, "r", encoding=encoding, newline="") as f:
        return list(csv.DictReader(f))


def read_srt(path):
    """
    Doc file .srt, tra ve list dict:
      {index, start_frames, end_frames, start_tc, end_tc, text}
    """
    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        content = f.read()

    entries = []
    blocks = re.split(r"\n{2,}", content.strip())
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        idx_line = lines[0].strip()
        tc_line = lines[1].strip()
        text = " ".join(l.strip() for l in lines[2:])
        m = re.match(r"(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)", tc_line)
        if not m:
            continue
        entries.append(
            {
                "index": idx_line,
                "start_frames": tc_to_frames(m[1]),
                "end_frames": tc_to_frames(m[2]),
                "start_tc": m[1],
                "end_tc": m[2],
                "text": text,
            }
        )
    return entries


def read_catalog(catalog_path):
    """Doc catalog.csv tu clip_splitter, tra ve list dict va index nhanh."""
    rows = read_csv(catalog_path)
    return rows


def build_catalog_index(catalog_rows):
    """
    Tao index nhieu cap do:
      (norm_loai, norm_cau_thu, norm_doi_bong, norm_ky_nang) → list row
      (norm_loai, norm_cau_thu, norm_ky_nang)                → list row  (fallback)
      (norm_loai, norm_cau_thu)                              → list row  (fallback rong)
    """
    idx_full = {}
    idx_ct = {}  # (loai, cau_thu, ky_nang)
    idx_lo = {}  # (loai, cau_thu)
    for r in catalog_rows:
        nl = norm(r.get("loai"))
        nc = norm(r.get("cau_thu"))
        nd = norm(r.get("doi_bong"))
        nk = norm(r.get("ky_nang"))

        idx_full.setdefault((nl, nc, nd, nk), []).append(r)
        idx_ct.setdefault((nl, nc, nk), []).append(r)
        idx_lo.setdefault((nl, nc), []).append(r)

    return {"full": idx_full, "ct": idx_ct, "lo": idx_lo}


# ---------------------------------------------------------------------------
# Ghep Source cho tung cau thoai
# ---------------------------------------------------------------------------


def _extract_cau_thu_from_thoi_ky(thoi_ky):
    """
    Trich xuat ten cau thu tu cot thoi_ky dang tu do.
    VD: "Euro 2008 · Tây Ban Nha / Xavi" → "Xavi"
    """
    if not thoi_ky:
        return ""
    parts = re.split(r"[/·]", thoi_ky)
    parts = [p.strip() for p in parts if p.strip()]
    # Loai cac phan chi la nam, cum tu dia ly, giai dau thuong gap
    exclude = re.compile(
        r"^\d{4}$"  # nam (2008, 2012...)
        r"|giai|doan|bo ba"  # tu chung
        r"|tay\s*ban\s*nha|spain"  # Tay Ban Nha
        r"|barcelona|barca|catalun"  # Barcelona
        r"|man\s*city|manchester|chelsea"  # Premier League clubs
        r"|euro|la\s*liga|liga|champ|cup|ucl",  # giai dau
        re.I | re.UNICODE,
    )

    # Chuan hoa bo dau de so sanh
    def _strip_accents(s):
        s = s.replace("đ", "d").replace("Đ", "D")
        s = unicodedata.normalize("NFKD", s)
        return "".join(c for c in s if not unicodedata.combining(c))

    names = [p for p in parts if not exclude.search(_strip_accents(p)) and len(p) > 2]
    return names[-1] if names else ""


def pick_clips(
    loai_str,
    cau_thu_str,
    doi_bong_str,
    ky_goi_y,
    thoi_ky_str,
    duration_frames,
    catalog_idx,
    used_set,
    source_root,
):
    """Chon clip tu catalog. 4 cap do fallback: (loai+ct+ky_nang) -> (loai+ct) -> (loai) -> (bat ky)."""
    results = []
    remaining = duration_frames
    loai_list = [l.strip() for l in re.split(r"[+,;]", loai_str or "")]

    # Trich xuat ten cau thu tu thoi_ky - day la nguon dang tin cay nhat
    ct = _extract_cau_thu_from_thoi_ky(thoi_ky_str)
    ct_list = [ct] if ct else [""]

    # Ky nang hint tu loi thoai
    ky_map = {
        "kientao": "Assist",
        "assist": "Assist",
        "banthang": "Goal",
        "goal": "Goal",
        "skill": "Skill",
        "pass": "Pass",
        "anmung": "Celebrate",
        "celebrate": "Celebrate",
    }
    ky_hint = next((v for k, v in ky_map.items() if k in norm(ky_goi_y)), None)

    idx_lo = catalog_idx["lo"]  # (loai, ct) -> rows
    idx_ct = catalog_idx["ct"]  # (loai, ct, ky) -> rows

    def _get_candidates(loai, ct_val):
        """Tra ve list clip chua dung, theo thu tu uu tien."""
        rows = []
        # Cap 1: khop chinh xac loai + ct + ky nang hint
        if ky_hint:
            rows = [
                r
                for r in idx_ct.get((norm(loai), norm(ct_val), norm(ky_hint)), [])
                if r["ten_file"] not in used_set
            ]
        # Cap 2: loai + ct, bat ky ky nang
        if not rows:
            rows = [
                r
                for r in idx_lo.get((norm(loai), norm(ct_val)), [])
                if r["ten_file"] not in used_set
            ]
        # Cap 3: chi can dung loai, bo ct (last resort)
        if not rows:
            for key, rlist in idx_lo.items():
                if key[0] == norm(loai):
                    rows += [r for r in rlist if r["ten_file"] not in used_set]
        # Cap 4: bat ky clip nao con trong catalog (ultimate fallback)
        if not rows:
            for key, rlist in idx_lo.items():
                rows += [r for r in rlist if r["ten_file"] not in used_set]
        return rows

    for loai in loai_list:
        if remaining <= 0:
            break
        for ct_val in ct_list:
            if remaining <= 0:
                break
            for clip in _get_candidates(loai, ct_val):
                if remaining <= 0:
                    break
                dur_clip = int(round(float(clip.get("duration_s", 3)) * FPS))
                if dur_clip <= 0:
                    continue
                abs_path = os.path.join(
                    source_root, clip.get("loai", ""), clip["ten_file"]
                )
                if not os.path.exists(abs_path):
                    abs_path = os.path.join(source_root, clip["ten_file"])
                if not os.path.exists(abs_path):
                    # Scan toan bo source_root de tim file (ho tro thu muc con bat ky ten)
                    found_scan = None
                    for root_dir, dirs, files in os.walk(source_root):
                        if clip["ten_file"] in files:
                            found_scan = os.path.join(root_dir, clip["ten_file"])
                            break
                    if found_scan:
                        abs_path = found_scan
                    else:
                        # Giu nguyen abs_path du khong ton tai (XML van hop le, Premiere bao offline)
                        pass
                take = min(dur_clip, remaining)
                is_img = (
                    clip["ten_file"].lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))
                )
                results.append(
                    {
                        "path": abs_path,
                        "clip_in": 0,
                        "clip_out": take,
                        "duration": take,
                        "is_image": is_img,
                        "loai": clip.get("loai"),
                        "cau_thu": clip.get("cau_thu"),
                    }
                )
                used_set.add(clip["ten_file"])
                remaining -= take
    return results, duration_frames - remaining


# ---------------------------------------------------------------------------
# Sinh FCP XML — helpers
# ---------------------------------------------------------------------------


def _add_rate(parent, fps=FPS):
    rate = ET.SubElement(parent, "rate")
    ET.SubElement(rate, "timebase").text = str(fps)
    ET.SubElement(rate, "ntsc").text = "FALSE"


def _file_id(path):
    return "file-" + re.sub(r"[^A-Za-z0-9]", "_", os.path.basename(path))


def _make_file_element(parent, file_path, duration_frames, fps=FPS, is_audio=False):
    """
    Tao element <file> day du theo chuan Premiere FCP XML.
    Neu file_path da duoc reference truoc thi chi can id (Premiere tu tim).
    """
    fid = _file_id(file_path)
    f_el = ET.SubElement(parent, "file", id=fid)
    ET.SubElement(f_el, "name").text = os.path.basename(file_path)
    ET.SubElement(f_el, "pathurl").text = path_to_url(file_path)
    _add_rate(f_el, fps)
    ET.SubElement(f_el, "duration").text = str(duration_frames)

    # Media characteristics
    mc = ET.SubElement(f_el, "media")
    if not is_audio:
        vid = ET.SubElement(mc, "video")
        ET.SubElement(vid, "samplecharacteristics")
    aud = ET.SubElement(mc, "audio")
    ET.SubElement(aud, "samplecharacteristics")

    return f_el, fid


def _make_clip_item(
    clip_index,
    file_path,
    clip_in,
    clip_out,
    timeline_in,
    timeline_out,
    is_image=False,
    file_duration=None,
    fps=FPS,
    file_registered=None,
):
    """
    Tao <clipitem> cho FCP XML theo chuan Premiere.
    file_registered: set() chua cac fid da duoc khai bao day du,
                     neu da co roi thi chi them id ref (khong lap)
    """
    ci = ET.Element("clipitem", id=f"clipitem-{clip_index}")
    ET.SubElement(ci, "name").text = os.path.basename(file_path)
    ET.SubElement(ci, "enabled").text = "TRUE"
    ET.SubElement(ci, "duration").text = str(clip_out - clip_in)
    _add_rate(ci, fps)
    ET.SubElement(ci, "start").text = str(timeline_in)
    ET.SubElement(ci, "end").text = str(timeline_out)
    ET.SubElement(ci, "in").text = str(clip_in)
    ET.SubElement(ci, "out").text = str(clip_out)

    # file ref — lan dau thi khai bao day du, lan sau chi ref id
    fid = _file_id(file_path)
    if file_registered is not None and fid in file_registered:
        ET.SubElement(ci, "file", id=fid)
    else:
        dur = file_duration if file_duration is not None else (clip_out - clip_in)
        f_el = ET.SubElement(ci, "file", id=fid)
        ET.SubElement(f_el, "name").text = os.path.basename(file_path)
        ET.SubElement(f_el, "pathurl").text = path_to_url(file_path)
        _add_rate(f_el, fps)
        ET.SubElement(f_el, "duration").text = str(dur)
        # media block
        mc = ET.SubElement(f_el, "media")
        vid = ET.SubElement(mc, "video")
        sc_v = ET.SubElement(vid, "samplecharacteristics")
        _add_rate(sc_v, fps)
        ET.SubElement(sc_v, "width").text = str(SEQ_W)
        ET.SubElement(sc_v, "height").text = str(SEQ_H)
        if not is_image:
            # Video/audio files co audio track, image thi khong
            aud = ET.SubElement(mc, "audio")
            ET.SubElement(aud, "channelcount").text = "2"
        if file_registered is not None:
            file_registered.add(fid)

    if is_image:
        ET.SubElement(ci, "stillframe").text = "TRUE"
        ET.SubElement(ci, "stillframeissuewarning").text = "FALSE"

    return ci


def _load_element_map(element_map_path=None):
    """Doc element_map.json, tra ve (auto_map, elements_dict)."""
    if element_map_path and os.path.exists(element_map_path):
        map_path = element_map_path
    else:
        # Mac dinh: templates/element_map.json (cung cap voi project)
        map_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "templates",
            "element_map.json",
        )
    if not os.path.exists(map_path):
        return {}, {}
    import json

    with open(map_path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    auto_map = data.get("auto_map", {})
    # Remove _doc keys
    auto_map = {k: v for k, v in auto_map.items() if not k.startswith("_")}
    elements = data.get("elements", {})
    return auto_map, elements


def _load_anim_specs():
    """Doc bang phan loai Animation tu templates/classifications.json de ho tro ma anim tuy chinh."""
    cls_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "templates",
        "classifications.json",
    )
    specs = {
        "zoom_in": (100, 108),
        "zoom_out": (108, 100),
        "static": (100, 100),
    }
    if not os.path.exists(cls_path):
        return specs
    try:
        import json

        with open(cls_path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        for item in data.get("animation_types", []):
            if item.get("group") != "anim":
                continue
            code = str(item.get("code", "")).strip().lower()
            param = str(item.get("param", "")).strip()
            m = re.match(r"^(\d+)\s*(?:->|→|-|:)\s*(\d+)$", param)
            if code and m:
                specs[code] = (int(m.group(1)), int(m.group(2)))
    except Exception:
        pass
    return specs


def _resolve_element(loai_source, csv_element_value, auto_map, elements, element_dir):
    """
    Tra ve list element dicts cho mot cau/y.
    csv_element_value: gia tri tu cot 'element' trong CSV (co the la None/empty/none/ten_element/nhieu element cach + ).
    Tra ve: list of dict {path, track, scope, is_image, opacity} hoac [].
    """
    # Neu CSV ghi 'none' -> bo qua element
    csv_val = (csv_element_value or "").strip()
    if csv_val.lower() == "none":
        return []

    # Danh sach element ids can resolve
    element_ids = []
    if csv_val:
        # User chi dinh cu the: co the la nhieu element cach dau '+'
        element_ids = [e.strip() for e in csv_val.split("+") if e.strip()]
    else:
        # Auto-map: tim theo loai_source
        loai_list = [l.strip() for l in re.split(r"[+,;]", loai_source or "")]
        for loai in loai_list:
            mapped = auto_map.get(loai)
            if mapped:
                element_ids.append(mapped)

    results = []
    for eid in element_ids:
        el_def = elements.get(eid)
        if el_def is None:
            continue  # eid la 'none' hoac khong tim thay
        el_file = os.path.join(element_dir, el_def["file"]) if element_dir else ""
        results.append(
            {
                "element_id": eid,
                "path": el_file,
                "track": el_def.get("track", "V3"),
                "scope": el_def.get("scope", "clip"),
                "is_image": el_def.get("is_image", True),
                "opacity": el_def.get("opacity", 100),
            }
        )
    return results


# ---------------------------------------------------------------------------
# Animation helpers — Ken Burns zoom, opacity fade, transitions
# ---------------------------------------------------------------------------


def _add_scale_effect(ci_el, dur_frames, scale_start=100, scale_end=108):
    """Them hieu ung zoom (Ken Burns) vao clipitem qua motion scale keyframes.

    scale_start/scale_end: phan tram (100=binh thuong, 108=zoom in 8%).
    Alternate zoom-in vs zoom-out de tao cam giac dong.
    """
    if dur_frames <= 1:
        return
    filt = ET.SubElement(ci_el, "filter")
    effect = ET.SubElement(filt, "effect")
    ET.SubElement(effect, "name").text = "Basic Motion"
    ET.SubElement(effect, "effectid").text = "basic"
    ET.SubElement(effect, "effectcategory").text = "motion"
    ET.SubElement(effect, "effecttype").text = "motion"
    ET.SubElement(effect, "mediatype").text = "video"

    param = ET.SubElement(effect, "parameter", authoringApp="PremierePro")
    ET.SubElement(param, "parameterid").text = "scale"
    ET.SubElement(param, "name").text = "Scale"
    ET.SubElement(param, "valuemin").text = "0"
    ET.SubElement(param, "valuemax").text = "600"
    ET.SubElement(param, "value").text = str(scale_start)

    kf1 = ET.SubElement(param, "keyframe")
    ET.SubElement(kf1, "when").text = "0"
    ET.SubElement(kf1, "value").text = str(scale_start)

    kf2 = ET.SubElement(param, "keyframe")
    ET.SubElement(kf2, "when").text = str(dur_frames - 1)
    ET.SubElement(kf2, "value").text = str(scale_end)


def _add_opacity_fade_effect(
    ci_el, dur_frames, fade_in=10, fade_out=10, max_opacity=100
):
    """Them hieu ung fade in/out opacity qua keyframes.

    fade_in/fade_out: so frame de fade. Tu dong giam neu clip ngan.
    max_opacity: do trong suot toi da (100=hien het, 15=mo nhat).
    """
    if dur_frames <= 0:
        return
    fade_in = min(fade_in, max(dur_frames // 3, 1))
    fade_out = min(fade_out, max(dur_frames // 3, 1))

    filt = ET.SubElement(ci_el, "filter")
    effect = ET.SubElement(filt, "effect")
    ET.SubElement(effect, "name").text = "Opacity"
    ET.SubElement(effect, "effectid").text = "opacity"
    ET.SubElement(effect, "effectcategory").text = "motion"
    ET.SubElement(effect, "effecttype").text = "motion"
    ET.SubElement(effect, "mediatype").text = "video"

    param = ET.SubElement(effect, "parameter", authoringApp="PremierePro")
    ET.SubElement(param, "parameterid").text = "opacity"
    ET.SubElement(param, "name").text = "Opacity"
    ET.SubElement(param, "value").text = str(max_opacity)

    kf1 = ET.SubElement(param, "keyframe")
    ET.SubElement(kf1, "when").text = "0"
    ET.SubElement(kf1, "value").text = "0"

    kf2 = ET.SubElement(param, "keyframe")
    ET.SubElement(kf2, "when").text = str(fade_in)
    ET.SubElement(kf2, "value").text = str(max_opacity)

    if dur_frames > fade_in + fade_out + 2:
        kf3 = ET.SubElement(param, "keyframe")
        ET.SubElement(kf3, "when").text = str(dur_frames - fade_out)
        ET.SubElement(kf3, "value").text = str(max_opacity)

    kf4 = ET.SubElement(param, "keyframe")
    ET.SubElement(kf4, "when").text = str(dur_frames)
    ET.SubElement(kf4, "value").text = "0"


def _make_transition_el(
    trans_id,
    effect_name,
    effect_id,
    category,
    duration_frames,
    alignment="center",
    fps=FPS,
):
    """Tao element <transition> cho FCP XML (chen giua 2 clipitem trong 1 track)."""
    tr = ET.Element("transition", id=f"transition-{trans_id}")
    _add_rate(tr, fps)
    ET.SubElement(tr, "start").text = "0"
    ET.SubElement(tr, "end").text = str(duration_frames)
    ET.SubElement(tr, "alignment").text = alignment

    eff = ET.SubElement(tr, "effect")
    ET.SubElement(eff, "name").text = effect_name
    ET.SubElement(eff, "effectid").text = effect_id
    ET.SubElement(eff, "effectcategory").text = category
    ET.SubElement(eff, "effecttype").text = "transition"
    ET.SubElement(eff, "mediatype").text = "video"

    return tr


def _insert_transitions(track, doan_boundary_frames, transition_frames=15, fps=FPS):
    """Chen transitions vao track V1:
    - Dip to Black o dau video
    - Cross Dissolve giua cac clip trong cung doan
    - Dip to Black o ranh gioi doan (section boundary)
    - Dip to Black o cuoi video
    Tra ve so transition da them.
    """
    clipitems = [child for child in track if child.tag == "clipitem"]
    if not clipitems:
        return 0

    # Xoa clipitems khoi track (giu lai enabled, locked)
    for ci in clipitems:
        track.remove(ci)

    # Xac dinh ranh gioi doan: clip bat dau tai frame nao?
    boundary_set = set(doan_boundary_frames or [])
    trans_count = 0

    for i, ci in enumerate(clipitems):
        ci_start = int(ci.find("start").text or "0")

        if i == 0:
            # Dip to Black fade-in o dau video
            tr = _make_transition_el(
                f"auto_{trans_count}",
                "Dip to Black",
                "Dip to Black",
                "Dissolve",
                transition_frames,
                "start-black",
                fps,
            )
            track.append(tr)
            trans_count += 1
        elif ci_start in boundary_set:
            # Dip to Black o ranh gioi doan
            tr = _make_transition_el(
                f"auto_{trans_count}",
                "Dip to Black",
                "Dip to Black",
                "Dissolve",
                transition_frames,
                "end-black",
                fps,
            )
            track.append(tr)
            trans_count += 1
            # Va fade in cho doan moi
            tr2 = _make_transition_el(
                f"auto_{trans_count}",
                "Dip to Black",
                "Dip to Black",
                "Dissolve",
                transition_frames,
                "start-black",
                fps,
            )
            # Se duoc chen truoc clip tiep theo
        else:
            # Cross Dissolve giua 2 clip cung doan
            tr = _make_transition_el(
                f"auto_{trans_count}",
                "Cross Dissolve",
                "CrossDissolve",
                "Dissolve",
                transition_frames,
                "center",
                fps,
            )
            track.append(tr)
            trans_count += 1

        track.append(ci)

    # Dip to Black fade-out o cuoi video
    tr = _make_transition_el(
        f"auto_{trans_count}",
        "Dip to Black",
        "Dip to Black",
        "Dissolve",
        transition_frames,
        "end-black",
        fps,
    )
    track.append(tr)
    trans_count += 1

    return trans_count


def generate_xml(
    timeline_csv,
    source_plan_csv,
    catalog_csv,
    voice_path,
    source_root,
    output_path,
    srt_path=None,
    element_dir=None,
    texture_id=None,
    enable_animations=True,
    fps=FPS,
    log=print,
):
    """
    Tao FCP XML tu cac file dau vao.
    - timeline_csv    : duong dan toi 1_CSV_Timeline.csv
    - source_plan_csv : duong dan toi 2_CSV_PhanLoaiSource.csv
    - catalog_csv     : duong dan toi catalog.csv (tu clip_splitter)
    - voice_path      : file mp3/mp4 voice chinh
    - source_root     : thu muc goc chua cac clip (cha cua cac thu muc loai)
    - output_path     : duong dan file .xml xuat ra
    - srt_path        : file .srt (tuy chon, dung de lay timecode chinh xac)
    - element_dir     : thu muc chua Element/Overlay files (tuy chon)
    - texture_id      : element_id cho texture full-video tren V4 (tuy chon, vd: 'paper_texture')
    - enable_animations: True de them Ken Burns zoom, opacity fade, transitions (mac dinh True)
    """
    log("[A] Doc cac file dau vao...")
    tl_rows = read_csv(timeline_csv)
    sp_rows = read_csv(source_plan_csv)
    cat_rows = read_csv(catalog_csv)
    srt_entries = read_srt(srt_path) if srt_path and os.path.exists(srt_path) else []

    cat_idx = build_catalog_index(cat_rows)
    used_set = set()

    # Load element map (neu co element_dir) va anim_specs (tu classifications.json)
    auto_map, elements = {}, {}
    anim_specs = _load_anim_specs()
    if element_dir:
        auto_map, elements = _load_element_map()
        log(
            f"[A] Element dir: {element_dir}, {len(elements)} element definitions loaded"
        )

    # Build source plan index: (doan, cau, y) → row
    def norm_y(v):
        v = str(v or "").strip()
        try:
            f = float(v)
            return "" if f == 0 else f"{f}"
        except ValueError:
            return v

    sp_idx = {}
    for r in sp_rows:
        doan_k = str(r.get("doan", "")).strip().lstrip("0") or "0"
        cau_k = str(r.get("cau", "")).strip()
        y_k = norm_y(r.get("y", ""))
        key = (doan_k, cau_k, y_k)
        sp_idx[key] = r

        if not r.get("cau_thu") and r.get("thoi_ky"):
            tk = r["thoi_ky"]
            m = re.search(r"/\s*([^/·]+)$", tk)
            if m:
                r["_cau_thu_hint"] = m.group(1).strip()
            m2 = re.search(r"·\s*([^·/]+)\s*/", tk)
            if m2:
                r["_doi_bong_hint"] = m2.group(1).strip()

    # Build SRT index
    srt_text_idx = {}
    for e in srt_entries:
        srt_text_idx[norm(e["text"])] = e

    # ---------------------------------------------------------------------------
    # Tinh timecode tung dong tu CSV hoac SRT
    # ---------------------------------------------------------------------------
    total_frames = 0
    if srt_entries:
        total_frames = srt_entries[-1]["end_frames"]
    elif tl_rows:
        last_start = max(tc_to_frames(r.get("start", "0"), fps) for r in tl_rows)
        total_frames = last_start + fps * 5

    tl_with_frames = []
    for i, row in enumerate(tl_rows):
        tc_raw = row.get("start", "")
        f = tc_to_frames(tc_raw, fps) if tc_raw else 0

        if srt_entries and row.get("text"):
            key = norm(row["text"])
            if key in srt_text_idx:
                f = srt_text_idx[key]["start_frames"]

        end_f = total_frames
        if i + 1 < len(tl_rows):
            next_tc = tl_rows[i + 1].get("start", "")
            end_f = tc_to_frames(next_tc, fps) if next_tc else f + fps * 3
        tl_with_frames.append({**row, "_start_f": f, "_end_f": end_f})

    # ---------------------------------------------------------------------------
    # Tao cau truc XML theo chuan Premiere FCP XML
    # ---------------------------------------------------------------------------
    root = ET.Element("xmeml", version="4")
    seq = ET.SubElement(root, "sequence", id="sequence-1")
    ET.SubElement(seq, "name").text = "AE_AI_Premiere_Timeline"
    ET.SubElement(seq, "ismasterclip").text = "FALSE"
    ET.SubElement(seq, "duration").text = str(total_frames)
    _add_rate(seq, fps)

    # Timecode bat dau
    tc_el = ET.SubElement(seq, "timecode")
    _add_rate(tc_el, fps)
    ET.SubElement(tc_el, "string").text = "00:00:00:00"
    ET.SubElement(tc_el, "frame").text = "0"
    ET.SubElement(tc_el, "displayformat").text = "NDF"

    media = ET.SubElement(seq, "media")

    # --- VIDEO ---
    video_el = ET.SubElement(media, "video")
    fmt = ET.SubElement(video_el, "format")
    sc = ET.SubElement(fmt, "samplecharacteristics")
    _add_rate(sc, fps)
    ET.SubElement(sc, "width").text = str(SEQ_W)
    ET.SubElement(sc, "height").text = str(SEQ_H)
    ET.SubElement(sc, "anamorphic").text = "FALSE"
    ET.SubElement(sc, "pixelaspectratio").text = "Square"
    ET.SubElement(sc, "fielddominance").text = "None"

    track_v1 = ET.SubElement(video_el, "track")
    ET.SubElement(track_v1, "enabled").text = "TRUE"
    ET.SubElement(track_v1, "locked").text = "FALSE"

    track_v2 = ET.SubElement(video_el, "track")
    ET.SubElement(track_v2, "enabled").text = "TRUE"
    ET.SubElement(track_v2, "locked").text = "FALSE"

    # Track V3: Element overlays (per-clip) — chi tao khi co element_dir
    track_v3 = None
    track_v4 = None
    if element_dir:
        track_v3 = ET.SubElement(video_el, "track")
        ET.SubElement(track_v3, "enabled").text = "TRUE"
        ET.SubElement(track_v3, "locked").text = "FALSE"

        # Track V4: Full-video texture/grain
        track_v4 = ET.SubElement(video_el, "track")
        ET.SubElement(track_v4, "enabled").text = "TRUE"
        ET.SubElement(track_v4, "locked").text = "FALSE"

    # --- AUDIO ---
    audio_el = ET.SubElement(media, "audio")
    a_fmt = ET.SubElement(audio_el, "format")
    a_sc = ET.SubElement(a_fmt, "samplecharacteristics")
    ET.SubElement(a_sc, "depth").text = "16"
    ET.SubElement(a_sc, "samplerate").text = "48000"

    track_a1 = ET.SubElement(audio_el, "track")
    ET.SubElement(track_a1, "enabled").text = "TRUE"
    ET.SubElement(track_a1, "locked").text = "FALSE"
    ET.SubElement(track_a1, "outputlevel").text = "0"

    # --- Voice tren A1 ---
    file_registered = set()
    voice_ci = ET.SubElement(track_a1, "clipitem", id="clipitem-voice")
    ET.SubElement(voice_ci, "name").text = os.path.basename(voice_path)
    ET.SubElement(voice_ci, "enabled").text = "TRUE"
    ET.SubElement(voice_ci, "duration").text = str(total_frames)
    _add_rate(voice_ci, fps)
    ET.SubElement(voice_ci, "start").text = "0"
    ET.SubElement(voice_ci, "end").text = str(total_frames)
    ET.SubElement(voice_ci, "in").text = "0"
    ET.SubElement(voice_ci, "out").text = str(total_frames)

    voice_fid = _file_id(voice_path)
    voice_file = ET.SubElement(voice_ci, "file", id=voice_fid)
    ET.SubElement(voice_file, "name").text = os.path.basename(voice_path)
    ET.SubElement(voice_file, "pathurl").text = path_to_url(voice_path)
    _add_rate(voice_file, fps)
    ET.SubElement(voice_file, "duration").text = str(total_frames)
    voice_mc = ET.SubElement(voice_file, "media")
    # Video track trong media (Premiere yeu cau cho mp4)
    voice_vid = ET.SubElement(voice_mc, "video")
    voice_vid_sc = ET.SubElement(voice_vid, "samplecharacteristics")
    _add_rate(voice_vid_sc, fps)
    ET.SubElement(voice_vid_sc, "width").text = str(SEQ_W)
    ET.SubElement(voice_vid_sc, "height").text = str(SEQ_H)
    voice_aud = ET.SubElement(voice_mc, "audio")
    ET.SubElement(voice_aud, "channelcount").text = "2"
    file_registered.add(voice_fid)

    # Stereo link
    ET.SubElement(voice_ci, "channelcount").text = "2"

    # ---------------------------------------------------------------------------
    # Xu ly tung dong trong timeline CSV
    # ---------------------------------------------------------------------------
    clip_index = 1
    element_count = 0
    missing = []

    prev_doan = None
    markers_list = []  # (frame, comment)

    for row in tl_with_frames:
        doan = str(row.get("doan", "")).strip().lstrip("0") or "0"
        cau = str(row.get("cau", "")).strip()
        y = norm_y(row.get("y", ""))
        text = row.get("text", "")
        f_in = row["_start_f"]
        f_out = row["_end_f"]
        dur = max(f_out - f_in, 1)

        # Marker theo doan
        if doan != prev_doan:
            markers_list.append((f_in, f_in, f"DOAN {doan}"))
            prev_doan = doan

        # Tim source plan
        sp = (
            sp_idx.get((doan, cau, y))
            or sp_idx.get((doan, cau, ""))
            or sp_idx.get((doan, "", ""))
        )

        if sp is None:
            missing.append(f"D{doan}C{cau}Y{y}: khong co source plan")
            continue

        loai_str = sp.get("loai_source", "")
        cau_thu_str = sp.get("cau_thu", "") or sp.get("_cau_thu_hint", "")
        doi_bong_str = (
            sp.get("doi_bong", "")
            or sp.get("_doi_bong_hint", "")
            or sp.get("thoi_ky", "")
        )
        goi_y = sp.get("goi_y", "") + " " + text
        thoi_ky_str = sp.get("thoi_ky", "")

        clips, filled = pick_clips(
            loai_str,
            cau_thu_str,
            doi_bong_str,
            goi_y,
            thoi_ky_str,
            dur,
            cat_idx,
            used_set,
            source_root,
        )

        if not clips:
            markers_list.append(
                (f_in, f_out, f"[THIEU SOURCE] D{doan}C{cau} — {text[:40]}")
            )
            missing.append(f"D{doan}C{cau}Y{y}: khong co clip phu hop ({loai_str})")
            # Van dat element overlay du thieu source clips
        else:
            cursor = f_in
            for c_idx, clip in enumerate(clips):
                tl_start = cursor
                tl_end = cursor + clip["duration"]
                track = track_v1 if c_idx == 0 else track_v2

                # dur cua clip goc (neu biet)
                clip_file_dur = clip["clip_out"]

                ci = _make_clip_item(
                    clip_index,
                    clip["path"],
                    clip["clip_in"],
                    clip["clip_out"],
                    tl_start,
                    tl_end,
                    is_image=clip["is_image"],
                    file_duration=clip_file_dur,
                    fps=fps,
                    file_registered=file_registered,
                )
                # Animation: Ken Burns zoom (doc tu cot 'anim' trong CSV + bang phan loai classifications.json)
                csv_anim_val = (sp.get("anim", "") or "auto").strip().lower()
                if enable_animations and csv_anim_val not in ("static", "none"):
                    if csv_anim_val in anim_specs:
                        s_start, s_end = anim_specs[csv_anim_val]
                        if s_start != s_end:
                            _add_scale_effect(ci, clip["duration"], s_start, s_end)
                    elif not clip["is_image"]:
                        # Che do auto mac dinh: xen ke zoom-in va zoom-out
                        if clip_index % 2 == 0:
                            _add_scale_effect(ci, clip["duration"], 100, 108)
                        else:
                            _add_scale_effect(ci, clip["duration"], 108, 100)
                track.append(ci)
                clip_index += 1
                cursor = tl_end

        # --- Element overlays tren V3 (per-clip) ---
        if element_dir and track_v3 is not None:
            csv_element_val = sp.get("element", "").strip()
            if csv_element_val.lower() == "auto":
                csv_element_val = ""
            el_items = _resolve_element(
                loai_str, csv_element_val, auto_map, elements, element_dir
            )
            for el in el_items:
                # Neu user chi dinh truc tiep trong CSV (vd film_grain cho doan hoi uc), van cho phep dat tren V3 theo clip
                if el["scope"] != "clip" and not csv_element_val:
                    continue  # full-scope xu ly rieng ben duoi khi khong phai per-row override
                el_dur = dur  # cung duration voi cau thoai
                ci = _make_clip_item(
                    clip_index,
                    el["path"],
                    0,
                    el_dur,
                    f_in,
                    f_out,
                    is_image=el["is_image"],
                    file_duration=el_dur,
                    fps=fps,
                    file_registered=file_registered,
                )
                # Animation: fade in/out cho element overlay
                if enable_animations:
                    _add_opacity_fade_effect(
                        ci,
                        el_dur,
                        fade_in=10,
                        fade_out=10,
                        max_opacity=el.get("opacity", 100),
                    )
                elif el.get("opacity", 100) < 100:
                    # Static opacity (backward compatible khi tat animation)
                    filt = ET.SubElement(ci, "filter")
                    filt_effect = ET.SubElement(filt, "effect")
                    ET.SubElement(filt_effect, "name").text = "Opacity"
                    ET.SubElement(filt_effect, "effectid").text = "opacity"
                    ET.SubElement(filt_effect, "effectcategory").text = "motion"
                    ET.SubElement(filt_effect, "effecttype").text = "motion"
                    ET.SubElement(filt_effect, "mediatype").text = "video"
                    param = ET.SubElement(
                        filt_effect, "parameter", authoringApp="PremierePro"
                    )
                    ET.SubElement(param, "parameterid").text = "opacity"
                    ET.SubElement(param, "name").text = "Opacity"
                    ET.SubElement(param, "value").text = str(el["opacity"])
                track_v3.append(ci)
                clip_index += 1
                element_count += 1

    # --- Full-video texture/grain tren V4 ---
    if element_dir and track_v4 is not None and texture_id:
        tex_ids = [t.strip() for t in texture_id.split("+") if t.strip()]
        for tid in tex_ids:
            tex_def = elements.get(tid)
            if tex_def is None:
                log(f"[A] WARN: texture_id '{tid}' khong tim thay trong element_map")
                continue
            tex_path = os.path.join(element_dir, tex_def["file"])
            tex_is_img = tex_def.get("is_image", True)
            tex_opacity = tex_def.get("opacity", 15)
            ci = _make_clip_item(
                clip_index,
                tex_path,
                0,
                total_frames,
                0,
                total_frames,
                is_image=tex_is_img,
                file_duration=total_frames,
                fps=fps,
                file_registered=file_registered,
            )
            # Opacity filter
            if tex_opacity < 100:
                filt = ET.SubElement(ci, "filter")
                filt_effect = ET.SubElement(filt, "effect")
                ET.SubElement(filt_effect, "name").text = "Opacity"
                ET.SubElement(filt_effect, "effectid").text = "opacity"
                ET.SubElement(filt_effect, "effectcategory").text = "motion"
                ET.SubElement(filt_effect, "effecttype").text = "motion"
                ET.SubElement(filt_effect, "mediatype").text = "video"
                param = ET.SubElement(
                    filt_effect, "parameter", authoringApp="PremierePro"
                )
                ET.SubElement(param, "parameterid").text = "opacity"
                ET.SubElement(param, "name").text = "Opacity"
                ET.SubElement(param, "value").text = str(tex_opacity)
            track_v4.append(ci)
            clip_index += 1
            element_count += 1
            log(f"[A] Texture '{tid}' ({tex_def['file']}) → V4, opacity={tex_opacity}%")

    # --- Animation: Transitions tren V1 ---
    transition_count = 0
    if enable_animations:
        # Thu thap cac frame bat dau cua moi doan de lam ranh gioi
        doan_boundary_frames = [
            fr for (fr, _, comment) in markers_list if comment.startswith("DOAN ")
        ]
        transition_count = _insert_transitions(
            track_v1, doan_boundary_frames, transition_frames=15, fps=fps
        )
        if transition_count > 0:
            log(f"[A] Transitions: {transition_count} transition(s) da chen vao V1")

    # --- Markers ---
    markers_el = ET.SubElement(seq, "markers")
    for m_in, m_out, comment in markers_list:
        mk = ET.SubElement(markers_el, "marker")
        ET.SubElement(mk, "comment").text = comment
        ET.SubElement(mk, "name").text = comment[:20]
        ET.SubElement(mk, "in").text = str(m_in)
        ET.SubElement(mk, "out").text = str(m_out)

    # ---------------------------------------------------------------------------
    # Ghi file XML
    # ---------------------------------------------------------------------------
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write("<!DOCTYPE xmeml>\n")
        tree.write(f, encoding="unicode")

    log(f"[A] Da ghi XML: {output_path}")
    if element_count > 0:
        log(f"[A] Element overlays: {element_count} element(s) da dat vao V3/V4")
    if missing:
        log(f"[A] CANH BAO — {len(missing)} cau thieu source:")
        for m in missing[:10]:
            log(f"    {m}")
    anim_log = ""
    if enable_animations:
        anim_log = f", animations=ON (zoom+fade+{transition_count} transitions)"
        log(f"[A] Animation: Ken Burns zoom tren V1/V2, fade in/out tren V3{anim_log}")
    return {
        "output": output_path,
        "missing": missing,
        "total_clips": clip_index - 1,
        "total_elements": element_count,
        "total_transitions": transition_count,
        "animations_enabled": enable_animations,
    }


# ---------------------------------------------------------------------------
# CLI thu nhanh
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--timeline", required=True)
    p.add_argument("--source_plan", required=True)
    p.add_argument("--catalog", required=True)
    p.add_argument("--voice", required=True)
    p.add_argument("--source_root", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--srt", default=None)
    p.add_argument("--element_dir", default=None)
    p.add_argument("--texture_id", default=None)
    p.add_argument(
        "--no-animations",
        action="store_true",
        help="Tat animation (zoom, fade, transition)",
    )
    args = p.parse_args()

    res = generate_xml(
        timeline_csv=args.timeline,
        source_plan_csv=args.source_plan,
        catalog_csv=args.catalog,
        voice_path=args.voice,
        source_root=args.source_root,
        output_path=args.output,
        srt_path=args.srt,
        element_dir=args.element_dir,
        texture_id=args.texture_id,
        enable_animations=not getattr(args, "no_animations", False),
        log=print,
    )
    print(
        f"Xong: {res['total_clips']} clip, {res.get('total_elements', 0)} elements, "
        f"{res.get('total_transitions', 0)} transitions, {len(res['missing'])} thieu source, "
        f"animations={'ON' if res.get('animations_enabled') else 'OFF'}"
    )
