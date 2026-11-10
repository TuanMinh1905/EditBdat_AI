"""
AE AI Tool — Python Backend Server
Flask API server xử lý pipeline: Analyze → Gemini → Validate → JSX → After Effects
"""

import sys
import os
import json
import argparse
import traceback
from datetime import datetime

# Fix Windows console encoding for Vietnamese/Unicode
if sys.platform == 'win32':
    import io
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, OSError):
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
        except Exception:
            pass
    os.environ['PYTHONIOENCODING'] = 'utf-8'

from flask import Flask, request, jsonify
from flask_cors import CORS

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from media_analyzer import MediaAnalyzer
from gemini_client import GeminiClient
from timeline_validator import TimelineValidator
from jsx_generator import JSXGenerator
from clip_splitter import ClipSplitter
from premiere_xml_generator import generate_xml
from source_suggester import SourceSuggester
from token_tracker import get_usage, reset_usage

app = Flask(__name__)
CORS(app)


def log(message):
    """Print log message that Electron can capture."""
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}", flush=True)
    except (UnicodeEncodeError, OSError):
        # Fallback: strip non-ASCII characters
        safe_msg = message.encode('ascii', errors='replace').decode('ascii')
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {safe_msg}", flush=True)


# Global instances — khởi tạo SAU khi log() đã được định nghĩa
media_analyzer = MediaAnalyzer()
validator = TimelineValidator()
jsx_generator = JSXGenerator()
clip_splitter = ClipSplitter(log=log)
source_suggester = SourceSuggester(log=log)


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


@app.route('/api/analyze', methods=['POST'])
def analyze_media():
    """Phân tích media files, trả về metadata."""
    try:
        data = request.get_json()
        files = data.get('files', [])

        if not files:
            return jsonify({"error": "Không có file nào được cung cấp"}), 400

        log(f"Đang phân tích {len(files)} file(s)...")
        media_info = []

        for filepath in files:
            try:
                info = media_analyzer.analyze(filepath)
                media_info.append(info)
                log(f"  ✓ {os.path.basename(filepath)}: {info.get('type', 'unknown')}")
            except Exception as e:
                log(f"  ✗ {os.path.basename(filepath)}: {str(e)}")
                media_info.append({
                    "path": filepath,
                    "name": os.path.basename(filepath),
                    "error": str(e)
                })

        log(f"Phân tích xong {len(media_info)} file(s)")
        return jsonify({"media_info": media_info})

    except Exception as e:
        log(f"Lỗi analyze: {str(e)}")
        return jsonify({"error": str(e)}), 500

def _resolve_output_dir(settings):
    """Tính output directory thực tế: base_dir/project_name."""
    base_dir = settings.get('outputDir', '')
    if not base_dir:
        base_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'AE_AI_Output')

    project_name = settings.get('projectName', '').strip()
    if project_name:
        # Sanitize: chỉ giữ ký tự an toàn cho đường dẫn
        import re as _re
        project_name = _re.sub(r'[\\/:*?"<>|]', '_', project_name)
        final_dir = os.path.join(base_dir, project_name)
    else:
        final_dir = base_dir

    os.makedirs(final_dir, exist_ok=True)
    return final_dir



