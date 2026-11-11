"""
Subject Isolator — Tach nguoi (subject) ra khoi nen anh bang AI (rembg + U2-Net).

Dung cho tinh nang Subject Isolation: khi source la anh va co element overlay,
tach nguoi ra khoi nen de chen overlay GIUA nen va nguoi, tao hieu ung chieu sau 3D.

Input:  anh goc (.jpg/.png/.bmp)
Output: anh subject da tach nen (_subject.png) — nen trong suot

Cache: Neu file _subject.png da ton tai va moi hon file goc → khong xu ly lai.
"""

import os
import time

# Lazy import de khong bat buoc cai rembg neu chua can
_rembg_available = None


def _check_rembg():
    """Kiem tra rembg da cai chua. Tra ve True/False."""
    global _rembg_available
    if _rembg_available is not None:
        return _rembg_available
    try:
        import rembg  # noqa: F401
        from PIL import Image  # noqa: F401
        _rembg_available = True
    except ImportError:
        _rembg_available = False
    return _rembg_available


def is_available():
    """Kiem tra rembg + Pillow da san sang chua."""
    return _check_rembg()


def get_subject_path(image_path):
    """Tra ve duong dan file subject PNG tuong ung voi anh goc.

    VD: 'photo.jpg' → 'photo_subject.png'
    """
    base, _ = os.path.splitext(image_path)
    return base + "_subject.png"


def is_cached(image_path):
    """Kiem tra xem file subject da duoc tach chua (va con moi hon file goc)."""
    subject_path = get_subject_path(image_path)
    if not os.path.exists(subject_path):
        return False
    # Neu subject moi hon goc → cache con hieu luc
    return os.path.getmtime(subject_path) >= os.path.getmtime(image_path)


def remove_background(image_path, output_path=None, log=None):
    """Tach nguoi ra khoi nen anh, luu file PNG voi nen trong suot.

    Args:
        image_path: Duong dan anh goc (.jpg/.png/.bmp)
        output_path: Duong dan file output (mac dinh: {ten}_subject.png)
        log: Ham log (mac dinh: print)

    Returns:
        str: Duong dan file subject PNG da tach, hoac None neu loi
    """
    if log is None:
        log = print

    if not _check_rembg():
        log("[SI] rembg chua duoc cai. Chay: pip install rembg pillow")
        return None

    if not os.path.exists(image_path):
        log(f"[SI] File khong ton tai: {image_path}")
        return None

    if output_path is None:
        output_path = get_subject_path(image_path)

    # Check cache
    if os.path.exists(output_path) and os.path.getmtime(output_path) >= os.path.getmtime(image_path):
        log(f"[SI] Cache hit: {os.path.basename(output_path)}")
        return output_path

    try:
        from rembg import remove
        from PIL import Image

        start = time.time()
        log(f"[SI] Dang tach nen: {os.path.basename(image_path)}...")

        img = Image.open(image_path).convert("RGBA")
        subject = remove(img)

        # Luu ra file PNG (giu alpha channel)
        subject.save(output_path, format="PNG")

        elapsed = time.time() - start
        log(f"[SI] Xong ({elapsed:.1f}s): {os.path.basename(output_path)}")
        return output_path

    except Exception as e:
        log(f"[SI] Loi tach nen {os.path.basename(image_path)}: {str(e)}")
        return None


def batch_remove_background(image_paths, log=None):
    """Tach nen hang loat cho danh sach anh.

    Args:
        image_paths: list duong dan anh goc
        log: Ham log

    Returns:
        dict: {image_path: subject_path_or_None}
    """
    if log is None:
        log = print

    if not _check_rembg():
        log("[SI] rembg chua duoc cai. Chay: pip install rembg pillow")
        return {p: None for p in image_paths}

    results = {}
    total = len(image_paths)
    for i, path in enumerate(image_paths):
        log(f"[SI] Xu ly {i + 1}/{total}: {os.path.basename(path)}")
        results[path] = remove_background(path, log=log)

    success = sum(1 for v in results.values() if v is not None)
    log(f"[SI] Hoan thanh: {success}/{total} anh da tach nen")
    return results

