"""
Clip Splitter (Cong cu B) — Cat video highlight thanh cac Element nho.
Pipeline: FFmpeg scene detect → loc/gop → cat tung cut (bo am thanh) → thumbnail → catalog.csv

Catalog fields (4 thuoc tinh chinh):
  loai      : rai_1_1 | rai_1_2 | rai_1_3 | rai_2 | phong_van | training |
               binh_luan_chay | khan_dai | anh_thong_so | anh_thoi_diem |
               anh_chung_bao | sa_ban | chua_phan_loai
  cau_thu   : Xavi | Iniesta | Busquets | ...
  doi_bong  : Barcelona | Spain | ManCity | Chelsea | ...
  ky_nang   : Skill | Goal | Assist | Pass | Tackle | Celebrate | Mixed

Ten file: {loai}_{cau_thu}_{doi_bong}_{ky_nang}_{STT:03d}.mp4
Vi du  : rai_1_3_Xavi_Barcelona_2010_Skill_007.mp4

Hai cach dau vao:
  Cach 1 — Dat ten file nguon theo mau: rai1_Xavi_Barcelona_Skill.mp4
  Cach 2 — Truyen 4 tham so khi goi split()
"""

import os
import re
import csv
import sys
import json
import shutil
import subprocess
import unicodedata

NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)

from source_metadata import (VALID_CODES, SCHEMA_VERSION, parse_source_filename,
                             normalize_catalog_row, temporal_token, event_from_time, year_bounds)

VALID_LOAI = list(VALID_CODES) + ['chua_phan_loai']


def get_valid_loai():
    """Doc danh sach loai hop le (ket hop VALID_LOAI mac dinh + classifications.json)."""
    valid = set(VALID_LOAI)
    try:
        cls_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'templates',
            'classifications.json',
        )
        if os.path.exists(cls_path):
            with open(cls_path, 'r', encoding='utf-8-sig') as f:
                data = json.load(f)
            for item in data.get('source_types', []):
                c = str(item.get('code', '')).strip().lower()
                if re.fullmatch(r'[a-z0-9_]+', c) and c not in ("rai_1", "rai_2_1", "rai_2_2", "rai_3", "rai_4"):
                    valid.add(c)
    except Exception:
        pass
    return valid

CATALOG_FIELDS = [
    'ten_file', 'loai', 'cau_thu', 'doi_bong', 'ky_nang', 'stt',
    'video_nguon', 'start_s', 'end_s', 'duration_s',
    'start_tc', 'end_tc', 'fps', 'ghi_chu',
    'thoi_diem', 'su_kien', 'schema_version', 'source_relpath', 'legacy_loai'
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(text):
    """Bo dau tieng Viet, ky tu la → ten file an toan cho Premiere/Windows."""
    if not text:
        return 'NA'
    text = text.replace('đ', 'd').replace('Đ', 'D')
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r'[^A-Za-z0-9_]+', '', text)
    return text or 'NA'


def seconds_to_tc(seconds, fps):
    """Giay → timecode HH:MM:SS:FF (30fps)."""
    fps_i = int(round(fps))
    total_frames = int(round(seconds * fps))
    ff = total_frames % fps_i
    total_s = total_frames // fps_i
    return f"{total_s // 3600:02d}:{(total_s % 3600) // 60:02d}:{total_s % 60:02d}:{ff:02d}"


# ---------------------------------------------------------------------------
# Cach 1 — Trich xuat 4 truong tu ten file nguon
# ---------------------------------------------------------------------------

def parse_filename(filename):
    """Backward-compatible four-field wrapper around the shared filename parser."""
    data = parse_source_filename(filename, get_valid_loai())
    return tuple(data[k] for k in ('loai', 'cau_thu', 'doi_bong', 'ky_nang'))


# ---------------------------------------------------------------------------
# ClipSplitter
# ---------------------------------------------------------------------------

