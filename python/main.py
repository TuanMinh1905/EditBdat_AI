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

app = Flask(__name__)
CORS(app)

# Global instances
media_analyzer = MediaAnalyzer()
validator = TimelineValidator()
jsx_generator = JSXGenerator()


def log(message):
    """Print log message that Electron can capture."""
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}", flush=True)
    except (UnicodeEncodeError, OSError):
        # Fallback: strip non-ASCII characters
        safe_msg = message.encode('ascii', errors='replace').decode('ascii')
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {safe_msg}", flush=True)


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

