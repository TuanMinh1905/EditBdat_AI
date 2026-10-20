"""
Media Analyzer — Phân tích metadata của media files bằng FFprobe
"""

import os
import json
import subprocess


class MediaAnalyzer:
    """Phân tích media files (video, audio, image) bằng FFprobe."""

    # Supported extensions
    VIDEO_EXTS = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v'}
    AUDIO_EXTS = {'.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a', '.wma'}
    IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.psd', '.webp'}

    def __init__(self, ffprobe_path='ffprobe'):
        self.ffprobe_path = ffprobe_path

    def get_file_type(self, filepath):
        """Xác định loại file dựa vào extension."""
        ext = os.path.splitext(filepath)[1].lower()
        if ext in self.VIDEO_EXTS:
            return 'video'
        elif ext in self.AUDIO_EXTS:
            return 'audio'
        elif ext in self.IMAGE_EXTS:
            return 'image'
        return 'unknown'

    def analyze(self, filepath):
        """Phân tích một media file, trả về metadata dict."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File không tồn tại: {filepath}")

        file_type = self.get_file_type(filepath)
        file_size = os.path.getsize(filepath)
        basename = os.path.basename(filepath)

        result = {
            "path": filepath,
            "name": basename,
            "type": file_type,
            "size": file_size
        }

        # Use FFprobe for detailed analysis
        try:
            probe_data = self._run_ffprobe(filepath)
            if probe_data:
                result.update(self._parse_probe_data(probe_data, file_type))
        except Exception as e:
            # FFprobe failed, return basic info
            result["probe_error"] = str(e)

        return result

    def _run_ffprobe(self, filepath):
        """Chạy FFprobe và trả về JSON output."""
        try:
            cmd = [
                self.ffprobe_path,
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                filepath
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )

            if result.returncode == 0 and result.stdout:
                return json.loads(result.stdout)

        except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
            pass

        return None

    def _parse_probe_data(self, probe_data, file_type):
        """Parse FFprobe JSON output thành metadata dict."""
        result = {}
        streams = probe_data.get('streams', [])
        format_info = probe_data.get('format', {})

        # Duration from format
        if 'duration' in format_info:
            try:
                result['duration'] = float(format_info['duration'])
            except (ValueError, TypeError):
                pass

        # Find video stream
        video_stream = None
        audio_stream = None

        for stream in streams:
            codec_type = stream.get('codec_type', '')
            if codec_type == 'video' and video_stream is None:
                video_stream = stream
            elif codec_type == 'audio' and audio_stream is None:
                audio_stream = stream

        # Video info
        if video_stream:
            try:
                result['width'] = int(video_stream.get('width', 0))
                result['height'] = int(video_stream.get('height', 0))
            except (ValueError, TypeError):
                pass

            # FPS
            fps_str = video_stream.get('r_frame_rate', '')
            if fps_str and '/' in fps_str:
                try:
                    num, den = fps_str.split('/')
                    fps = float(num) / float(den)
                    if 0 < fps < 200:  # Sanity check
                        result['fps'] = round(fps, 2)
                except (ValueError, ZeroDivisionError):
                    pass

            result['video_codec'] = video_stream.get('codec_name', '')

        # Audio info
        if audio_stream:
            result['audio_codec'] = audio_stream.get('codec_name', '')
            try:
                result['sample_rate'] = int(audio_stream.get('sample_rate', 0))
                result['channels'] = int(audio_stream.get('channels', 0))
            except (ValueError, TypeError):
                pass

            # For audio-only files, get duration from stream
            if 'duration' not in result:
                try:
                    result['duration'] = float(audio_stream.get('duration', 0))
                except (ValueError, TypeError):
                    pass

        # Bitrate
        if 'bit_rate' in format_info:
            try:
                result['bitrate'] = int(format_info['bit_rate'])
            except (ValueError, TypeError):
                pass

        return result

    def analyze_batch(self, filepaths):
        """Phân tích nhiều files cùng lúc."""
        results = []
        for fp in filepaths:
            try:
                results.append(self.analyze(fp))
            except Exception as e:
                results.append({
                    "path": fp,
                    "name": os.path.basename(fp),
                    "error": str(e)
                })
        return results