class ClipSplitter:
    """Phat hien cut va cat video highlight thanh clip rieng."""

    def __init__(self, log=print):
        self.log = log

    # ---------- Probe ----------
    def probe(self, path):
        """Tra ve duration, fps, width, height cua video."""
        cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
               '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
               '-of', 'json', path]
        out = subprocess.run(cmd, capture_output=True, text=True,
                             encoding='utf-8', errors='replace',
                             creationflags=NO_WINDOW)
        if out.returncode != 0:
            raise RuntimeError(f"ffprobe loi: {out.stderr.strip()}")
        info = json.loads(out.stdout)
        st = info['streams'][0]
        num, den = st['r_frame_rate'].split('/')
        return {
            'duration': float(info['format']['duration']),
            'fps': float(num) / float(den),
            'width': st['width'],
            'height': st['height'],
        }

    # ---------- Scene detect ----------
    def scene_scores(self, path, min_score=0.03):
        """Quet 1 lan, tra ve list (thoi_diem, diem_khac_biet)."""
        vf = f"scale=320:-1,select='gte(scene,{min_score})',metadata=print:file=-"
        cmd = ['ffmpeg', '-hide_banner', '-i', path, '-an', '-vf', vf, '-f', 'null', '-']
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              encoding='utf-8', errors='replace', creationflags=NO_WINDOW)
        scores, t = [], None
        for line in proc.stdout.splitlines():
            m = re.search(r'pts_time:([0-9.]+)', line)
            if m:
                t = float(m.group(1))
                continue
            m = re.search(r'lavfi\.scene_score=([0-9.]+)', line)
            if m and t is not None:
                scores.append((t, float(m.group(1))))
                t = None
        return scores

    def detect_cuts(self, path, threshold=0.1, scores=None):
        """Tra ve list thoi diem cut (giay) co diem >= threshold."""
        if scores is None:
            scores = self.scene_scores(path, min_score=min(threshold, 0.1))
        return sorted(set(t for t, s in scores if s >= threshold))

    def build_segments(self, cuts, duration, min_len=0.5):
        """Tu diem cut → danh sach (start, end). Doan ngan hon min_len gop vao doan truoc."""
        points = [0.0] + [c for c in cuts if 0 < c < duration] + [duration]
        segs = [[points[i], points[i + 1]] for i in range(len(points) - 1)]
        merged = []
        for s in segs:
            if merged and (s[1] - s[0]) < min_len:
                merged[-1][1] = s[1]
            else:
                merged.append(s)
        if len(merged) > 1 and (merged[0][1] - merged[0][0]) < min_len:
            merged[1][0] = merged[0][0]
            merged.pop(0)
        return [(round(a, 3), round(b, 3)) for a, b in merged]

    def analyze(self, path, threshold=0.1, min_len=0.5):
        """Detect + build segments, tra thong ke de xem truoc khi cat."""
        meta = self.probe(path)
        cuts = self.detect_cuts(path, threshold)
        segs = self.build_segments(cuts, meta['duration'], min_len)
        lens = [b - a for a, b in segs]
        return {
            'meta': meta,
            'segments': segs,
            'stats': {
                'count': len(segs),
                'avg': round(sum(lens) / len(lens), 2) if lens else 0,
                'min': round(min(lens), 2) if lens else 0,
                'max': round(max(lens), 2) if lens else 0,
            }
        }

    # ---------- Catalog ----------
    @staticmethod
    def read_catalog(catalog_path):
        """Doc catalog.csv (neu co)."""
        if not os.path.exists(catalog_path):
            return []
        with open(catalog_path, 'r', encoding='utf-8-sig', newline='') as f:
            return [normalize_catalog_row(r) for r in csv.DictReader(f)]

    @staticmethod
    def write_catalog(catalog_path, rows):
        """Ghi catalog.csv dang UTF-8 BOM de Excel doc dung tieng Viet."""
        if os.path.exists(catalog_path):
            with open(catalog_path, 'r', encoding='utf-8-sig', newline='') as old:
                legacy = any(r.get('schema_version') != SCHEMA_VERSION for r in csv.DictReader(old))
            if legacy and not os.path.exists(catalog_path + '.v1.bak'):
                shutil.copy2(catalog_path, catalog_path + '.v1.bak')
        rows = [normalize_catalog_row(r) for r in rows]
        with open(catalog_path, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.DictWriter(f, fieldnames=CATALOG_FIELDS, extrasaction='ignore')
            w.writeheader()
            w.writerows(rows)

    # ---------- Cut (Cach 1 va Cach 2) ----------
    def split(self, path, out_root,
              loai=None, cau_thu=None, doi_bong=None, ky_nang=None,
              threshold=0.1, min_len=0.5, segments=None,
              make_thumbs=True, progress=None, thoi_diem=None):
        """
        Cat video thanh clip (khong am thanh), ghi catalog. Tra ve list ban ghi moi.

        Cach 1 (tu dong tu ten file):
            split(path, out_root)  — 4 truong duoc trich xuat tu ten file path.

        Cach 2 (truyen tham so tuong minh):
            split(path, out_root, loai='rai_1_3', cau_thu='Xavi',
                  doi_bong='Barcelona', ky_nang='Skill')
        """
        parsed = parse_source_filename(path, get_valid_loai())
        loai = loai or parsed['loai']
        if loai not in get_valid_loai():
            raise ValueError(f"Loai Source khong hop le: {loai}")
        cau_thu = slugify(cau_thu or parsed['cau_thu'] or 'Unknown').replace('_', '')
        doi_bong = slugify(doi_bong or parsed['doi_bong'] or 'Unknown').replace('_', '')
        ky_nang = slugify(ky_nang or parsed['ky_nang'] or 'Mixed').replace('_', '')
        thoi_diem = temporal_token(parsed['thoi_diem'] if thoi_diem is None else thoi_diem)
        if thoi_diem and not year_bounds(thoi_diem):
            raise ValueError("Thoi diem can la nam, khoang nam hoac giai dau kem nam (Euro2008).")

        meta = self.probe(path)
        fps = meta['fps']
        if segments is None:
            self.log(f"[B] Dang quet scene: {os.path.basename(path)} ...")
            segments = self.analyze(path, threshold, min_len)['segments']
        self.log(f"[B] Tim thay {len(segments)} cut, bat dau cat...")

        folder = os.path.join(out_root, loai)
        thumb_dir = os.path.join(out_root, '_thumbs')
        os.makedirs(folder, exist_ok=True)
        os.makedirs(thumb_dir, exist_ok=True)

        catalog_path = os.path.join(out_root, 'catalog.csv')
        rows = self.read_catalog(catalog_path)

        # Tinh STT tiep theo cho cau_thu + doi_bong + loai nay
        used = [int(r['stt']) for r in rows
                if r.get('cau_thu') == cau_thu and r.get('doi_bong') == doi_bong
                and r.get('loai') == loai and str(r.get('stt', '')).isdigit()]
        stt = max(used) if used else 0

        src_name = os.path.basename(path)
        new_rows = []

        for i, (start, end) in enumerate(segments):
            stt += 1
            dur = round(end - start, 3)
            name = f"{loai}_{cau_thu}_{doi_bong}_{thoi_diem or 'Unknown'}_{ky_nang}_{stt:03d}.mp4"
            out_path = os.path.join(folder, name)
            if os.path.exists(out_path):
                raise FileExistsError(f"Clip da ton tai: {out_path}")

            cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                   '-ss', f"{start:.3f}", '-i', path, '-t', f"{dur:.3f}",
                   '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
                   '-pix_fmt', 'yuv420p', out_path]
            r = subprocess.run(cmd, capture_output=True, text=True,
                               encoding='utf-8', errors='replace', creationflags=NO_WINDOW)
            if r.returncode != 0:
                self.log(f"  x {name}: {r.stderr.strip()[:200]}")
                continue

            if make_thumbs:
                thumb = os.path.join(thumb_dir, name.replace('.mp4', '.jpg'))
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                                '-ss', f"{start + dur / 2:.3f}", '-i', path, '-frames:v', '1',
                                '-vf', 'scale=320:-1', thumb],
                               capture_output=True, creationflags=NO_WINDOW)

            new_rows.append({
                'ten_file': name,
                'loai': loai, 'cau_thu': cau_thu, 'doi_bong': doi_bong, 'ky_nang': ky_nang,
                'stt': stt, 'video_nguon': src_name,
                'start_s': start, 'end_s': end, 'duration_s': dur,
                'start_tc': seconds_to_tc(start, fps),
                'end_tc': seconds_to_tc(end, fps),
                'fps': round(fps, 3), 'ghi_chu': '',
                'thoi_diem': thoi_diem, 'su_kien': event_from_time(thoi_diem),
                'schema_version': SCHEMA_VERSION, 'source_relpath': os.path.join(loai, name)
            })
            if progress:
                progress(i + 1, len(segments))

        self.write_catalog(catalog_path, rows + new_rows)
        self.log(f"[B] Xong! Cat {len(new_rows)}/{len(segments)} clip → {folder}")
        return new_rows

    # ---------- Reclassify ----------
    def reclassify(self, out_root, ten_file, new_loai=None, new_ky_nang=None):
        """
        Cap nhat loai hoac ky_nang cho 1 clip trong catalog.
        Doi ten file va chuyen thu muc neu can.
        """
        catalog_path = os.path.join(out_root, 'catalog.csv')
        rows = self.read_catalog(catalog_path)
        for r in rows:
            if r['ten_file'] != ten_file:
                continue

            old_loai = r['loai']
            upd_loai = new_loai if new_loai else old_loai
            upd_ky = slugify(new_ky_nang or r.get('ky_nang', 'Mixed')).replace('_', '')
            if upd_loai not in get_valid_loai():
                raise ValueError(f'Loai Source khong hop le: {upd_loai}')

            new_name = f"{upd_loai}_{r['cau_thu']}_{r['doi_bong']}_{temporal_token(r.get('thoi_diem')) or 'Unknown'}_{upd_ky}_{int(r['stt']):03d}.mp4"
            src = os.path.abspath(os.path.join(out_root, r['source_relpath']))
            if os.path.commonpath([os.path.abspath(out_root), src]) != os.path.abspath(out_root):
                raise ValueError('Duong dan clip nam ngoai kho')
            dst_dir = os.path.join(out_root, upd_loai)
            os.makedirs(dst_dir, exist_ok=True)

            dst = os.path.join(dst_dir, new_name)
            if os.path.normcase(src) != os.path.normcase(os.path.abspath(dst)):
                if os.path.exists(dst):
                    raise ValueError(f'Clip dich da ton tai: {new_name}')
                if not os.path.isfile(src):
                    raise ValueError(f'Khong tim thay file: {ten_file}')
                shutil.move(src, dst)

            # Di chuyen thumbnail
            old_thumb = os.path.join(out_root, '_thumbs', ten_file.replace('.mp4', '.jpg'))
            if os.path.exists(old_thumb):
                os.replace(old_thumb,
                           os.path.join(out_root, '_thumbs', new_name.replace('.mp4', '.jpg')))

            r['ten_file'] = new_name
            r['loai'] = upd_loai
            r['ky_nang'] = upd_ky
            r['source_relpath'] = os.path.join(upd_loai, new_name)
            self.write_catalog(catalog_path, rows)
            return r

        raise ValueError(f"Khong tim thay clip: {ten_file}")

    # ---------- Batch reclassify (gop nhieu clip cung luc) ----------
    def batch_reclassify(self, out_root, ten_files, new_loai=None, new_ky_nang=None):
        """Doi loai/ky_nang cho nhieu clip cung luc."""
        results = []
        for f in ten_files:
            try:
                results.append(self.reclassify(out_root, f, new_loai, new_ky_nang))
            except ValueError as e:
                self.log(f"  ! {e}")
        return results