@app.route('/api/generate', methods=['POST'])
def generate_project():
    """Full pipeline: analyze → AI → validate → JSX → AE"""
    try:
        data = request.get_json()
        media_files = data.get('media_files', [])
        prompt = data.get('prompt', '')
        settings = data.get('settings', {})

        if not media_files:
            return jsonify({"error": "Không có media files"}), 400
        if not prompt:
            return jsonify({"error": "Không có prompt"}), 400

        api_key = settings.get('geminiApiKey', '')
        if not api_key:
            return jsonify({"error": "Chưa cài đặt Gemini API Key. Vào Settings để nhập API key."}), 400

        ae_path = settings.get('afterEffectsPath', '')
        comp_width = settings.get('compWidth', 1920)
        comp_height = settings.get('compHeight', 1080)
        comp_fps = settings.get('compFps', 30)

        # Resolve output directory (base + project subfolder)
        output_dir = _resolve_output_dir(settings)
        project_name = settings.get('projectName', '').strip() or 'AE_AI'
        log(f"Output thư mục: {output_dir}")

        # --- Step 1: Analyze media ---
        log("[STEP] analyze : active")
        log("[PROGRESS] 10")
        log("Đang phân tích media...")

        media_context = []
        for mf in media_files:
            filepath = mf.get('path', '')
            if mf.get('metadata'):
                info = mf['metadata']
            else:
                info = media_analyzer.analyze(filepath)

            media_context.append({
                "name": mf.get('name', os.path.basename(filepath)),
                "path": filepath,
                "type": mf.get('type', info.get('type', 'unknown')),
                "duration": info.get('duration'),
                "width": info.get('width'),
                "height": info.get('height'),
                "fps": info.get('fps'),
                "size": info.get('size')
            })

        log("[STEP] analyze : done")
        log("[PROGRESS] 20")
        log(f"Đã phân tích {len(media_context)} file(s)")

        # --- Step 2: Call Gemini AI ---
        log("[STEP] ai : active")
        log("[PROGRESS] 30")
        log("Đang gọi Gemini AI sinh timeline...")

        gemini = GeminiClient(api_key)
        timeline_json = gemini.generate_timeline(
            media_context=media_context,
            prompt=prompt,
            comp_width=comp_width,
            comp_height=comp_height,
            comp_fps=comp_fps
        )

        log("[STEP] ai : done")
        log("[PROGRESS] 50")
        log("AI đã sinh timeline JSON")

        # --- Step 3: Validate ---
        log("[STEP] validate : active")
        log("[PROGRESS] 55")
        log("Đang kiểm tra timeline...")

        validation_result = validator.validate(timeline_json, media_context)
        if not validation_result['valid']:
            errors = '; '.join(validation_result['errors'])
            log(f"Timeline không hợp lệ: {errors}")
            # Try to fix with AI
            log("Đang nhờ AI sửa lỗi...")
            timeline_json = gemini.fix_timeline(timeline_json, validation_result['errors'])
            validation_result = validator.validate(timeline_json, media_context)
            if not validation_result['valid']:
                return jsonify({
                    "error": f"Timeline không hợp lệ sau khi sửa: {'; '.join(validation_result['errors'])}",
                    "timeline": timeline_json
                }), 400

        log("[STEP] validate : done")
        log("[PROGRESS] 60")
        log("Timeline hợp lệ ✓")

        # --- Step 4: Generate JSX ---
        log("[STEP] jsx : active")
        log("[PROGRESS] 70")
        log("Đang tạo script JSX...")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_base = f"{project_name}_{timestamp}"
        jsx_path = os.path.join(output_dir, f"{file_base}.jsx")
        aep_path = os.path.join(output_dir, f"{file_base}.aep")

        jsx_content = jsx_generator.generate(
            timeline=timeline_json,
            media_files=media_context,
            aep_output_path=aep_path
        )

        with open(jsx_path, 'w', encoding='utf-8') as f:
            f.write(jsx_content)

        log("[STEP] jsx : done")
        log("[PROGRESS] 80")
        log(f"Script JSX đã lưu: {jsx_path}")

        # Save timeline JSON for reference
        json_path = os.path.join(output_dir, f"{file_base}_timeline.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(timeline_json, f, indent=2, ensure_ascii=False)

        # --- Step 5: Run After Effects ---
        log("[STEP] ae : active")
        log("[PROGRESS] 85")

        ae_result = {"success": False, "message": ""}

        if ae_path and os.path.exists(ae_path.rsplit('\\', 1)[0] if '\\' in ae_path else '.'):
            if ae_path_exe := settings.get('afterEffectsPath', ''):
                if os.path.exists(ae_path_exe):
                    log(f"Đang chạy After Effects: {ae_path_exe}")
                    import subprocess
                    try:
                        # Run AfterFX.exe with the script
                        result = subprocess.run(
                            [ae_path_exe, '-r', jsx_path],
                            capture_output=True,
                            text=True,
                            timeout=120  # 2 minute timeout
                        )
                        if result.returncode == 0:
                            ae_result = {"success": True, "message": "After Effects đã chạy xong"}
                            log("After Effects đã chạy script thành công")
                        else:
                            ae_result = {"success": False, "message": f"After Effects exit code: {result.returncode}"}
                            log(f"After Effects trả về lỗi: {result.stderr}")
                    except subprocess.TimeoutExpired:
                        ae_result = {"success": True, "message": "After Effects đang xử lý (timeout - kiểm tra lại sau)"}
                        log("After Effects timeout — có thể vẫn đang chạy")
                    except Exception as e:
                        ae_result = {"success": False, "message": str(e)}
                        log(f"Lỗi chạy After Effects: {str(e)}")
                else:
                    ae_result = {"success": False, "message": f"Không tìm thấy AfterFX.exe tại: {ae_path_exe}"}
                    log(f"Không tìm thấy AfterFX.exe: {ae_path_exe}")
            else:
                ae_result = {"success": False, "message": "Chưa cài đặt đường dẫn After Effects"}
                log("Chưa cài đường dẫn After Effects")

        log("[STEP] ae : done")
        log("[PROGRESS] 100")

        return jsonify({
            "success": True,
            "aep_path": aep_path,
            "jsx_path": jsx_path,
            "json_path": json_path,
            "output_dir": output_dir,
            "ae_result": ae_result,
            "timeline": timeline_json
        })

    except Exception as e:
        log(f"Lỗi generate: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/preview-timeline', methods=['POST'])
def preview_timeline():
    """Chỉ gọi AI sinh timeline JSON, không sinh JSX hay chạy AE."""
    try:
        data = request.get_json()
        media_files = data.get('media_files', [])
        prompt = data.get('prompt', '')
        settings = data.get('settings', {})

        if not prompt:
            return jsonify({"error": "Không có prompt"}), 400

        api_key = settings.get('geminiApiKey', '')
        if not api_key:
            return jsonify({"error": "Chưa cài đặt Gemini API Key"}), 400

        comp_width = settings.get('compWidth', 1920)
        comp_height = settings.get('compHeight', 1080)
        comp_fps = settings.get('compFps', 30)

        log("Đang gọi Gemini AI sinh timeline preview...")

        media_context = []
        for mf in media_files:
            filepath = mf.get('path', '')
            info = mf.get('metadata') or {}
            media_context.append({
                "name": mf.get('name', os.path.basename(filepath)),
                "path": filepath,
                "type": mf.get('type', info.get('type', 'unknown')),
                "duration": info.get('duration'),
                "width": info.get('width'),
                "height": info.get('height'),
                "fps": info.get('fps'),
            })

        gemini = GeminiClient(api_key)
        timeline_json = gemini.generate_timeline(
            media_context=media_context,
            prompt=prompt,
            comp_width=comp_width,
            comp_height=comp_height,
            comp_fps=comp_fps
        )

        log("AI sinh timeline preview xong")
        return jsonify({"timeline": timeline_json})

    except Exception as e:
        log(f"Lỗi preview-timeline: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/export-jsx', methods=['POST'])
def export_jsx_only():
    """Sinh timeline JSON và JSX nhưng KHÔNG chạy After Effects."""
    try:
        data = request.get_json()
        media_files = data.get('media_files', [])
        prompt = data.get('prompt', '')
        settings = data.get('settings', {})

        if not media_files:
            return jsonify({"error": "Không có media files"}), 400
        if not prompt:
            return jsonify({"error": "Không có prompt"}), 400

        api_key = settings.get('geminiApiKey', '')
        if not api_key:
            return jsonify({"error": "Chưa cài đặt Gemini API Key"}), 400

        comp_width = settings.get('compWidth', 1920)
        comp_height = settings.get('compHeight', 1080)
        comp_fps = settings.get('compFps', 30)

        # Resolve output directory (base + project subfolder)
        output_dir = _resolve_output_dir(settings)
        project_name = settings.get('projectName', '').strip() or 'AE_AI'
        log(f"Output thư mục: {output_dir}")

        # Analyze media
        log("[PROGRESS] 10")
        media_context = []
        for mf in media_files:
            filepath = mf.get('path', '')
            if mf.get('metadata'):
                info = mf['metadata']
            else:
                info = media_analyzer.analyze(filepath)
            media_context.append({
                "name": mf.get('name', os.path.basename(filepath)),
                "path": filepath,
                "type": mf.get('type', info.get('type', 'unknown')),
                "duration": info.get('duration'),
                "width": info.get('width'),
                "height": info.get('height'),
                "fps": info.get('fps'),
            })

        # Call Gemini
        log("[STEP] ai : active")
        log("[PROGRESS] 30")
        gemini = GeminiClient(api_key)
        timeline_json = gemini.generate_timeline(
            media_context=media_context,
            prompt=prompt,
            comp_width=comp_width,
            comp_height=comp_height,
            comp_fps=comp_fps
        )
        log("[STEP] ai : done")
        log("[PROGRESS] 55")

        # Validate
        log("[STEP] validate : active")
        validation_result = validator.validate(timeline_json, media_context)
        if not validation_result['valid']:
            errors = '; '.join(validation_result['errors'])
            log(f"Timeline có lỗi nhỏ, đang sửa tự động: {errors}")
            try:
                timeline_json = gemini.fix_timeline(timeline_json, validation_result['errors'])
            except Exception:
                pass
        log("[STEP] validate : done")
        log("[PROGRESS] 65")

        # Generate JSX
        log("[STEP] jsx : active")
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_base = f"{project_name}_{timestamp}"
        jsx_path = os.path.join(output_dir, f"{file_base}.jsx")
        aep_path = os.path.join(output_dir, f"{file_base}.aep")
        json_path = os.path.join(output_dir, f"{file_base}_timeline.json")

        jsx_content = jsx_generator.generate(
            timeline=timeline_json,
            media_files=media_context,
            aep_output_path=aep_path
        )
        with open(jsx_path, 'w', encoding='utf-8') as f:
            f.write(jsx_content)
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(timeline_json, f, indent=2, ensure_ascii=False)

        log("[STEP] jsx : done")
        log("[PROGRESS] 100")
        log(f"Script JSX đã lưu: {jsx_path}")

        return jsonify({
            "success": True,
            "jsx_path": jsx_path,
            "json_path": json_path,
            "output_dir": output_dir,
            "timeline": timeline_json
        })

    except Exception as e:
        log(f"Lỗi export-jsx: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# CONG CU B — Clip Splitter
# =============================================================================

@app.route('/api/clip-splitter/analyze', methods=['POST'])
def api_clip_analyze():
    """
    Phan tich video, tra ve thong ke so cut va preview cac doan.
    Body: { "video_path": "...", "threshold": 0.1 }
    """
    try:
        data = request.get_json()
        video_path = data.get('video_path', '')
        threshold  = float(data.get('threshold', 0.1))

        if not video_path or not os.path.exists(video_path):
            return jsonify({"error": f"Khong tim thay video: {video_path}"}), 400

        log(f"[B] Phan tich: {os.path.basename(video_path)}")
        result = clip_splitter.analyze(video_path, threshold=threshold)
        return jsonify(result)

    except Exception as e:
        log(f"Loi clip-analyze: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/clip-splitter/split', methods=['POST'])
def api_clip_split():
    """
    Cat video thanh clip element.
    Body: {
        "video_path"  : "D:/...",
        "out_root"    : "D:/Edit SofaZone/Source",
        "loai"        : "rai_1",          // null → lay tu ten file
        "cau_thu"     : "Xavi",           // null → lay tu ten file
        "doi_bong"    : "Barcelona",      // null → lay tu ten file
        "ky_nang"     : "Skill",          // null → lay tu ten file
        "threshold"   : 0.1,
        "make_thumbs" : true
    }
    """
    try:
        data = request.get_json()
        video_path = data.get('video_path', '')
        out_root   = data.get('out_root', '')
        threshold  = float(data.get('threshold', 0.1))

        if not video_path or not os.path.exists(video_path):
            return jsonify({"error": f"Khong tim thay video: {video_path}"}), 400
        if not out_root:
            return jsonify({"error": "Thieu out_root"}), 400

        log(f"[B] Bat dau cat: {os.path.basename(video_path)}")
        log("[STEP] split : active")
        log("[PROGRESS] 10")

        # Chay split (co the mat vai phut)
        new_rows = clip_splitter.split(
            path       = video_path,
            out_root   = out_root,
            loai       = data.get('loai') or None,
            cau_thu    = data.get('cau_thu') or None,
            doi_bong   = data.get('doi_bong') or None,
            ky_nang    = data.get('ky_nang') or None,
            threshold  = threshold,
            make_thumbs= data.get('make_thumbs', True),
        )

        log("[STEP] split : done")
        log("[PROGRESS] 100")
        catalog_path = os.path.join(out_root, 'catalog.csv')
        return jsonify({
            "success"      : True,
            "total_clips"  : len(new_rows),
            "catalog_path" : catalog_path,
            "clips"        : new_rows[:20],  # preview 20 dong dau
        })

    except Exception as e:
        log(f"Loi clip-split: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/clip-splitter/reclassify', methods=['POST'])
def api_clip_reclassify():
    """
    Doi loai / ky_nang cho 1 hoac nhieu clip.
    Body: {
        "out_root"    : "...",
        "ten_files"   : ["clip_001.mp4", ...],
        "new_loai"    : "rai_1",
        "new_ky_nang" : "Assist"
    }
    """
    try:
        data = request.get_json()
        out_root   = data.get('out_root', '')
        ten_files  = data.get('ten_files', [])
        new_loai   = data.get('new_loai') or None
        new_ky_nang = data.get('new_ky_nang') or None

        if not out_root or not ten_files:
            return jsonify({"error": "Thieu out_root hoac ten_files"}), 400

        results = clip_splitter.batch_reclassify(out_root, ten_files, new_loai, new_ky_nang)
        return jsonify({"success": True, "updated": len(results), "rows": results})

    except Exception as e:
        log(f"Loi clip-reclassify: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/clip-splitter/catalog', methods=['POST'])
def api_clip_catalog():
    """
    Doc catalog.csv, tra ve tat ca clip da cat.
    Body: { "catalog_path": "..." }
    """
    try:
        data = request.get_json()
        catalog_path = data.get('catalog_path', '')
        if not catalog_path or not os.path.exists(catalog_path):
            return jsonify({"rows": []})
        rows = clip_splitter.read_catalog(catalog_path)
        return jsonify({"rows": rows, "total": len(rows)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# CONG CU A — Premiere XML Generator
# =============================================================================

@app.route('/api/premiere/generate-xml', methods=['POST'])
def api_premiere_generate():
    """
    Sinh file FCP XML de import vao Premiere.
    Body: {
        "timeline_csv"   : "D:/.../1_CSV_Timeline.csv",
        "source_plan_csv": "D:/.../2_CSV_PhanLoaiSource.csv",
        "catalog_csv"    : "D:/.../Source/catalog.csv",
        "voice_path"     : "D:/.../Voice.mp3",
        "source_root"    : "D:/.../Source",
        "srt_path"       : "D:/.../Voice.srt",    // tuy chon
        "output_dir"     : "D:/.../fileXML",
        "project_name"   : "BusiXaviIniesta_ep1",
        "element_dir"    : "D:/.../Element",       // tuy chon - thu muc chua overlay/texture
        "texture_id"     : "paper_texture"          // tuy chon - element_id cho texture full-video
    }
    """
    try:
        data = request.get_json()

        required = ['timeline_csv', 'source_plan_csv', 'catalog_csv',
                    'voice_path', 'source_root', 'output_dir']
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"Thieu truong: {field}"}), 400
            if field not in ('output_dir', 'source_root') and not os.path.exists(data[field]):
                return jsonify({"error": f"Khong tim thay file: {data[field]}"}), 400

        project_name = data.get('project_name', 'AE_AI_Premiere')
        from datetime import datetime as _dt
        stamp = _dt.now().strftime('%Y%m%d_%H%M%S')
        output_path = os.path.join(data['output_dir'], f"{project_name}_{stamp}.xml")

        log(f"[A] Bat dau sinh XML: {project_name}")
        log("[STEP] xml : active")
        log("[PROGRESS] 10")

        result = generate_xml(
            timeline_csv    = data['timeline_csv'],
            source_plan_csv = data['source_plan_csv'],
            catalog_csv     = data['catalog_csv'],
            voice_path      = data['voice_path'],
            source_root     = data['source_root'],
            output_path     = output_path,
            srt_path        = data.get('srt_path') or None,
            element_dir     = data.get('element_dir') or None,
            texture_id      = data.get('texture_id') or None,
            enable_animations = data.get('enable_animations', True),
            sound_root      = data.get('sound_root') or None,
            sound_map_path  = data.get('sound_map_path') or None,
            log             = log,
        )

        log("[STEP] xml : done")
        log("[PROGRESS] 100")
        return jsonify({
            "success"          : True,
            "output_path"      : result['output'],
            "total_clips"      : result['total_clips'],
            "total_elements"   : result.get('total_elements', 0),
            "total_transitions": result.get('total_transitions', 0),
            "total_bgm_clips"  : result.get('total_bgm_clips', 0),
            "total_sfx_clips"  : result.get('total_sfx_clips', 0),
            "animations"       : result.get('animations_enabled', False),
            "missing"          : result['missing'],
        })

    except Exception as e:
        log(f"Loi premiere-generate: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# CONG CU 1 — Source Suggester (Goi y phan loai Source theo phong cach)
# =============================================================================

@app.route('/api/source-suggester/get-state', methods=['POST'])
def api_suggester_get_state():
    """Tra ve quy tac phong cach, 2 bang phan loai Source/Animation va danh sach vi du trong kho."""
    try:
        rules = source_suggester.get_rules()
        examples = source_suggester.get_examples()
        cls_data = source_suggester.get_classifications()
        return jsonify({
            "success": True,
            "rules": rules,
            "examples": examples,
            "total_examples": len(examples),
            "rules_path": source_suggester.rules_path,
            "examples_path": source_suggester.examples_path,
            "source_types": cls_data["source_types"],
            "element_types": cls_data["element_types"],
            "animation_types": cls_data["animation_types"],
            "bgm_types": cls_data["bgm_types"],
            "sfx_types": cls_data["sfx_types"],
            "classifications_path": cls_data["classifications_path"],
        })
    except Exception as e:
        log(f"Loi suggester-get-state: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/source-suggester/save-classifications', methods=['POST'])
def api_suggester_save_classifications():
    """Luu 5 bang Phan loai Source, Lop phu Design, Animation, Sound nen va Sound Effect vao templates/classifications.json."""
    try:
        data = request.get_json() or {}
        source_types = data.get('source_types')
        element_types = data.get('element_types')
        animation_types = data.get('animation_types')
        bgm_types = data.get('bgm_types')
        sfx_types = data.get('sfx_types')
        cls_data = source_suggester.save_classifications(
            source_types=source_types,
            element_types=element_types,
            animation_types=animation_types,
            bgm_types=bgm_types,
            sfx_types=sfx_types,
        )
        return jsonify({
            "success": True,
            "source_types": cls_data["source_types"],
            "element_types": cls_data["element_types"],
            "animation_types": cls_data["animation_types"],
            "bgm_types": cls_data["bgm_types"],
            "sfx_types": cls_data["sfx_types"],
            "classifications_path": cls_data["classifications_path"],
        })
    except Exception as e:
        log(f"Loi suggester-save-classifications: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/source-suggester/save-rules', methods=['POST'])
def api_suggester_save_rules():
    """Luu quy tac phong cach cua user vao templates/source_style_rules.txt."""
    try:
        data = request.get_json() or {}
        rules_text = data.get('rules', '')
        source_suggester.save_rules(rules_text)
        return jsonify({"success": True})
    except Exception as e:
        log(f"Loi suggester-save-rules: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/source-suggester/load-csv', methods=['POST'])
def api_suggester_load_csv():
    """Doc file 1_CSV_Timeline.csv de hien thi len bang."""
    try:
        data = request.get_json() or {}
        csv_path = data.get('csv_path', '')
        if not csv_path or not os.path.exists(csv_path):
            return jsonify({"error": f"Khong tim thay file CSV: {csv_path}"}), 400
        rows = source_suggester.load_timeline_csv(csv_path)
        return jsonify({
            "success": True,
            "rows": rows,
            "total": len(rows),
        })
    except Exception as e:
        log(f"Loi suggester-load-csv: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/source-suggester/suggest', methods=['POST'])
def api_suggester_suggest():
    """
    Goi Gemini 3.8 Flash + Embedding RAG de goi y loai_source cho tung dong.
    Body: {
        "rows": [...],             // hoac "csv_path"
        "csv_path": "...",
        "api_key": "...",
        "default_thoi_ky": "...",
        "rules": "..."             // tuy chon: luu luon rules truoc khi goi
    }
    """
    try:
        data = request.get_json() or {}
        api_key = data.get('api_key', '')
        default_thoi_ky = data.get('default_thoi_ky', '')

        if 'rules' in data and data['rules'] is not None:
            source_suggester.save_rules(data['rules'])

        rows = data.get('rows')
        if not rows:
            csv_path = data.get('csv_path', '')
            if not csv_path or not os.path.exists(csv_path):
                return jsonify({"error": "Chua chon file Timeline CSV hoac danh sach dong trong."}), 400
            rows = source_suggester.load_timeline_csv(csv_path)

        results = source_suggester.suggest_from_timeline(
            timeline_rows=rows,
            api_key=api_key,
            default_thoi_ky=default_thoi_ky,
        )
        return jsonify({
            "success": True,
            "rows": results,
            "total": len(results),
        })
    except Exception as e:
        log(f"Loi suggester-suggest: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/source-suggester/save-examples', methods=['POST'])
def api_suggester_save_examples():
    """Luu cac dong da duyet/sua vao kho vi du (kem tao vector embedding)."""
    try:
        data = request.get_json() or {}
        items = data.get('items', [])
        api_key = data.get('api_key', '')
        stats = source_suggester.add_examples(items, api_key=api_key)
        examples = source_suggester.get_examples()
        return jsonify({
            "success": True,
            "added": stats["added"],
            "updated": stats["updated"],
            "total": stats["total"],
            "examples": examples,
        })
    except Exception as e:
        log(f"Loi suggester-save-examples: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/source-suggester/delete-example', methods=['POST'])
def api_suggester_delete_example():
    """Xoa 1 vi du hoac xoa tat ca kho vi du."""
    try:
        data = request.get_json() or {}
        if data.get('clear_all'):
            source_suggester.clear_examples()
        else:
            ex_id = data.get('id')
            source_suggester.delete_example(ex_id)
        examples = source_suggester.get_examples()
        return jsonify({
            "success": True,
            "examples": examples,
            "total": len(examples),
        })
    except Exception as e:
        log(f"Loi suggester-delete-example: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/source-suggester/export-csv', methods=['POST'])
def api_suggester_export_csv():
    """Xuat bang ket qua ra file 2_CSV_PhanLoaiSource.csv."""
    try:
        data = request.get_json() or {}
        rows = data.get('rows', [])
        output_path = data.get('output_path', '')
        if not rows:
            return jsonify({"error": "Khong co du lieu dong de xuat CSV."}), 400
        if not output_path:
            return jsonify({"error": "Chua chon duong dan luu file CSV."}), 400

        out = source_suggester.export_source_plan_csv(rows, output_path)
        return jsonify({
            "success": True,
            "output_path": out,
            "total": len(rows),
        })
    except Exception as e:
        log(f"Loi suggester-export-csv: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# TOKEN USAGE TRACKER
# =============================================================================

@app.route('/api/token-usage/get', methods=['POST'])
def api_token_usage_get():
    """Tra ve thong ke so luong token Gemini API da goi trong app cho key hien tai."""
    try:
        data = request.get_json() or {}
        api_key = data.get('api_key', '')
        usage = get_usage(api_key)
        return jsonify({"success": True, "usage": usage})
    except Exception as e:
        log(f"Loi token-usage-get: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/token-usage/reset', methods=['POST'])
def api_token_usage_reset():
    """Reset thong ke token cho key hien tai."""
    try:
        data = request.get_json() or {}
        api_key = data.get('api_key', '')
        usage = reset_usage(api_key)
        log("Da reset thong ke token API.")
        return jsonify({"success": True, "usage": usage})
    except Exception as e:
        log(f"Loi token-usage-reset: {str(e)}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':

    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5599)
    args = parser.parse_args()

    # Kill any existing process on this port (Windows)
    if sys.platform == 'win32':
        import subprocess as sp
        try:
            result = sp.run(
                ['netstat', '-ano', '-p', 'TCP'],
                capture_output=True, text=True, timeout=5,
                creationflags=sp.CREATE_NO_WINDOW
            )
            for line in result.stdout.splitlines():
                if f':{args.port}' in line and 'LISTENING' in line:
                    parts = line.split()
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) != os.getpid():
                        sp.run(['taskkill', '/F', '/PID', pid],
                               capture_output=True, timeout=5,
                               creationflags=sp.CREATE_NO_WINDOW)
                        log(f"Killed old process on port {args.port} (PID {pid})")
                        import time
                        time.sleep(0.5)
        except Exception:
            pass

    log(f"Starting AE AI Tool backend on port {args.port}...")
    print("Server ready", flush=True)  # Signal to Electron

    # Use waitress for production-ready serving on Windows
    try:
        from waitress import serve
        serve(app, host='127.0.0.1', port=args.port, threads=4)
    except ImportError:
        # Fallback to Flask dev server
        app.run(host='127.0.0.1', port=args.port, debug=False)
    except OSError as e:
        log(f"Cannot start server: {str(e)}")
        sys.exit(1)

