"""
Timeline Validator — Kiểm tra timeline JSON theo schema và logic
"""

import os
import json

from preset_catalog import preset_names

# Load schema
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'schemas', 'timeline.schema.json')


class TimelineValidator:
    """Validate timeline JSON trước khi sinh JSX."""

    def __init__(self):
        self.schema = None
        try:
            with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
                self.schema = json.load(f)
        except Exception:
            pass  # Schema validation sẽ bị skip nếu không load được

    def validate(self, timeline, media_context=None):
        """
        Validate timeline JSON.

        Args:
            timeline: dict - Timeline JSON object
            media_context: list - Danh sách media files với metadata

        Returns:
            dict: {"valid": bool, "errors": list, "warnings": list}
        """
        errors = []
        warnings = []

        if not isinstance(timeline, dict):
            return {"valid": False, "errors": ["Timeline phải là một JSON object"], "warnings": []}

        # 1. Validate schema (nếu có jsonschema)
        if self.schema:
            schema_errors = self._validate_schema(timeline)
            errors.extend(schema_errors)

        # 2. Validate composition
        comp_errors = self._validate_composition(timeline.get('composition', {}))
        errors.extend(comp_errors)

        # 3. Validate layers
        layers = timeline.get('layers', [])
        if not layers:
            errors.append("Timeline phải có ít nhất một layer")
        else:
            for i, layer in enumerate(layers):
                layer_errors, layer_warnings = self._validate_layer(layer, i, timeline.get('composition', {}), media_context)
                errors.extend(layer_errors)
                warnings.extend(layer_warnings)

        # 4. Validate transitions
        transitions = timeline.get('transitions', [])
        for i, trans in enumerate(transitions):
            trans_errors = self._validate_transition(trans, i, len(layers))
            errors.extend(trans_errors)

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }

    def _validate_schema(self, timeline):
        """Validate against JSON schema."""
        errors = []
        try:
            import jsonschema
            jsonschema.validate(instance=timeline, schema=self.schema)
        except ImportError:
            pass  # Skip schema validation
        except jsonschema.ValidationError as e:
            errors.append(f"Schema error: {e.message}")
        return errors

    def _validate_composition(self, comp):
        """Validate composition properties."""
        errors = []
        if not comp:
            errors.append("Thiếu 'composition' trong timeline")
            return errors

        required_fields = ['name', 'width', 'height', 'fps', 'duration']
        for field in required_fields:
            if field not in comp:
                errors.append(f"Composition thiếu trường '{field}'")

        if comp.get('width', 0) <= 0:
            errors.append("Composition width phải > 0")
        if comp.get('height', 0) <= 0:
            errors.append("Composition height phải > 0")
        if comp.get('fps', 0) <= 0:
            errors.append("Composition fps phải > 0")
        if comp.get('duration', 0) <= 0:
            errors.append("Composition duration phải > 0")

        return errors

    def _validate_layer(self, layer, index, comp, media_context):
        """Validate một layer."""
        errors = []
        warnings = []
        prefix = f"Layer {index} ('{layer.get('name', 'unnamed')}')"

        # Required fields
        if 'type' not in layer:
            errors.append(f"{prefix}: thiếu 'type'")
            return errors, warnings

        if 'name' not in layer:
            errors.append(f"{prefix}: thiếu 'name'")

        layer_type = layer.get('type', '')
        valid_types = ['footage', 'solid', 'text', 'audio', 'adjustment', 'preset']
        if layer_type not in valid_types:
            errors.append(f"{prefix}: type '{layer_type}' không hợp lệ. Chấp nhận: {valid_types}")

        # Preset validation
        if layer_type == 'preset':
            preset = layer.get('preset', '')
            if preset not in preset_names():
                errors.append(f"{prefix}: preset '{preset}' không tồn tại. Có: {preset_names()}")
            if not isinstance(layer.get('params', {}), dict):
                errors.append(f"{prefix}: 'params' của preset phải là object")
            if layer.get('duration') is None:
                warnings.append(f"{prefix}: preset thiếu 'duration', sẽ hiện tới hết comp")

        # Source validation for footage and audio
        if layer_type in ['footage', 'audio']:
            source = layer.get('source', '')
            if not source:
                errors.append(f"{prefix}: type '{layer_type}' cần có 'source' (tên file)")
            elif media_context:
                # Check source matches a media file
                source_names = [m['name'] for m in media_context]
                if source not in source_names:
                    # Try case-insensitive match
                    lower_names = {n.lower(): n for n in source_names}
                    if source.lower() in lower_names:
                        warnings.append(f"{prefix}: source '{source}' sai chữ hoa/thường. Đã sửa thành '{lower_names[source.lower()]}'")
                        layer['source'] = lower_names[source.lower()]
                    else:
                        errors.append(f"{prefix}: source '{source}' không tìm thấy trong media files. Có: {source_names}")

        # Text layer validation
        if layer_type == 'text':
            text_obj = layer.get('text', {})
            if not text_obj or not text_obj.get('content'):
                errors.append(f"{prefix}: text layer cần có 'text.content'")

        # Duration/timing
        start_time = layer.get('startTime', 0)
        if start_time < 0:
            errors.append(f"{prefix}: startTime không được âm")

        duration = layer.get('duration', 0)
        if duration is not None and duration < 0:
            errors.append(f"{prefix}: duration không được âm")

        # Check layer fits in composition
        comp_duration = comp.get('duration', 0)
        if comp_duration > 0 and start_time > comp_duration:
            warnings.append(f"{prefix}: startTime ({start_time}s) vượt quá comp duration ({comp_duration}s)")

        # Validate keyframes
        keyframes = layer.get('keyframes', [])
        for ki, kf in enumerate(keyframes):
            if 'property' not in kf:
                errors.append(f"{prefix} keyframe {ki}: thiếu 'property'")
            if 'time' not in kf:
                errors.append(f"{prefix} keyframe {ki}: thiếu 'time'")
            if 'value' not in kf:
                errors.append(f"{prefix} keyframe {ki}: thiếu 'value'")

        return errors, warnings

    def _validate_transition(self, trans, index, num_layers):
        """Validate một transition."""
        errors = []
        prefix = f"Transition {index}"

        if 'type' not in trans:
            errors.append(f"{prefix}: thiếu 'type'")

        from_idx = trans.get('fromLayerIndex')
        to_idx = trans.get('toLayerIndex')

        if from_idx is None:
            errors.append(f"{prefix}: thiếu 'fromLayerIndex'")
        elif from_idx < 0 or from_idx >= num_layers:
            errors.append(f"{prefix}: fromLayerIndex {from_idx} ngoài phạm vi (0-{num_layers - 1})")

        if to_idx is None:
            errors.append(f"{prefix}: thiếu 'toLayerIndex'")
        elif to_idx < 0 or to_idx >= num_layers:
            errors.append(f"{prefix}: toLayerIndex {to_idx} ngoài phạm vi (0-{num_layers - 1})")

        duration = trans.get('duration', 0)
        if duration <= 0:
            errors.append(f"{prefix}: duration phải > 0")

        return errors