# ---------------------------------------------------------------------------
# CLI thu nhanh
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    import argparse
    p = argparse.ArgumentParser(description='Clip Splitter CLI')
    sub = p.add_subparsers(dest='cmd')

    # analyze
    pa = sub.add_parser('analyze', help='Thong ke so cut, khong cat file')
    pa.add_argument('video')
    pa.add_argument('--threshold', type=float, default=0.1)

    # split
    ps = sub.add_parser('split', help='Cat video thanh clip')
    ps.add_argument('video')
    ps.add_argument('out_root')
    ps.add_argument('--loai', default=None)
    ps.add_argument('--cau_thu', default=None)
    ps.add_argument('--doi_bong', default=None)
    ps.add_argument('--ky_nang', default=None)
    ps.add_argument('--thoi_diem', default=None)
    ps.add_argument('--threshold', type=float, default=0.1)

    args = p.parse_args()
    sp = ClipSplitter()

    if args.cmd == 'analyze':
        res = sp.analyze(args.video, threshold=args.threshold)
        print(json.dumps(res['stats'], indent=2))
        for a, b in res['segments'][:30]:
            print(f"  {a:.2f}s – {b:.2f}s  ({b-a:.2f}s)")
    elif args.cmd == 'split':
        rows = sp.split(args.video, args.out_root,
                        loai=args.loai, cau_thu=args.cau_thu,
                        doi_bong=args.doi_bong, ky_nang=args.ky_nang,
                        threshold=args.threshold, thoi_diem=args.thoi_diem)
        print(f"Da cat {len(rows)} clip")
    else:
        p.print_help()
