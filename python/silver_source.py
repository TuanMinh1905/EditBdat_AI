"""Doc va phan tich cac file CSV giai doan Silver Source (3_YeuCauSource & 3_DoiChieuDoBaoPhu)."""

import csv
import os
import re


def _open_csv_text(csv_path):
    """Mo file CSV voi fallback encoding an toan cho Windows/UTF-8 BOM."""
    for enc in ("utf-8-sig", "utf-8", "cp1258", "cp1252"):
        try:
            with open(csv_path, "r", encoding=enc, newline="") as f:
                return f.read()
        except UnicodeDecodeError:
            continue
    with open(csv_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        return f.read()


def load_csv_rows(csv_path):
    """Doc mot file CSV (ho tro o nhieu dong, UTF-8 BOM) va tra ve headers + rows."""
    if not csv_path or not os.path.isfile(csv_path):
        raise FileNotFoundError(f"Không tìm thấy file CSV: {csv_path}")

    raw_text = _open_csv_text(csv_path)
    lines = raw_text.splitlines(keepends=True)
    reader = csv.DictReader(lines)
    raw_headers = reader.fieldnames or []
    headers = [str(h).lstrip("\ufeff").strip() for h in raw_headers if h is not None and str(h).strip()]

    rows = []
    for idx, raw_row in enumerate(reader, start=1):
        clean_row = {}
        for k, v in raw_row.items():
            if k is None:
                continue
            key = str(k).lstrip("\ufeff").strip()
            if not key:
                continue
            clean_row[key] = "" if v is None else str(v)
        clean_row["_row_num"] = idx
        rows.append(clean_row)

    return {
        "path": csv_path,
        "headers": headers,
        "rows": rows,
        "total": len(rows),
    }


def scan_silver_folder(folder_path):
    """Tu dong tim 3_YeuCauSource.csv va 3_DoiChieuDoBaoPhu.csv trong mot thu muc."""
    if not folder_path or not os.path.isdir(folder_path):
        raise FileNotFoundError(f"Không tìm thấy thư mục: {folder_path}")

    entries = []
    for name in sorted(os.listdir(folder_path)):
        full = os.path.join(folder_path, name)
        if os.path.isfile(full) and name.lower().endswith(".csv"):
            entries.append((name, name.lower(), full))

    req_path = ""
    cov_path = ""

    for _, low, full in entries:
        if low == "3_yeucausource.csv":
            req_path = full
            break
    if not req_path:
        for _, low, full in entries:
            if "yeucausource" in low:
                req_path = full
                break

    for _, low, full in entries:
        if low == "3_doichieudobaophu.csv":
            cov_path = full
            break
    if not cov_path:
        for _, low, full in entries:
            if "doichieu" in low or "dobaophu" in low:
                cov_path = full
                break

    return {"req_path": req_path, "cov_path": cov_path}


def parse_request_ids(raw_value):
    """Tach chuoi request_ids (vd: 'SR_008 | SR_009') thanh danh sach ma duy nhat."""
    if not raw_value:
        return []
    parts = re.split(r"[|,;\s]+", str(raw_value).strip())
    result = []
    seen = set()
    for part in parts:
        token = part.strip()
        if not token or token in seen:
            continue
        seen.add(token)
        result.append(token)
    return result


def _count_by(rows, field, default_label="(Trống)"):
    counts = {}
    for row in rows:
        val = str(row.get(field) or "").strip() or default_label
        counts[val] = counts.get(val, 0) + 1
    return counts


def _sort_doan_values(rows):
    vals = {str(r.get("doan") or "").strip() for r in rows if str(r.get("doan") or "").strip()}
    def sort_key(val):
        try:
            return (0, int(val), val)
        except ValueError:
            return (1, 0, val)
    return sorted(vals, key=sort_key)


def load_silver_bundle(req_csv="", cov_csv="", folder_path=""):
    """Nap dong bo hai file Silver Source (Yeu cau + Doi chieu) va tinh thong ke."""
    req_path = str(req_csv or "").strip()
    cov_path = str(cov_csv or "").strip()
    folder = str(folder_path or "").strip()
    warnings = []

    if folder:
        found = scan_silver_folder(folder)
        if not req_path:
            req_path = found["req_path"]
        if not cov_path:
            cov_path = found["cov_path"]
        if not req_path and not cov_path:
            raise ValueError(
                f"Không tìm thấy 3_YeuCauSource.csv hoặc 3_DoiChieuDoBaoPhu.csv trong thư mục: {folder}"
            )
        if not req_path:
            warnings.append("Chưa thấy file 3_YeuCauSource.csv trong thư mục đã chọn.")
        if not cov_path:
            warnings.append("Chưa thấy file 3_DoiChieuDoBaoPhu.csv trong thư mục đã chọn.")

    if not req_path and not cov_path:
        raise ValueError("Vui lòng chọn ít nhất một file CSV Silver Source (3_YeuCauSource.csv hoặc 3_DoiChieuDoBaoPhu.csv).")

    requests = []
    req_headers = []
    if req_path:
        req_data = load_csv_rows(req_path)
        req_headers = req_data["headers"]
        requests = req_data["rows"]

    coverage = []
    cov_headers = []
    if cov_path:
        cov_data = load_csv_rows(cov_path)
        cov_headers = cov_data["headers"]
        coverage = cov_data["rows"]
        for row in coverage:
            row["linked_request_ids"] = parse_request_ids(row.get("request_ids", ""))

    # Dem so dong timeline doi chieu gan voi moi SR_xxx
    req_coverage_counts = {}
    for row in coverage:
        for rid in row.get("linked_request_ids", []):
            req_coverage_counts[rid] = req_coverage_counts.get(rid, 0) + 1
    for row in requests:
        rid = str(row.get("request_id") or "").strip()
        row["linked_coverage_count"] = req_coverage_counts.get(rid, 0)

    stats = {
        "total_requests": len(requests),
        "by_priority": _count_by(requests, "muc_uu_tien"),
        "by_req_source_type": _count_by(requests, "ma_loai_source"),
        "total_coverage": len(coverage),
        "by_step3_status": _count_by(coverage, "trang_thai_buoc_3"),
        "by_step2_status": _count_by(coverage, "analysis_status_buoc_2"),
        "by_cov_source_type": _count_by(coverage, "ma_loai_source"),
        "doan_list": _sort_doan_values(coverage),
    }

    return {
        "success": True,
        "req_path": req_path,
        "cov_path": cov_path,
        "req_headers": req_headers,
        "cov_headers": cov_headers,
        "requests": requests,
        "coverage": coverage,
        "stats": stats,
        "warnings": warnings,
    }
