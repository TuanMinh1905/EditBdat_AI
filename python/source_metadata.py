"""Source taxonomy v2 and filename-declared historical context.

No footage recognition: the filename is the source of catalog metadata.
Legacy rows are adapted in memory; their physical paths are preserved.
"""
import os
import re
import unicodedata

SCHEMA_VERSION = "2"
CONTEXT_FIELDS = ("cau_thu", "doi_bong", "thoi_diem", "su_kien")
PLAN_META_FIELDS = (*CONTEXT_FIELDS, "context_locked", "context_scope", "allow_rai_2", "schema_version")
SOURCE_TYPES = [
    {"code": "rai_1_1", "label": "Highlight · Bàn thắng", "description": "Highlight bàn thắng, khớp lời thoại về ghi bàn."},
    {"code": "rai_1_2", "label": "Highlight · Kiến tạo", "description": "Highlight kiến tạo, khớp lời thoại về tạo bàn thắng."},
    {"code": "rai_1_3", "label": "Highlight · Chung", "description": "Highlight chung: kỹ thuật, xử lý bóng, sút phạt, penalty; dùng theo ý câu thoại."},
    {"code": "rai_2", "label": "Rải bối cảnh", "description": "Đường hầm, bước ra sân, ăn mừng hoặc tri ân CĐV, ăn mừng cùng đồng đội. Xen vào đoạn dẫn chuyện/chuyển ý khi phù hợp."},
]
OTHER_CODES = ("phong_van", "training", "binh_luan_chay", "khan_dai", "anh_thong_so", "anh_thoi_diem", "anh_chung_bao", "sa_ban")
VALID_CODES = tuple(x["code"] for x in SOURCE_TYPES) + OTHER_CODES
LEGACY_CODES = ("rai_1", "rai_2", "rai_2_1", "rai_2_2", "rai_3", "rai_4")


def migrate_classifications(data):
    if str(data.get("schema_version", "")) == SCHEMA_VERSION:
        return data
    old = {x["code"]: x for x in data.get("source_types", [])}
    sources = []
    for item in SOURCE_TYPES:
        preserved = old.get(item["code"], {}) if item["code"] != "rai_2" else old.get("rai_4", {})
        sources.append({**preserved, **item})
    sources.extend(x for code, x in old.items() if code not in LEGACY_CODES and not code.startswith("rai_1_"))
    return {**data, "schema_version": SCHEMA_VERSION, "source_types": sources}


def norm(value):
    value = unicodedata.normalize("NFKD", str(value or "").replace("đ", "d").replace("Đ", "D"))
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in value.lower() if not unicodedata.combining(c)))


def year_bounds(value):
    """Recognize a year/range/event-year, never a sequence number/timecode."""
    value = re.sub(r"\s+", "", str(value or ""))
    if not re.fullmatch(r"[^\W\d_]*(?:19|20)\d{2}(?:[-–](?:19|20)\d{2})?", value, re.UNICODE):
        return None
    years = re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)", str(value or ""))
    if not 1 <= len(years) <= 2:
        return None
    start, end = int(years[0]), int(years[-1])
    return (start, end) if start <= end else None


def temporal_token(value):
    # Canonical filename token: preserve ranges instead of slugifying away '-'.
    value = str(value or "").strip()
    return re.sub(r"[^A-Za-z0-9-]", "", unicodedata.normalize("NFKD", value))


def event_from_time(value):
    if not year_bounds(value):
        return ""
    return re.sub(r"[\d\s./_-]", "", str(value or ""))


def migrate_code(code, version="", action=""):
    parts = [p.strip() for p in str(code or "").split("+") if p.strip()]
    result = []
    for part in parts:
        if str(version) != SCHEMA_VERSION:
            if part == "rai_4":
                part = "rai_2"
            elif part in LEGACY_CODES:
                skill = norm(action)
                part = "rai_1_1" if skill in ("goal", "banthang", "score") else "rai_1_2" if skill in ("assist", "kientao") else "rai_1_3"
        if part != "rai_1" and part not in result:
            result.append(part)
    return " + ".join(result)


