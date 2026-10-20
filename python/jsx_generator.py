"""
JSX Generator — Sinh ExtendScript (.jsx) cho After Effects từ timeline JSON
"""

import json
import os


class JSXGenerator:
    """Sinh script .jsx từ timeline JSON để After Effects thực thi."""

    # Mapping blending mode names → After Effects BlendingMode enum
    BLENDING_MODES = {
        'normal': 'BlendingMode.NORMAL',
        'add': 'BlendingMode.ADD',
        'multiply': 'BlendingMode.MULTIPLY',
        'screen': 'BlendingMode.SCREEN',
        'overlay': 'BlendingMode.OVERLAY',
        'softLight': 'BlendingMode.SOFT_LIGHT',
        'hardLight': 'BlendingMode.HARD_LIGHT',
        'difference': 'BlendingMode.DIFFERENCE'
    }

    # Mapping effect names → After Effects matchName
    EFFECT_MATCH_NAMES = {
        'gaussianBlur': 'ADBE Gaussian Blur 2',
        'brightnessContrast': 'ADBE Brightness & Contrast 2',
        'hueSaturation': 'ADBE HUE SATURATION',
        'tint': 'ADBE Tint',
        'glow': 'ADBE Glo2',
        'dropShadow': 'ADBE Drop Shadow',
        'fill': 'ADBE Fill',
        'motionBlur': 'ADBE Motion Blur'
    }

    def generate(self, timeline, media_files, aep_output_path):
        """
        Sinh script JSX hoàn chỉnh.

        Args:
            timeline: dict - Timeline JSON
            media_files: list - Danh sách media files với path
            aep_output_path: str - Đường dẫn file .aep output

        Returns:
            str: Nội dung script JSX
        """
        comp = timeline.get('composition', {})
        layers = timeline.get('layers', [])
        transitions = timeline.get('transitions', [])

        # Build source path lookup
        source_paths = {}
        for mf in media_files:
            source_paths[mf['name']] = mf['path'].replace('\\', '/')

        # Start building script
        lines = []
        lines.append(self._header())
        lines.append(self._create_project(aep_output_path))
        lines.append(self._import_footage(source_paths))
        lines.append(self._create_composition(comp))
        lines.append(self._add_layers(layers, comp, source_paths))
        lines.append(self._apply_transitions(transitions, layers))
        lines.append(self._save_project(aep_output_path))
        lines.append(self._footer())

        return '\n'.join(lines)

    def _header(self):
        return """// ============================================
// AE AI Tool — Auto-generated ExtendScript
// ============================================
// WARNING: This script is auto-generated. Do not edit manually.

#target aftereffects

(function() {
    // Suppress all dialogs
    app.beginSuppressDialogs();

    try {
"""

    def _footer(self):
        return """
    } catch (err) {
        alert("AE AI Tool Error: " + err.toString());
    } finally {
        app.endSuppressDialogs(false);
    }
})();
"""

    def _create_project(self, aep_path):
        return """
        // --- Create new project ---
        if (app.project) {
            app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        }
        app.newProject();
"""

    def _import_footage(self, source_paths):
        """Sinh code import tất cả footage files."""
        lines = ["\n        // --- Import footage ---"]
        lines.append("        var importedFiles = {};")

        for name, path in source_paths.items():
            safe_name = self._safe_var_name(name)
            escaped_path = path.replace('\\', '/').replace("'", "\\'")
            lines.append(f"""
        try {{
            var io_{safe_name} = new ImportOptions(new File("{escaped_path}"));
            importedFiles["{name}"] = app.project.importFile(io_{safe_name});
        }} catch(e) {{
            // File import failed: {name}
        }}""")

        return '\n'.join(lines)

    def _create_composition(self, comp):
        """Sinh code tạo composition."""
        name = comp.get('name', 'Main Comp')
        width = comp.get('width', 1920)
        height = comp.get('height', 1080)
        fps = comp.get('fps', 30)
        duration = comp.get('duration', 30)
        bg = comp.get('backgroundColor', [0, 0, 0])

        return f"""
        // --- Create composition ---
        var comp = app.project.items.addComp(
            "{name}",
            {width},
            {height},
            1,          // pixel aspect ratio
            {duration},
            {fps}
        );
        comp.bgColor = [{bg[0]}, {bg[1]}, {bg[2]}];
"""

    def _add_layers(self, layers, comp, source_paths):
        """Sinh code thêm layers vào composition."""
        lines = ["\n        // --- Add layers ---"]
        lines.append(f"        var layers = [];")

        comp_width = comp.get('width', 1920)
        comp_height = comp.get('height', 1080)

        # Add layers in reverse order (last layer in array = bottom layer in AE)
        # Actually in AE, layers added first are at the top
        # We'll add them in order and they stack correctly
        for i, layer in enumerate(layers):
            layer_type = layer.get('type', 'footage')
            layer_name = layer.get('name', f'Layer {i + 1}')
            safe_idx = f"layer_{i}"

            lines.append(f"\n        // Layer {i}: {layer_name}")
            lines.append(f"        var {safe_idx};")

            if layer_type == 'footage' or layer_type == 'audio':
                source = layer.get('source', '')
                lines.append(f"""        if (importedFiles["{source}"]) {{
            {safe_idx} = comp.layers.add(importedFiles["{source}"]);
        }}""")

            elif layer_type == 'text':
                text_obj = layer.get('text', {})
                content = text_obj.get('content', 'Text').replace('"', '\\"').replace('\n', '\\n')
                font = text_obj.get('font', 'Arial')
                size = text_obj.get('size', 72)
                color = text_obj.get('color', [1, 1, 1])
                just = text_obj.get('justification', 'center')
                bold = 'true' if text_obj.get('bold', False) else 'false'
                italic = 'true' if text_obj.get('italic', False) else 'false'

                just_map = {
                    'left': 'ParagraphJustification.LEFT_JUSTIFY',
                    'center': 'ParagraphJustification.CENTER_JUSTIFY',
                    'right': 'ParagraphJustification.RIGHT_JUSTIFY'
                }
                just_val = just_map.get(just, 'ParagraphJustification.CENTER_JUSTIFY')

                lines.append(f"""        {safe_idx} = comp.layers.addText("{content}");
        var textDoc_{i} = {safe_idx}.property("Source Text").value;
        textDoc_{i}.font = "{font}";
        textDoc_{i}.fontSize = {size};
        textDoc_{i}.fillColor = [{color[0]}, {color[1]}, {color[2]}];
        textDoc_{i}.justification = {just_val};
        textDoc_{i}.applyFill = true;
        {safe_idx}.property("Source Text").setValue(textDoc_{i});""")

            elif layer_type == 'solid':
                solid = layer.get('solid', {})
                s_color = solid.get('color', [0, 0, 0])
                s_width = solid.get('width', comp_width)
                s_height = solid.get('height', comp_height)
                lines.append(f"""        {safe_idx} = comp.layers.addSolid(
            [{s_color[0]}, {s_color[1]}, {s_color[2]}],
            "{layer_name}",
            {s_width}, {s_height}, 1
        );""")

            elif layer_type == 'adjustment':
                lines.append(f"""        {safe_idx} = comp.layers.addSolid(
            [0, 0, 0], "{layer_name}", {comp_width}, {comp_height}, 1
        );
        {safe_idx}.adjustmentLayer = true;""")

            # Set common properties
            lines.append(f"""
        if ({safe_idx}) {{
            {safe_idx}.name = "{layer_name}";""")

            # Start time
            start_time = layer.get('startTime', 0)
            lines.append(f"            {safe_idx}.startTime = {start_time};")

            # In/Out points
            if layer.get('inPoint') is not None:
                lines.append(f"            {safe_idx}.inPoint = {layer['inPoint']};")
            if layer.get('outPoint') is not None:
                lines.append(f"            {safe_idx}.outPoint = {layer['outPoint']};")

            # Position
            pos = layer.get('position')
            if pos:
                x = pos.get('x', comp_width / 2)
                y = pos.get('y', comp_height / 2)
                lines.append(f"            {safe_idx}.property('Position').setValue([{x}, {y}]);")

            # Scale
            scale = layer.get('scale')
            if scale:
                sx = scale.get('x', 100)
                sy = scale.get('y', 100)
                lines.append(f"            {safe_idx}.property('Scale').setValue([{sx}, {sy}]);")

            # Rotation
            rotation = layer.get('rotation')
            if rotation is not None and rotation != 0:
                lines.append(f"            {safe_idx}.property('Rotation').setValue({rotation});")

            # Opacity
            opacity = layer.get('opacity')
            if opacity is not None and opacity != 100:
                lines.append(f"            {safe_idx}.property('Opacity').setValue({opacity});")

            # Blending mode
            blend = layer.get('blendingMode', 'normal')
            if blend != 'normal' and blend in self.BLENDING_MODES:
                lines.append(f"            {safe_idx}.blendingMode = {self.BLENDING_MODES[blend]};")

            # Keyframes
            keyframes = layer.get('keyframes', [])
            if keyframes:
                lines.append(self._add_keyframes(safe_idx, keyframes, i))

            # Effects
            effects = layer.get('effects', [])
            if effects:
                lines.append(self._add_effects(safe_idx, effects, i))

            lines.append(f"            layers.push({safe_idx});")
            lines.append("        }")

        return '\n'.join(lines)

    def _add_keyframes(self, layer_var, keyframes, layer_idx):
        """Sinh code thêm keyframes cho layer."""
        lines = []

        # Group keyframes by property
        prop_groups = {}
        for kf in keyframes:
            prop = kf.get('property', '')
            if prop not in prop_groups:
                prop_groups[prop] = []
            prop_groups[prop].append(kf)

        for prop, kfs in prop_groups.items():
            ae_prop = self._get_ae_property_name(prop)
            if not ae_prop:
                continue

            prop_var = f"prop_{layer_idx}_{prop}"
            lines.append(f"            var {prop_var} = {layer_var}.property('{ae_prop}');")

            for kf in kfs:
                time = kf.get('time', 0)
                value = kf.get('value')
                easing = kf.get('easing', 'easeInOut')

                # Format value
                if isinstance(value, list):
                    val_str = f"[{', '.join(str(v) for v in value)}]"
                else:
                    val_str = str(value)

                lines.append(f"            {prop_var}.setValueAtTime({time}, {val_str});")

            # Apply easing to all keyframes of this property
            num_kfs = len(kfs)
            if num_kfs > 0:
                easing_type = kfs[0].get('easing', 'easeInOut')
                lines.append(self._apply_easing(prop_var, num_kfs, easing_type))

        return '\n'.join(lines)

    def _apply_easing(self, prop_var, num_keyframes, easing_type):
        """Sinh code áp dụng easing cho keyframes."""
        if easing_type == 'linear':
            return ""  # Linear is default

        lines = []
        lines.append(f"            for (var ki = 1; ki <= {prop_var}.numKeys; ki++) {{")

        if easing_type == 'easeIn':
            lines.append(f"                var easeIn = new KeyframeEase(0.33, 80);")
            lines.append(f"                var easeOut = new KeyframeEase(0.33, 33);")
        elif easing_type == 'easeOut':
            lines.append(f"                var easeIn = new KeyframeEase(0.33, 33);")
            lines.append(f"                var easeOut = new KeyframeEase(0.33, 80);")
        else:  # easeInOut
            lines.append(f"                var easeIn = new KeyframeEase(0.33, 75);")
            lines.append(f"                var easeOut = new KeyframeEase(0.33, 75);")

        lines.append(f"                try {{")
        lines.append(f"                    var numDims = {prop_var}.value.length || 1;")
        lines.append(f"                    var easeInArr = []; var easeOutArr = [];")
        lines.append(f"                    for (var d = 0; d < numDims; d++) {{ easeInArr.push(easeIn); easeOutArr.push(easeOut); }}")
        lines.append(f"                    {prop_var}.setTemporalEaseAtKey(ki, easeInArr, easeOutArr);")
        lines.append(f"                }} catch(easeErr) {{}}")
        lines.append(f"            }}")

        return '\n'.join(lines)

    def _apply_transitions(self, transitions, layers):
        """Sinh code áp dụng transitions giữa layers."""
        if not transitions:
            return "\n        // No transitions"

        lines = ["\n        // --- Apply transitions ---"]

        for i, trans in enumerate(transitions):
            trans_type = trans.get('type', 'crossDissolve')
            from_idx = trans.get('fromLayerIndex', 0)
            to_idx = trans.get('toLayerIndex', 1)
            duration = trans.get('duration', 1)

            from_var = f"layer_{from_idx}"
            to_var = f"layer_{to_idx}"

            lines.append(f"\n        // Transition {i}: {trans_type} (layer {from_idx} → {to_idx})")
            lines.append(f"        if ({from_var} && {to_var}) {{")

            if trans_type == 'crossDissolve':
                lines.append(self._transition_cross_dissolve(from_var, to_var, duration, from_idx, to_idx))
            elif trans_type in ['slideLeft', 'slideRight', 'slideUp', 'slideDown']:
                lines.append(self._transition_slide(from_var, to_var, duration, trans_type, from_idx, to_idx, layers))
            elif trans_type in ['pushLeft', 'pushRight']:
                lines.append(self._transition_push(from_var, to_var, duration, trans_type, from_idx, to_idx, layers))
            elif trans_type in ['zoomIn', 'zoomOut']:
                lines.append(self._transition_zoom(from_var, to_var, duration, trans_type, from_idx, to_idx))
            elif trans_type in ['wipeLeft', 'wipeRight']:
                lines.append(self._transition_wipe(from_var, to_var, duration, trans_type, from_idx, to_idx))

            lines.append("        }")

        return '\n'.join(lines)

    def _transition_cross_dissolve(self, from_var, to_var, duration, from_idx, to_idx):
        """Cross dissolve = fade out from + fade in to trong khoảng overlap."""
        return f"""
            // Cross Dissolve
            var fromOut = {from_var}.outPoint;
            var overlapStart = fromOut - {duration};

            // Overlap: to layer bắt đầu sớm hơn
            {to_var}.startTime = overlapStart;

            // From layer: fade out
            var fromOpacity = {from_var}.property("Opacity");
            fromOpacity.setValueAtTime(overlapStart, 100);
            fromOpacity.setValueAtTime(fromOut, 0);

            // To layer: fade in
            var toOpacity = {to_var}.property("Opacity");
            toOpacity.setValueAtTime(overlapStart, 0);
            toOpacity.setValueAtTime(overlapStart + {duration}, 100);"""

    def _transition_slide(self, from_var, to_var, duration, direction, from_idx, to_idx, layers):
        """Slide transition — layer mới trượt vào."""
        comp_w = 1920  # Will use actual comp values
        comp_h = 1080

        if direction == 'slideLeft':
            start_pos = f"[{comp_w * 1.5}, {comp_h / 2}]"
            end_pos = f"[{comp_w / 2}, {comp_h / 2}]"
        elif direction == 'slideRight':
            start_pos = f"[-{comp_w / 2}, {comp_h / 2}]"
            end_pos = f"[{comp_w / 2}, {comp_h / 2}]"
        elif direction == 'slideUp':
            start_pos = f"[{comp_w / 2}, {comp_h * 1.5}]"
            end_pos = f"[{comp_w / 2}, {comp_h / 2}]"
        else:  # slideDown
            start_pos = f"[{comp_w / 2}, -{comp_h / 2}]"
            end_pos = f"[{comp_w / 2}, {comp_h / 2}]"

        return f"""
            // Slide {direction}
            var fromOut = {from_var}.outPoint;
            var overlapStart = fromOut - {duration};
            {to_var}.startTime = overlapStart;

            var toPos = {to_var}.property("Position");
            toPos.setValueAtTime(overlapStart, {start_pos});
            toPos.setValueAtTime(overlapStart + {duration}, {end_pos});

            // Apply easing
            try {{
                var ease1 = new KeyframeEase(0.33, 75);
                toPos.setTemporalEaseAtKey(1, [ease1, ease1], [ease1, ease1]);
                toPos.setTemporalEaseAtKey(2, [ease1, ease1], [ease1, ease1]);
            }} catch(e) {{}}"""

    def _transition_push(self, from_var, to_var, duration, direction, from_idx, to_idx, layers):
        """Push transition — cả 2 layers di chuyển."""
        comp_w = 1920
        comp_h = 1080
        center = f"[{comp_w / 2}, {comp_h / 2}]"

        if direction == 'pushLeft':
            from_end = f"[-{comp_w / 2}, {comp_h / 2}]"
            to_start = f"[{comp_w * 1.5}, {comp_h / 2}]"
        else:  # pushRight
            from_end = f"[{comp_w * 1.5}, {comp_h / 2}]"
            to_start = f"[-{comp_w / 2}, {comp_h / 2}]"

        return f"""
            // Push {direction}
            var fromOut = {from_var}.outPoint;
            var overlapStart = fromOut - {duration};
            {to_var}.startTime = overlapStart;

            var fromPos = {from_var}.property("Position");
            fromPos.setValueAtTime(overlapStart, {center});
            fromPos.setValueAtTime(fromOut, {from_end});

            var toPos = {to_var}.property("Position");
            toPos.setValueAtTime(overlapStart, {to_start});
            toPos.setValueAtTime(overlapStart + {duration}, {center});

            try {{
                var ease1 = new KeyframeEase(0.33, 75);
                fromPos.setTemporalEaseAtKey(1, [ease1, ease1], [ease1, ease1]);
                fromPos.setTemporalEaseAtKey(2, [ease1, ease1], [ease1, ease1]);
                toPos.setTemporalEaseAtKey(1, [ease1, ease1], [ease1, ease1]);
                toPos.setTemporalEaseAtKey(2, [ease1, ease1], [ease1, ease1]);
            }} catch(e) {{}}"""

    def _transition_zoom(self, from_var, to_var, duration, direction, from_idx, to_idx):
        """Zoom transition."""
        if direction == 'zoomIn':
            return f"""
            // Zoom In
            var fromOut = {from_var}.outPoint;
            var overlapStart = fromOut - {duration};
            {to_var}.startTime = overlapStart;

            var toScale = {to_var}.property("Scale");
            toScale.setValueAtTime(overlapStart, [0, 0]);
            toScale.setValueAtTime(overlapStart + {duration}, [100, 100]);

            var toOpacity = {to_var}.property("Opacity");
            toOpacity.setValueAtTime(overlapStart, 0);
            toOpacity.setValueAtTime(overlapStart + {duration} * 0.3, 100);

            try {{
                var ease1 = new KeyframeEase(0.33, 75);
                toScale.setTemporalEaseAtKey(1, [ease1, ease1], [ease1, ease1]);
                toScale.setTemporalEaseAtKey(2, [ease1, ease1], [ease1, ease1]);
            }} catch(e) {{}}"""
        else:  # zoomOut
            return f"""
            // Zoom Out
            var fromOut = {from_var}.outPoint;
            var overlapStart = fromOut - {duration};
            {to_var}.startTime = overlapStart;

            var fromScale = {from_var}.property("Scale");
            fromScale.setValueAtTime(overlapStart, [100, 100]);
            fromScale.setValueAtTime(fromOut, [200, 200]);

            var fromOpacity = {from_var}.property("Opacity");
            fromOpacity.setValueAtTime(overlapStart, 100);
            fromOpacity.setValueAtTime(fromOut, 0);

            try {{
                var ease1 = new KeyframeEase(0.33, 75);
                fromScale.setTemporalEaseAtKey(1, [ease1, ease1], [ease1, ease1]);
                fromScale.setTemporalEaseAtKey(2, [ease1, ease1], [ease1, ease1]);
            }} catch(e) {{}}"""

    def _transition_wipe(self, from_var, to_var, duration, direction, from_idx, to_idx):
        """Wipe transition using Linear Wipe effect."""
        angle = 90 if direction == 'wipeLeft' else 270

        return f"""
            // Wipe {direction}
            var fromOut = {from_var}.outPoint;
            var overlapStart = fromOut - {duration};
            {to_var}.startTime = overlapStart;

            // Add Linear Wipe to from layer
            try {{
                var wipeEffect = {from_var}.property("Effects").addProperty("ADBE Linear Wipe");
                wipeEffect.property("Transition Completion").setValueAtTime(overlapStart, 0);
                wipeEffect.property("Transition Completion").setValueAtTime(fromOut, 100);
                wipeEffect.property("Wipe Angle").setValue({angle});
                wipeEffect.property("Feather").setValue(50);
            }} catch(e) {{
                // Fallback to cross dissolve
                var fromOpacity = {from_var}.property("Opacity");
                fromOpacity.setValueAtTime(overlapStart, 100);
                fromOpacity.setValueAtTime(fromOut, 0);
            }}"""

    def _add_effects(self, layer_var, effects, layer_idx):
        """Sinh code thêm effects cho layer."""
        lines = []

        for ei, effect in enumerate(effects):
            eff_type = effect.get('type', '')
            match_name = self.EFFECT_MATCH_NAMES.get(eff_type)
            if not match_name:
                continue

            params = effect.get('params', {})
            eff_var = f"eff_{layer_idx}_{ei}"

            lines.append(f"            try {{")
            lines.append(f"                var {eff_var} = {layer_var}.property('Effects').addProperty('{match_name}');")

            # Set effect parameters based on type
            if eff_type == 'gaussianBlur':
                blur_val = params.get('blurriness', 10)
                lines.append(f"                {eff_var}.property('Blurriness').setValue({blur_val});")

            elif eff_type == 'brightnessContrast':
                brightness = params.get('brightness', 0)
                contrast = params.get('contrast', 0)
                lines.append(f"                {eff_var}.property('Brightness').setValue({brightness});")
                lines.append(f"                {eff_var}.property('Contrast').setValue({contrast});")

            elif eff_type == 'hueSaturation':
                hue = params.get('hue', 0)
                sat = params.get('saturation', 0)
                lightness = params.get('lightness', 0)
                lines.append(f"                {eff_var}.property('Channel Control').setValue(1);")
                if hue: lines.append(f"                {eff_var}.property('Master Hue').setValue({hue});")
                if sat: lines.append(f"                {eff_var}.property('Master Saturation').setValue({sat});")
                if lightness: lines.append(f"                {eff_var}.property('Master Lightness').setValue({lightness});")

            elif eff_type == 'glow':
                threshold = params.get('threshold', 60)
                radius = params.get('radius', 10)
                intensity = params.get('intensity', 1)
                lines.append(f"                {eff_var}.property('Glow Threshold').setValue({threshold});")
                lines.append(f"                {eff_var}.property('Glow Radius').setValue({radius});")
                lines.append(f"                {eff_var}.property('Glow Intensity').setValue({intensity});")

            elif eff_type == 'dropShadow':
                opacity = params.get('opacity', 50)
                distance = params.get('distance', 5)
                softness = params.get('softness', 10)
                lines.append(f"                {eff_var}.property('Opacity').setValue({opacity});")
                lines.append(f"                {eff_var}.property('Distance').setValue({distance});")
                lines.append(f"                {eff_var}.property('Softness').setValue({softness});")

            elif eff_type == 'fill':
                color = params.get('color', [1, 0, 0])
                lines.append(f"                {eff_var}.property('Color').setValue([{color[0]}, {color[1]}, {color[2]}]);")

            lines.append(f"            }} catch(e) {{}}")

        return '\n'.join(lines)

    def _save_project(self, aep_path):
        """Sinh code lưu project."""
        escaped = aep_path.replace('\\', '/').replace("'", "\\'")
        return f"""
        // --- Save project ---
        var outputFile = new File("{escaped}");
        app.project.save(outputFile);
"""

    def _get_ae_property_name(self, prop):
        """Map tên property trong schema → tên property trong After Effects."""
        mapping = {
            'position': 'Position',
            'positionX': 'Position',  # Will need special handling
            'positionY': 'Position',  # Will need special handling
            'scale': 'Scale',
            'scaleX': 'Scale',
            'scaleY': 'Scale',
            'rotation': 'Rotation',
            'opacity': 'Opacity'
        }
        return mapping.get(prop)

    def _safe_var_name(self, name):
        """Tạo tên biến JavaScript an toàn từ filename."""
        import re
        safe = re.sub(r'[^a-zA-Z0-9]', '_', name)
        if safe and safe[0].isdigit():
            safe = '_' + safe
        return safe
