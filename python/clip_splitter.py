"""
Clip Splitter (Cong cu B) — Cat video highlight thanh cac Element nho.
Pipeline: FFmpeg scene detect → loc/gop → cat tung cut (bo am thanh) → thumbnail → catalog.csv

Catalog fields (4 thuoc tinh chinh):
  loai      : rai_1 | rai_2_1 | rai_2_2 | rai_3 | rai_4 | phong_van | training |
               binh_luan_chay | khan_dai | anh_thong_so | anh_thoi_diem |
               anh_chung_bao | sa_ban | chua_phan_loai
  cau_thu   : Xavi | Iniesta | Busquets | ...
  doi_bong  : Barcelona | Spain | ManCity | Chelsea | ...
  ky_nang   : Skill | Goal | Assist | Pass | Tackle | Celebrate | Mixed

Ten file: {loai}_{cau_thu}_{doi_bong}_{ky_nang}_{STT:03d}.mp4
Vi du  : rai_1_Xavi_Barcelona_Skill_007.mp4

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

VALID_LOAI = [
    'rai_1', 'rai_2_1', 'rai_2_2', 'rai_3', 'rai_4',
    'phong_van', 'training', 'binh_luan_chay', 'khan_dai',
    'anh_thong_so', 'anh_thoi_diem', 'anh_chung_bao', 'sa_ban', 'chua_phan_loai'
]

CATALOG_FIELDS = [
    'ten_file', 'loai', 'cau_thu', 'doi_bong', 'ky_nang', 'stt',
    'video_nguon', 'start_s', 'end_s', 'duration_s',
    'start_tc', 'end_tc', 'fps', 'ghi_chu'
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

# Alias thuong gap → gia tri chuan
_LOAI_ALIAS = {
    'rai1': 'rai_1', 'rai2_1': 'rai_2_1', 'rai21': 'rai_2_1',
    'rai2_2': 'rai_2_2', 'rai22': 'rai_2_2',
    'rai3': 'rai_3', 'rai4': 'rai_4',
    'phongvan': 'phong_van', 'train': 'training',
    'binhluan': 'binh_luan_chay', 'khandai': 'khan_dai',
    'anhthongso': 'anh_thong_so', 'anhthoidiem': 'anh_thoi_diem',
    'anhchungbao': 'anh_chung_bao', 'saban': 'sa_ban',
}

_KY_NANG_ALIAS = {
    'goal': 'Goal', 'banthang': 'Goal', 'score': 'Goal',
    'assist': 'Assist', 'kientao': 'Assist',
    'skill': 'Skill', 'pass': 'Pass', 'chuyen': 'Pass',
    'tackle': 'Tackle', 'celebrate': 'Celebrate', 'anmung': 'Celebrate',
    'mixed': 'Mixed',
}


def parse_filename(filename):
    """
    Trich xuat (loai, cau_thu, doi_bong, ky_nang) tu ten file nguon.
    Ten file mau: rai1_Xavi_Barcelona_Skill.mp4
    Neu khong khop → tra ve None cho truong do.
    """
    stem = os.path.splitext(os.path.basename(filename))[0]
    parts = stem.split('_')
    if len(parts) < 2:
        return None, None, None, None

    # Phan 1: loai (co the gom nhieu phan: rai, 2, 1)
    loai = None
    consumed = 0
    for n in (3, 2, 1):
        candidate = '_'.join(parts[:n]).lower().replace('_', '')
        if candidate in _LOAI_ALIAS:
            loai = _LOAI_ALIAS[candidate]
            consumed = n
            break
        candidate2 = '_'.join(parts[:n]).lower()
        if candidate2 in VALID_LOAI:
            loai = candidate2
            consumed = n
            break

    rem = parts[consumed:]
    cau_thu = slugify(rem[0]) if len(rem) > 0 else None
    doi_bong = slugify(rem[1]) if len(rem) > 1 else None
    raw_ky = rem[2].lower() if len(rem) > 2 else ''
    ky_nang = _KY_NANG_ALIAS.get(raw_ky, rem[2] if len(rem) > 2 else 'Mixed')

    return loai, cau_thu, doi_bong, ky_nang


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
            return list(csv.DictReader(f))

    @staticmethod
    def write_catalog(catalog_path, rows):
        """Ghi catalog.csv dang UTF-8 BOM de Excel doc dung tieng Viet."""
        with open(catalog_path, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.DictWriter(f, fieldnames=CATALOG_FIELDS, extrasaction='ignore')
            w.writeheader()
            w.writerows(rows)

    # ---------- Cut (Cach 1 va Cach 2) ----------
    def split(self, path, out_root,
              loai=None, cau_thu=None, doi_bong=None, ky_nang=None,
              threshold=0.1, min_len=0.5, segments=None,
              make_thumbs=True, progress=None):
        """
        Cat video thanh clip (khong am thanh), ghi catalog. Tra ve list ban ghi moi.

        Cach 1 (tu dong tu ten file):
            split(path, out_root)  — 4 truong duoc trich xuat tu ten file path.

        Cach 2 (truyen tham so tuong minh):
            split(path, out_root, loai='rai_1', cau_thu='Xavi',
                  doi_bong='Barcelona', ky_nang='Skill')
        """
        # Trich xuat 4 truong
        if not all([loai, cau_thu, doi_bong, ky_nang]):
            fl, fc, fd, fk = parse_filename(path)
            loai = loai or fl or 'chua_phan_loai'
            cau_thu = slugify(cau_thu or fc or 'Unknown')
            doi_bong = slugify(doi_bong or fd or 'Unknown')
            ky_nang = ky_nang or fk or 'Mixed'
        else:
            loai = loai if loai in VALID_LOAI else 'chua_phan_loai'
            cau_thu = slugify(cau_thu)
            doi_bong = slugify(doi_bong)

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
            name = f"{loai}_{cau_thu}_{doi_bong}_{ky_nang}_{stt:03d}.mp4"
            out_path = os.path.join(folder, name)

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
                'fps': round(fps, 3), 'ghi_chu': ''
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
            upd_ky = new_ky_nang if new_ky_nang else r.get('ky_nang', 'Mixed')

            new_name = f"{upd_loai}_{r['cau_thu']}_{r['doi_bong']}_{upd_ky}_{int(r['stt']):03d}.mp4"
            src = os.path.join(out_root, old_loai, ten_file)
            dst_dir = os.path.join(out_root, upd_loai)
            os.makedirs(dst_dir, exist_ok=True)

            if os.path.exists(src):
                shutil.move(src, os.path.join(dst_dir, new_name))

            # Di chuyen thumbnail
            old_thumb = os.path.join(out_root, '_thumbs', ten_file.replace('.mp4', '.jpg'))
            if os.path.exists(old_thumb):
                os.replace(old_thumb,
                           os.path.join(out_root, '_thumbs', new_name.replace('.mp4', '.jpg')))

            r['ten_file'] = new_name
            r['loai'] = upd_loai
            r['ky_nang'] = upd_ky
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
                        threshold=args.threshold)
        print(f"Da cat {len(rows)} clip")
    else:
        p.print_help()