def parse_source_filename(filename, extra_codes=()):
    stem = os.path.splitext(os.path.basename(str(filename).replace("\\", "/")))[0]
    parts = stem.split("_")
    codes = set(VALID_CODES) | set(LEGACY_CODES) | set(extra_codes) | {"chua_phan_loai"}
    code, consumed = "chua_phan_loai", 0
    for count in range(min(max(len(c.split('_')) for c in codes), len(parts)), 0, -1):
        candidate = norm("_".join(parts[:count]))
        found = next((c for c in sorted(codes) if norm(c) == candidate), None)
        if found:
            code, consumed = found, count
            break
    rest = parts[consumed:] if consumed else []
    tail = rest[2:]
    if len(tail) > 1 and tail[-1].isdigit():
        tail = tail[:-1]  # STT may grow past 999; it is never a historical year.
    time_value = next((x for x in tail if year_bounds(x)), "")
    action = next((x for x in tail if not year_bounds(x) and not x.isdigit() and x.lower() != "unknown"), "Mixed")
    action = {"goal": "Goal", "banthang": "Goal", "assist": "Assist", "kientao": "Assist", "skill": "Skill", "celebrate": "Celebrate", "anmung": "Celebrate"}.get(norm(action), action)
    # rai_2 without a temporal token is ambiguous: retain the legacy meaning.
    version = SCHEMA_VERSION if code.startswith("rai_1_") or (code == "rai_2" and (time_value or any(x.lower() == "unknown" for x in tail))) else "1"
    return {"loai": migrate_code(code, version, action),
            "cau_thu": rest[0] if rest else "", "doi_bong": rest[1] if len(rest) > 1 else "",
            "ky_nang": action, "thoi_diem": time_value, "su_kien": event_from_time(time_value),
            "schema_version": SCHEMA_VERSION, "legacy_loai": code if version == "1" and code in LEGACY_CODES else ""}


def legacy_context(value):
    """Compatibility with '<event/year> · <team> / <player>' plans."""
    value = str(value or "").strip()
    time_text = re.split(r"[·/]", value)[0].strip()
    # A descriptive period without a year stays unresolved.
    time_value = temporal_token(time_text) if year_bounds(time_text) else ""
    player = value.rsplit("/", 1)[-1].strip() if "/" in value else ""
    team = value.split("·", 1)[1].split("/", 1)[0].strip() if "·" in value else ""
    return {"cau_thu": player, "doi_bong": team, "thoi_diem": time_value, "su_kien": event_from_time(time_value)}


def context_of(row):
    # In v2 a blank is intentional; never revive stale legacy display text.
    context = {} if str(row.get("schema_version", "")) == SCHEMA_VERSION else legacy_context(row.get("thoi_ky"))
    for key in CONTEXT_FIELDS:
        if key in row:
            context[key] = str(row.get(key) or "").strip()
    context["su_kien"] = context.get("su_kien") or event_from_time(context.get("thoi_diem"))
    return {k: context.get(k, "") for k in CONTEXT_FIELDS}


def context_label(row):
    context = context_of(row)
    return " · ".join(context[k] for k in ("thoi_diem", "doi_bong") if context[k]) + (" / " + context["cau_thu"] if context["cau_thu"] else "")


def normalize_plan_row(row):
    result = dict(row)
    result.update(context_of(row))
    result["loai_source"] = migrate_code(row.get("loai_source"), row.get("schema_version"), row.get("ky_nang"))
    result["schema_version"] = SCHEMA_VERSION
    result["thoi_ky"] = context_label(result)
    result.setdefault("allow_rai_2", "yes")
    return result


def normalize_catalog_row(row):
    result = dict(row)
    old_code = row.get("loai", "")
    parsed = parse_source_filename(row.get("video_nguon") or row.get("ten_file", ""))
    version = row.get("schema_version", "")
    if not version and not parsed["legacy_loai"] and parsed["loai"] == old_code:
        version = SCHEMA_VERSION
    result["loai"] = migrate_code(old_code, version, row.get("ky_nang") or parsed["ky_nang"])
    for key in ("thoi_diem", "su_kien"):
        result[key] = row.get(key, parsed[key])
    result["source_relpath"] = row.get("source_relpath") or os.path.join(old_code, row.get("ten_file", ""))
    result["legacy_loai"] = row.get("legacy_loai") or (old_code if old_code != result["loai"] else "")
    result["schema_version"] = SCHEMA_VERSION
    return result


def entity_key(value, team=False):
    key = norm(value)
    aliases = {"taybannha": "spain", "tbn": "spain", "espana": "spain", "barca": "barcelona", "fcbarcelona": "barcelona"} if team else {"xavihernandez": "xavi", "andresiniesta": "iniesta", "sergiobusquets": "busquets", "busi": "busquets"}
    return aliases.get(key, key)


def matches_context(clip, request):
    """All declared constraints are hard; a broad mixed period cannot prove a specific year."""
    for key in ("cau_thu", "doi_bong"):
        wanted = request.get(key)
        if wanted and entity_key(wanted, key == "doi_bong") != entity_key(clip.get(key), key == "doi_bong"):
            return False
    wanted_time = str(request.get("thoi_diem") or "").strip()
    if wanted_time:
        requested, actual = year_bounds(wanted_time), year_bounds(clip.get("thoi_diem"))
        if not requested or not actual or not (requested[0] <= actual[0] <= actual[1] <= requested[1]):
            return False
    event = request.get("su_kien") or event_from_time(wanted_time)
    actual_event = clip.get("su_kien") or event_from_time(clip.get("thoi_diem"))
    return not event or norm(event) == norm(actual_event)
