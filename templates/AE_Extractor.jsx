/**
 * AE_Extractor.jsx
 * Script trích xuất toàn bộ dữ liệu composition ra file JSON
 * Chạy trong After Effects: File > Scripts > Run Script File...
 *
 * Output: <tên comp>_extracted.json
 * Dùng file JSON này gửi cho AI để cải thiện chất lượng sinh video
 */

(function () {
    app.beginSuppressDialogs();

    try {
        // --- 1. Lấy active comp ---
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Vui lòng mở một Composition trước khi chạy script này.");
            return;
        }

        // --- 2. Helper: làm tròn số ---
        function r(n, d) {
            if (d === undefined) d = 4;
            var m = Math.pow(10, d);
            return Math.round(n * m) / m;
        }

        // --- 3. Helper: chuyển easing sang tên đọc được ---
        function easingName(prop, idx) {
            try {
                var interp = prop.keyOutInterpolationType(idx);
                if (interp === KeyframeInterpolationType.LINEAR) return "linear";
                if (interp === KeyframeInterpolationType.HOLD)   return "hold";
                if (interp === KeyframeInterpolationType.BEZIER) {
                    var inInterp = prop.keyInInterpolationType(idx);
                    if (inInterp === KeyframeInterpolationType.BEZIER) return "easeInOut";
                    return "easeOut";
                }
            } catch (e) {}
            return "linear";
        }

        // --- 4. Helper: trích keyframes của một Property ---
        function extractKeyframes(prop) {
            var kfs = [];
            if (!prop || prop.numKeys === 0) return kfs;
            for (var i = 1; i <= prop.numKeys; i++) {
                try {
                    var t   = r(prop.keyTime(i), 4);
                    var val = prop.keyValue(i);
                    var kf  = { time: t, easing: easingName(prop, i) };

                    if (val instanceof Array) {
                        var arr = [];
                        for (var j = 0; j < val.length; j++) arr.push(r(val[j], 4));
                        kf.value = arr;
                    } else if (typeof val === "number") {
                        kf.value = r(val, 4);
                    } else {
                        kf.value = val;
                    }
                    kfs.push(kf);
                } catch (e) {}
            }
            return kfs;
        }

        // --- 5. Helper: đọc giá trị tĩnh của Property ---
        function staticValue(prop) {
            try {
                var v = prop.value;
                if (v instanceof Array) {
                    var arr = [];
                    for (var k = 0; k < v.length; k++) arr.push(r(v[k], 3));
                    return arr;
                }
                return (typeof v === "number") ? r(v, 3) : v;
            } catch (e) { return null; }
        }

        // --- 6. Trích xuất effects của layer ---
        function extractEffects(layer) {
            var fx = [];
            try {
                var effects = layer.property("Effects");
                if (!effects) return fx;
                for (var i = 1; i <= effects.numProperties; i++) {
                    try {
                        var ef = effects.property(i);
                        var efData = {
                            name: ef.name,
                            matchName: ef.matchName,
                            params: {}
                        };
                        for (var p = 1; p <= ef.numProperties; p++) {
                            try {
                                var param = ef.property(p);
                                if (param.numKeys > 0) {
                                    efData.params[param.name] = { keyframes: extractKeyframes(param) };
                                } else {
                                    var sv = staticValue(param);
                                    if (sv !== null) efData.params[param.name] = sv;
                                }
                            } catch (e2) {}
                        }
                        fx.push(efData);
                    } catch (e) {}
                }
            } catch (e) {}
            return fx;
        }

        // --- 7. Trích xuất text properties ---
        function extractText(layer) {
            var textData = {};
            try {
                var textProp = layer.property("Source Text");
                if (textProp && textProp.value) {
                    var td = textProp.value;
                    textData.content  = td.text || "";
                    textData.fontSize = td.fontSize || 72;
                    textData.font     = td.font || "";
                    textData.justification = (function(j) {
                        if (j === ParagraphJustification.LEFT_JUSTIFY)   return "left";
                        if (j === ParagraphJustification.RIGHT_JUSTIFY)  return "right";
                        if (j === ParagraphJustification.CENTER_JUSTIFY) return "center";
                        return "left";
                    })(td.justification);
                    try {
                        var fc = td.fillColor;
                        textData.color = [r(fc[0],3), r(fc[1],3), r(fc[2],3)];
                    } catch(e) {}
                    textData.bold   = td.fauxBold   || false;
                    textData.italic = td.fauxItalic || false;
                    try { textData.tracking = td.tracking || 0; } catch(e) {}
                }
            } catch (e) {}
            return textData;
        }

        // --- 8. Trích xuất 1 layer ---
        function extractLayer(layer) {
            var data = {};

            if      (layer instanceof TextLayer)  data.type = "text";
            else if (layer instanceof ShapeLayer) data.type = "shape";
            else if (layer instanceof AVLayer) {
                if (layer.source instanceof SolidSource) {
                    data.type = "solid";
                } else if (layer.source instanceof FootageItem) {
                    var name = layer.source.name.toLowerCase();
                    if (/\.(mp3|wav|aac|flac|ogg)$/.test(name)) data.type = "audio";
                    else if (/\.(mp4|mov|avi|mkv|webm)$/.test(name)) data.type = "video";
                    else data.type = "image";
                } else {
                    data.type = "footage";
                }
            } else {
                data.type = "null";
            }

            data.name      = layer.name;
            data.index     = layer.index;
            data.startTime = r(layer.startTime, 4);
            data.inPoint   = r(layer.inPoint, 4);
            data.outPoint  = r(layer.outPoint, 4);
            data.duration  = r(layer.outPoint - layer.inPoint, 4);

            try { if (layer.source) data.source = layer.source.name; } catch(e) {}

            var tf = layer.transform;

            // Position
            try {
                if (tf.position.numKeys > 0) {
                    data.positionKeyframes = extractKeyframes(tf.position);
                } else {
                    var pos = tf.position.value;
                    data.position = { x: r(pos[0], 2), y: r(pos[1], 2) };
                }
            } catch(e) {}

            // Scale
            try {
                if (tf.scale.numKeys > 0) {
                    data.scaleKeyframes = extractKeyframes(tf.scale);
                } else {
                    var sc = tf.scale.value;
                    data.scale = { x: r(sc[0], 2), y: r(sc[1], 2) };
                }
            } catch(e) {}

            // Rotation
            try {
                if (tf.rotation.numKeys > 0) {
                    data.rotationKeyframes = extractKeyframes(tf.rotation);
                } else {
                    data.rotation = r(tf.rotation.value, 3);
                }
            } catch(e) {}

            // Opacity
            try {
                if (tf.opacity.numKeys > 0) {
                    data.opacityKeyframes = extractKeyframes(tf.opacity);
                } else {
                    data.opacity = r(tf.opacity.value, 1);
                }
            } catch(e) {}

            // Blending mode
            try {
                var modes = {
                    0:"normal",1:"dissolve",2:"darken",3:"multiply",
                    4:"colorBurn",9:"add",10:"lighten",11:"screen",
                    15:"overlay",21:"difference",28:"hue",29:"saturation",
                    30:"color",31:"luminosity"
                };
                data.blendingMode = modes[layer.blendingMode] || "normal";
            } catch(e) {}

            // Time Remap
            try {
                if (layer.canSetTimeRemapEnabled && layer.timeRemapEnabled) {
                    var tr = layer.timeRemap;
                    if (tr.numKeys > 0) data.timeRemap = extractKeyframes(tr);
                }
            } catch(e) {}

            // Text
            if (data.type === "text") data.text = extractText(layer);

            // Solid color
            if (data.type === "solid") {
                try {
                    var c = layer.source.color;
                    data.solidColor = [r(c[0],3), r(c[1],3), r(c[2],3)];
                } catch(e) {}
            }

            data.effects = extractEffects(layer);

            // Masks
            try {
                var masks = layer.mask;
                if (masks && masks.numProperties > 0) {
                    data.hasMasks  = true;
                    data.maskCount = masks.numProperties;
                }
            } catch(e) {}

            return data;
        }

        // --- 9. Build JSON object ---
        var output = {
            _info: {
                tool: "AE_Extractor.jsx v1.0",
                extractedAt: new Date().toString(),
                aep: app.project.file ? app.project.file.name : "unsaved"
            },
            composition: {
                name:            comp.name,
                width:           comp.width,
                height:          comp.height,
                fps:             r(comp.frameRate, 4),
                duration:        r(comp.duration, 4),
                backgroundColor: [r(comp.bgColor[0],3), r(comp.bgColor[1],3), r(comp.bgColor[2],3)],
                totalFrames:     Math.round(comp.duration * comp.frameRate)
            },
            layers: []
        };

        // Duyệt bottom → top (thứ tự render thực tế)
        for (var i = comp.numLayers; i >= 1; i--) {
            try {
                output.layers.push(extractLayer(comp.layer(i)));
            } catch (e) {
                output.layers.push({ index: i, error: e.toString() });
            }
        }

        // --- 10. Serialize JSON (ES3 thuần) ---
        function jsonPretty(v, indent) {
            if (indent === undefined) indent = 0;
            var tab = "", i;
            for (i = 0; i < indent; i++) tab += "  ";
            var tab2 = tab + "  ";

            if (v === null || v === undefined) return "null";
            if (typeof v === "boolean") return v ? "true" : "false";
            if (typeof v === "number")  return isFinite(v) ? String(v) : "null";
            if (typeof v === "string")
                return '"' + v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')
                              .replace(/\n/g,'\\n').replace(/\r/g,'\\r')
                              .replace(/\t/g,'\\t') + '"';

            if (v instanceof Array) {
                if (v.length === 0) return "[]";
                if (v.length <= 4 && typeof v[0] === "number") {
                    var pts = [];
                    for (i = 0; i < v.length; i++) pts.push(String(v[i]));
                    return "[" + pts.join(", ") + "]";
                }
                var items = [];
                for (i = 0; i < v.length; i++) items.push(tab2 + jsonPretty(v[i], indent+1));
                return "[\n" + items.join(",\n") + "\n" + tab + "]";
            }

            if (typeof v === "object") {
                var pairs = [], k;
                for (k in v) {
                    if (v.hasOwnProperty(k))
                        pairs.push(tab2 + '"' + k + '": ' + jsonPretty(v[k], indent+1));
                }
                if (pairs.length === 0) return "{}";
                return "{\n" + pairs.join(",\n") + "\n" + tab + "}";
            }
            return "null";
        }

        var jsonString = jsonPretty(output);

        // --- 11. Lưu file ---
        var savePath;
        if (app.project.file) {
            savePath = new File(app.project.file.path + "/" + comp.name.replace(/[\\/:*?"<>|]/g,"_") + "_extracted.json");
        } else {
            savePath = File.saveDialog("Luu JSON extracted", "*.json");
        }

        if (savePath) {
            savePath.encoding = "UTF-8";
            savePath.open("w");
            savePath.write(jsonString);
            savePath.close();
            alert("Da xuat JSON!\n\nFile: " + savePath.fsName + "\n\nGui file nay cho AI de cai thien chat luong sinh video.");
        }

    } catch (err) {
        alert("Loi: " + err.toString() + "\nLine: " + err.line);
    } finally {
        app.endSuppressDialogs(false);
    }
})();
