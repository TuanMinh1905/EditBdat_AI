// ============================================================
// AE AI Tool - Runtime library (ExtendScript, cú pháp ES3)
// ------------------------------------------------------------
// File này được jsx_generator.py nhúng vào đầu mọi script .jsx.
// Đây là "thư viện hiệu ứng": mỗi preset dựng sẵn một kiểu đồ họa
// (thẻ dữ liệu, mũi tên chiến thuật, sân bóng...). AI chỉ chọn preset
// và điền tham số, không tự viết code After Effects.
//
// QUY ƯỚC:
//  - Mọi thời gian (delay, at, start) tính bằng giây, TƯƠNG ĐỐI so với
//    thời điểm bắt đầu của layer preset (t0).
//  - Vị trí dạng [x, y] chuẩn hóa 0..1 (theo comp, hoặc theo sân nếu
//    tham số pitch = true). Kích thước (w, h, r, size) tính bằng pixel.
//  - KHÔNG dùng: let/const, arrow function, JSON, forEach/map/indexOf.
// ============================================================

var AI = {
    comp: null,
    brand: null,
    files: {},
    W: 1920,
    H: 1080,
    pitch: null,
    logPath: "",
    logLines: [],
    presets: {},
    lastW: 0,
    lastH: 0
};

// ------------------------------------------------------------
// Tiện ích chung
// ------------------------------------------------------------
AI.log = function (msg) {
    AI.logLines.push(String(msg));
};

AI.flushLog = function () {
    try {
        if (!AI.logPath) { return; }
        var f = new File(AI.logPath);
        f.encoding = "UTF-8";
        f.open("w");
        f.write(AI.logLines.join("\n"));
        f.close();
    } catch (e) { /* bỏ qua lỗi ghi log */ }
};

AI.init = function (comp, brand, files, logPath) {
    AI.comp = comp;
    AI.brand = brand;
    AI.files = files || {};
    AI.logPath = logPath || "";
    AI.W = comp.width;
    AI.H = comp.height;
    AI.pitch = null;
    AI.log("init comp " + comp.name + " " + AI.W + "x" + AI.H);
};

AI.num = function (v, d) {
    if (v === undefined || v === null || isNaN(v)) { return d; }
    return Number(v);
};

AI.color = function (c) {
    if (c instanceof Array) { return [c[0], c[1], c[2]]; }
    if (typeof c == "string" && AI.brand.colors[c]) {
        var v = AI.brand.colors[c];
        return [v[0], v[1], v[2]];
    }
    return [1, 1, 1];
};

AI.font = function (key) {
    var f = AI.brand.fonts;
    if (key && f[key]) { return f[key]; }
    if (key) { return key; }
    return f.body;
};

// Chuỗi an toàn để nhúng vào expression (escape ký tự đặc biệt + unicode)
AI.q = function (s) {
    var out = "\"";
    var str = String(s);
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c == 34) { out += "\\\""; }
        else if (c == 92) { out += "\\\\"; }
        else if (c == 13 || c == 10) { out += "\\r"; }
        else if (c < 32 || c > 126) {
            var h = c.toString(16);
            while (h.length < 4) { h = "0" + h; }
            out += "\\u" + h;
        } else { out += str.charAt(i); }
    }
    return out + "\"";
};

// Ngắt dòng đơn giản theo số ký tự tối đa mỗi dòng
AI.wrap = function (str, maxChars) {
    var s = String(str);
    if (s.indexOf("\n") >= 0 || s.length <= maxChars) { return s; }
    var words = s.split(" ");
    var lines = [];
    var cur = "";
    for (var i = 0; i < words.length; i++) {
        if (cur.length + words[i].length + 1 > maxChars && cur.length > 0) {
            lines.push(cur);
            cur = words[i];
        } else {
            cur = cur.length > 0 ? cur + " " + words[i] : words[i];
        }
    }
    if (cur.length > 0) { lines.push(cur); }
    return lines.join("\n");
};

// Đổi toạ độ chuẩn hóa [0..1] sang pixel (theo comp hoặc theo sân)
AI.pt = function (p, inPitch) {
    var nx = p[0];
    var ny = p[1];
    if (inPitch && AI.pitch) {
        return [AI.pitch.x + nx * AI.pitch.w, AI.pitch.y + ny * AI.pitch.h];
    }
    return [nx * AI.W, ny * AI.H];
};

AI.layerOf = function (x) {
    if (x instanceof Array) { return x.length > 0 ? x[0] : null; }
    return x;
};

// ------------------------------------------------------------
// Truy cập transform + timing + keyframe + easing
// ------------------------------------------------------------
AI.P = "ADBE Position";
AI.S = "ADBE Scale";
AI.R = "ADBE Rotate Z";
AI.O = "ADBE Opacity";
AI.A = "ADBE Anchor Point";

AI.tp = function (layer, match) {
    return layer.property("ADBE Transform Group").property(match);
};

AI.span = function (layer, t0, dur) {
    try { layer.startTime = 0; } catch (e) { /* layer có source riêng */ }
    layer.inPoint = t0;
    layer.outPoint = t0 + Math.max(dur, 0.05);
};

// Số chiều của property (Position là spatial => 1, Scale => 2...)
AI.dims = function (prop) {
    try { if (prop.isSpatial) { return 1; } } catch (e) { }
    var v = prop.value;
    if (v instanceof Array) { return v.length; }
    return 1;
};

// Easing thật cho mọi keyframe của property.
// mode: out (nhanh rồi chậm lại), in (chậm rồi nhanh), inout, linear
AI.ease = function (prop, mode) {
    if (mode == "linear") { return; }
    var n = prop.numKeys;
    if (n < 1) { return; }
    var d = AI.dims(prop);
    var hi = AI.brand.motion.easeInfluence;
    var inI = 33;
    var outI = 33;
    if (mode == "out") { inI = hi; outI = 12; }
    else if (mode == "in") { inI = 12; outI = hi; }
    else { inI = 70; outI = 70; }
    var ei = [];
    var eo = [];
    for (var j = 0; j < d; j++) {
        ei.push(new KeyframeEase(0, inI));
        eo.push(new KeyframeEase(0, outI));
    }
    for (var k = 1; k <= n; k++) {
        try { prop.setTemporalEaseAtKey(k, ei, eo); } catch (e) { /* bỏ qua */ }
    }
};

// list: [[time, value], ...]
AI.kf = function (prop, list, mode) {
    for (var i = 0; i < list.length; i++) {
        prop.setValueAtTime(list[i][0], list[i][1]);
    }
    AI.ease(prop, mode || "out");
};

AI.mul = function (arr, k) {
    return [arr[0] * k, arr[1] * k];
};

// Hiệu ứng xuất hiện cho layer. style: fade, slideUp, slideDown, slideLeft,
// slideRight, pop, zoom, none
AI.enter = function (layer, style, t, d) {
    d = d || AI.brand.motion.enterDuration;
    if (style == "none") { return; }
    var pos = AI.tp(layer, AI.P);
    var sc = AI.tp(layer, AI.S);
    var op = AI.tp(layer, AI.O);
    var p0 = pos.value;
    var s0 = sc.value;
    if (style == "slideUp") {
        AI.kf(pos, [[t, [p0[0], p0[1] + 70]], [t + d, p0]], "out");
        AI.kf(op, [[t, 0], [t + d * 0.7, 100]], "out");
    } else if (style == "slideDown") {
        AI.kf(pos, [[t, [p0[0], p0[1] - 70]], [t + d, p0]], "out");
        AI.kf(op, [[t, 0], [t + d * 0.7, 100]], "out");
    } else if (style == "slideLeft") {
        AI.kf(pos, [[t, [p0[0] + 260, p0[1]]], [t + d, p0]], "out");
        AI.kf(op, [[t, 0], [t + d * 0.6, 100]], "out");
    } else if (style == "slideRight") {
        AI.kf(pos, [[t, [p0[0] - 260, p0[1]]], [t + d, p0]], "out");
        AI.kf(op, [[t, 0], [t + d * 0.6, 100]], "out");
    } else if (style == "pop") {
        AI.kf(sc, [[t, AI.mul(s0, 0.6)], [t + d * 0.6, AI.mul(s0, 1.07)], [t + d, s0]], "out");
        AI.kf(op, [[t, 0], [t + d * 0.35, 100]], "out");
    } else if (style == "zoom") {
        AI.kf(sc, [[t, AI.mul(s0, 1.3)], [t + d, s0]], "out");
        AI.kf(op, [[t, 0], [t + d * 0.6, 100]], "out");
    } else {
        AI.kf(op, [[t, 0], [t + d, 100]], "out");
    }
};

AI.fade = function (layer, t, d) {
    var op = AI.tp(layer, AI.O);
    AI.kf(op, [[t, 0], [t + d, 100]], "out");
};

// Mờ dần ở cuối layer
AI.fadeOut = function (layer, tEnd, d) {
    d = d || AI.brand.motion.fadeOut;
    var op = AI.tp(layer, AI.O);
    var v = op.valueAtTime(Math.max(tEnd - d, 0), false);
    op.setValueAtTime(Math.max(tEnd - d, 0), v);
    op.setValueAtTime(tEnd, 0);
};

// Giảm độ nổi của layer tại thời điểm t (dùng để "làm mờ" thẻ không còn là tâm điểm)
AI.dimAt = function (layers, t, to, d) {
    for (var i = 0; i < layers.length; i++) {
        var op = AI.tp(layers[i], AI.O);
        var v = op.valueAtTime(t, false);
        op.setValueAtTime(t, v);
        op.setValueAtTime(t + (d || 0.3), v * (to / 100));
    }
};

// Gán enter cho layer cha, các layer con chỉ fade (opacity không kế thừa từ cha)
AI.enterGroup = function (parent, kids, style, t, d) {
    AI.enter(parent, style, t, d);
    for (var i = 0; i < kids.length; i++) {
        AI.fade(kids[i], t + 0.05, (d || AI.brand.motion.enterDuration) * 0.8);
    }
};

// ------------------------------------------------------------
// Effect nhanh
// ------------------------------------------------------------
AI.glow = function (layer, intensity, radius, threshold) {
    try {
        var e = layer.property("ADBE Effect Parade").addProperty("ADBE Glo2");
        try { e.property("Glow Threshold").setValue(threshold || 50); } catch (e1) { }
        try { e.property("Glow Radius").setValue(radius || 28); } catch (e2) { }
        try { e.property("Glow Intensity").setValue(intensity || 0.5); } catch (e3) { }
    } catch (e) { AI.log("glow lỗi: " + e.toString()); }
};

// ------------------------------------------------------------
// Shape layer: hình chữ nhật bo góc, elip, đường path, trim path
// Layer shape luôn đặt Position = tâm đối tượng, hình vẽ quanh gốc [0,0]
// nên scale/rotation/pop xoay quanh đúng tâm.
// ------------------------------------------------------------
AI.newShape = function (name, pos) {
    var l = AI.comp.layers.addShape();
    l.name = name;
    AI.tp(l, AI.A).setValue([0, 0]);
    AI.tp(l, AI.P).setValue(pos || [0, 0]);
    return l;
};

AI.newGroup = function (layer) {
    var root = layer.property("ADBE Root Vectors Group");
    var g = root.addProperty("ADBE Vector Group");
    return g.property("ADBE Vectors Group");
};

AI.addFillStroke = function (c, fill, fillOp, stroke, sw) {
    if (stroke) {
        var s = c.addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(stroke);
        s.property("ADBE Vector Stroke Width").setValue(sw || 2);
        try { s.property("ADBE Vector Stroke Line Cap").setValue(2); } catch (e1) { }
        try { s.property("ADBE Vector Stroke Line Join").setValue(2); } catch (e2) { }
    }
    if (fill) {
        var f = c.addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").setValue(fill);
        f.property("ADBE Vector Fill Opacity").setValue(fillOp === undefined ? 100 : fillOp);
    }
};

// Group nào thêm TRƯỚC sẽ nằm TRÊN. Hãy thêm chi tiết trước, nền sau cùng.
AI.addRect = function (layer, w, h, radius, fill, fillOp, stroke, sw, ox, oy) {
    var c = AI.newGroup(layer);
    var r = c.addProperty("ADBE Vector Shape - Rect");
    r.property("ADBE Vector Rect Size").setValue([w, h]);
    r.property("ADBE Vector Rect Roundness").setValue(radius || 0);
    r.property("ADBE Vector Rect Position").setValue([ox || 0, oy || 0]);
    AI.addFillStroke(c, fill, fillOp, stroke, sw);
    return c;
};

AI.addEllipse = function (layer, dw, dh, fill, fillOp, stroke, sw, ox, oy) {
    var c = AI.newGroup(layer);
    var e = c.addProperty("ADBE Vector Shape - Ellipse");
    e.property("ADBE Vector Ellipse Size").setValue([dw, dh]);
    e.property("ADBE Vector Ellipse Position").setValue([ox || 0, oy || 0]);
    AI.addFillStroke(c, fill, fillOp, stroke, sw);
    return c;
};

// Đường path (kèm tangent để uốn cong). Trả về {c, stroke}
AI.addPath = function (layer, verts, inT, outT, closed, fill, fillOp, stroke, sw) {
    var c = AI.newGroup(layer);
    var p = c.addProperty("ADBE Vector Shape - Group");
    var s = new Shape();
    s.vertices = verts;
    s.inTangents = inT;
    s.outTangents = outT;
    s.closed = closed;
    p.property("ADBE Vector Shape").setValue(s);
    AI.addFillStroke(c, fill, fillOp, stroke, sw);
    return c;
};

AI.addLine = function (layer, a, b, stroke, sw) {
    return AI.addPath(layer, [a, b], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false, null, 100, stroke, sw);
};

// Nét đứt cho stroke của group c
AI.dashed = function (c, dash, gap) {
    try {
        var st = c.property("ADBE Vector Graphic - Stroke");
        var ds = st.property("ADBE Vector Stroke Dashes");
        ds.addProperty("ADBE Vector Stroke Dash 1").setValue(dash || 18);
        ds.addProperty("ADBE Vector Stroke Gap 1").setValue(gap || 12);
    } catch (e) { AI.log("dashed lỗi: " + e.toString()); }
};

// Vẽ dần bằng Trim Paths
AI.trimDraw = function (c, st, dur) {
    var tr = c.addProperty("ADBE Vector Filter - Trim");
    var end = tr.property("ADBE Vector Trim End");
    AI.kf(end, [[st, 0], [st + dur, 100]], "inout");
};

AI.ellipseShape = function (cx, cy, rx, ry) {
    var k = 0.5523;
    var s = new Shape();
    s.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
    s.inTangents = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
    s.outTangents = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]];
    s.closed = true;
    return s;
};

// ------------------------------------------------------------
// Text
// o: font, size, color, align (center|left), reveal (typewriter), tracking,
//    x, y (toạ độ comp, hoặc toạ độ cục bộ nếu có parent), parent, stroke
// Text luôn được căn tâm theo anchor nên pop/scale xoay quanh tâm chữ.
// ------------------------------------------------------------
AI.addText = function (str, o) {
    o = o || {};
    var s = String(str).replace(/\n/g, "\r");
    var l = AI.comp.layers.addText(s);
    if (o.name) { l.name = o.name; }
    if (o.parent) { l.parent = o.parent; }
    var prop = l.property("ADBE Text Properties").property("ADBE Text Document");
    var td = prop.value;
    try { td.resetCharStyle(); } catch (e0) { }
    td.font = AI.font(o.font);
    td.fontSize = o.size || 60;
    td.fillColor = AI.color(o.color || "text");
    td.applyFill = true;
    try { td.tracking = o.tracking || 0; } catch (e1) { }
    var typing = (o.reveal == "typewriter");
    var left = (o.align == "left") || typing;
    td.justification = left ? ParagraphJustification.LEFT_JUSTIFY : ParagraphJustification.CENTER_JUSTIFY;
    if (o.stroke) {
        try {
            td.applyStroke = true;
            td.strokeColor = AI.color(o.stroke);
            td.strokeWidth = o.strokeWidth || 4;
            td.strokeOverFill = false;
        } catch (e2) { }
    }
    prop.setValue(td);

    var r = l.sourceRectAtTime(0, false);
    var ay = r.top + r.height / 2;
    var ax = left ? r.left : r.left + r.width / 2;
    var x = AI.num(o.x, 0);
    var y = AI.num(o.y, 0);
    if (typing && o.align != "left") { x = x - r.width / 2; }
    AI.tp(l, AI.A).setValue([ax, ay]);
    AI.tp(l, AI.P).setValue([x, y]);
    AI.lastW = r.width;
    AI.lastH = r.height;

    if (typing) {
        var cps = o.cps || AI.brand.motion.typewriterCps;
        var t0 = AI.num(o.start, 0);
        prop.expression = "var s = " + AI.q(s) + "; var n = Math.floor(Math.max(0, time - " + t0 + ") * " + cps + "); s.substr(0, n);";
    }
    return l;
};

// Nhãn dạng viên thuốc (pill). Trả về [pill, text]
AI.pill = function (str, centerPx, o) {
    o = o || {};
    var size = o.size || 30;
    var tl = AI.addText(str, { font: o.font || "title", size: size, color: o.textColor || "text", x: 0, y: 0 });
    var w = AI.lastW + size * 1.3;
    var h = AI.lastH + size * 0.75;
    var pl = AI.newShape("Label " + str, centerPx);
    AI.addRect(pl, w, h, h / 2, AI.color(o.fill || "accent"), 100, null, 0, 0, 0);
    pl.moveAfter(tl);
    tl.parent = pl;
    AI.tp(tl, AI.P).setValue([0, 0]);
    return [pl, tl];
};

// ------------------------------------------------------------
// Thẻ dữ liệu (dùng chung cho data_card và flow)
// o: pos(px), w, h, title, value, sub, accent, titleSize, valueSize
// Trả về {card, kids, all}
// ------------------------------------------------------------
AI.makeCard = function (o) {
    var w = o.w || 520;
    var h = o.h || 300;
    var accent = AI.color(o.accent || "accent");
    var card = AI.newShape("Card " + (o.title || ""), o.pos);
    // chi tiết trước (nằm trên), nền sau
    AI.addRect(card, Math.min(110, w * 0.25), 6, 3, accent, 100, null, 0, -w / 2 + Math.min(110, w * 0.25) / 2 + 28, -h / 2 + 30);
    AI.addRect(card, w, h, 22, AI.color("card"), 94, accent, 2.5, 0, 0);
    AI.glow(card, 0.45, 26, 55);
    var kids = [];
    var hasValue = (o.value !== undefined && o.value !== null && String(o.value).length > 0);
    var tSize = o.titleSize || (hasValue ? 28 : 46);
    var maxChars = Math.max(6, Math.floor((w - 60) / (tSize * 0.56)));
    var title = AI.wrap(o.title || "", maxChars);
    if (hasValue) {
        var vSize = o.valueSize || Math.max(40, Math.min(110, Math.floor((w - 60) * 1.45 / String(o.value).length)));
        kids.push(AI.addText(title, { font: "title", size: tSize, color: o.accent ? o.accent : "accent", parent: card, x: 0, y: -h * 0.27 }));
        kids.push(AI.addText(String(o.value), { font: "number", size: vSize, color: "text", parent: card, x: 0, y: h * 0.06 }));
        if (o.sub) {
            kids.push(AI.addText(AI.wrap(o.sub, maxChars + 6), { font: "body", size: 24, color: "textDim", parent: card, x: 0, y: h * 0.34 }));
        }
    } else {
        kids.push(AI.addText(title, { font: "title", size: tSize, color: "text", parent: card, x: 0, y: o.sub ? -h * 0.08 : 6 }));
        if (o.sub) {
            kids.push(AI.addText(AI.wrap(o.sub, maxChars + 6), { font: "body", size: 24, color: "textDim", parent: card, x: 0, y: h * 0.26 }));
        }
    }
    var all = [card];
    for (var i = 0; i < kids.length; i++) { all.push(kids[i]); }
    return { card: card, kids: kids, all: all };
};

AI.spanAll = function (layers, st, en) {
    for (var i = 0; i < layers.length; i++) { AI.span(layers[i], st, en - st); }
};

// ------------------------------------------------------------
// Mũi tên / đường chiến thuật (vẽ dần bằng Trim Paths)
// o: from, to (px), color, width, dashed, curve (-1..1), start, draw, head, label
// ------------------------------------------------------------
AI.arrow = function (o, en) {
    var a = o.from;
    var b = o.to;
    var col = AI.color(o.color || "alert");
    var w = o.width || 7;
    var curve = o.curve || 0;
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) { return []; }
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var ctrl = [mid[0] + (-dy / dist) * curve * dist * 0.5, mid[1] + (dx / dist) * curve * dist * 0.5];
    var inT = [[0, 0], [0, 0]];
    var outT = [[0, 0], [0, 0]];
    if (curve !== 0) {
        outT[0] = [(ctrl[0] - a[0]) * 2 / 3, (ctrl[1] - a[1]) * 2 / 3];
        inT[1] = [(ctrl[0] - b[0]) * 2 / 3, (ctrl[1] - b[1]) * 2 / 3];
    }
    var st = o.start;
    var draw = o.draw || 0.5;
    var layers = [];

    var line = AI.newShape("Arrow line", [0, 0]);
    var c = AI.addPath(line, [a, b], inT, outT, false, null, 100, col, w);
    if (o.dashed) { AI.dashed(c, w * 2.4, w * 1.6); }
    AI.trimDraw(c, st, draw);
    AI.glow(line, 0.35, 18, 60);
    AI.span(line, st, en - st);
    AI.fadeOut(line, en);
    layers.push(line);

    if (o.head !== false) {
        var from = (curve !== 0) ? ctrl : a;
        var ang = Math.atan2(b[1] - from[1], b[0] - from[0]) * 180 / Math.PI;
        var hs = w * 3.2;
        var head = AI.newShape("Arrow head", b);
        AI.addPath(head, [[0, 0], [-hs, -hs * 0.62], [-hs, hs * 0.62]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], true, col, 100, null, 0);
        AI.tp(head, AI.R).setValue(ang);
        AI.kf(AI.tp(head, AI.S), [[st + draw * 0.8, [0, 0]], [st + draw, [100, 100]]], "out");
        AI.span(head, st, en - st);
        AI.fadeOut(head, en);
        layers.push(head);
    }
    if (o.label) {
        var lp = AI.pill(o.label, [ctrl[0] * 0.5 + mid[0] * 0.5, ctrl[1] * 0.5 + mid[1] * 0.5 - 38], { fill: o.color || "alert", size: 26 });
        AI.spanAll(lp, st + draw, en);
        AI.enterGroup(lp[0], [lp[1]], "pop", st + draw, 0.35);
        AI.fadeOut(lp[0], en);
        AI.fadeOut(lp[1], en);
        layers.push(lp[0]);
        layers.push(lp[1]);
    }
    return layers;
};

// Vòng đánh dấu cầu thủ/bóng: o: pos(px), r, color, start, ping(bool), label
AI.ring = function (o, en) {
    var col = AI.color(o.color || "alert");
    var r = o.r || 46;
    var st = o.start;
    var layers = [];
    var ring = AI.newShape("Player ring", o.pos);
    AI.addEllipse(ring, r * 2, r * 2, col, 12, col, o.width || 6, 0, 0);
    AI.glow(ring, 0.5, 22, 55);
    AI.span(ring, st, en - st);
    AI.enter(ring, "zoom", st, 0.4);
    AI.fadeOut(ring, en);
    layers.push(ring);
    if (o.ping !== false) {
        var ping = AI.newShape("Ring ping", o.pos);
        AI.addEllipse(ping, r * 2, r * 2, null, 0, col, 4, 0, 0);
        AI.span(ping, st + 0.3, 1.0);
        AI.kf(AI.tp(ping, AI.S), [[st + 0.3, [100, 100]], [st + 1.2, [230, 230]]], "out");
        AI.kf(AI.tp(ping, AI.O), [[st + 0.3, 70], [st + 1.2, 0]], "out");
        layers.push(ping);
    }
    if (o.label) {
        var lp = AI.pill(o.label, [o.pos[0], o.pos[1] - r - 36], { fill: o.color || "alert", size: 24 });
        AI.spanAll(lp, st + 0.2, en);
        AI.enterGroup(lp[0], [lp[1]], "pop", st + 0.2, 0.3);
        AI.fadeOut(lp[0], en);
        AI.fadeOut(lp[1], en);
        layers.push(lp[0]);
        layers.push(lp[1]);
    }
    return layers;
};

// ------------------------------------------------------------
// PRESETS (AI chọn theo tên)
// Chữ ký: function (p, t0, dur) => mảng layer đã tạo
// ------------------------------------------------------------

// Nền lưới tối + vignette, lưới trôi nhẹ
AI.presets.grid_background = function (p, t0, dur) {
    var bg = AI.color(p.color || "bg");
    var base = AI.comp.layers.addSolid(bg, "Grid BG", AI.W, AI.H, 1);
    var layers = [base];
    try {
        var g = base.property("ADBE Effect Parade").addProperty("ADBE Grid");
        try { g.property("Size From").setValue(3); } catch (e1) { }
        try { g.property("Width").setValue(p.cell || 60); } catch (e2) { }
        try { g.property("Height").setValue(p.cell || 60); } catch (e3) { }
        try { g.property("Border").setValue(1.4); } catch (e4) { }
        try { g.property("Color").setValue(AI.color(p.lineColor || "gridLine")); } catch (e5) { }
        try { g.property("Anchor").expression = "[time * 10, time * 5]"; } catch (e6) { }
    } catch (e) { AI.log("grid lỗi: " + e.toString()); }
    AI.span(base, t0, dur);

    var vg = AI.comp.layers.addSolid([0, 0, 0], "Vignette", AI.W, AI.H, 1);
    try {
        var m = vg.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        m.property("ADBE Mask Shape").setValue(AI.ellipseShape(AI.W / 2, AI.H / 2, AI.W * 0.62, AI.H * 0.7));
        m.inverted = true;
        m.property("ADBE Mask Feather").setValue([380, 380]);
    } catch (e7) { AI.log("vignette lỗi: " + e7.toString()); }
    AI.tp(vg, AI.O).setValue(p.vignette === undefined ? 55 : p.vignette);
    AI.span(vg, t0, dur);
    layers.push(vg);
    return layers;
};

// Chữ hiện lần lượt. p: lines[{text,size,color,font,style,delay}], pos, align, style, bar
AI.presets.text_reveal = function (p, t0, dur) {
    var lines = p.lines;
    if (!lines || lines.length === 0) { lines = [{ text: p.text || "" }]; }
    var c = AI.pt(p.pos || [0.5, 0.5]);
    var step = p.step || AI.brand.motion.staggerStep * 2;
    var base = t0 + (p.delay || 0);
    var en = t0 + dur;
    var layers = [];
    var heights = [];
    var total = 0;
    var i;
    for (i = 0; i < lines.length; i++) {
        var sz = lines[i].size || p.size || 84;
        var nl = String(lines[i].text).split("\n").length;
        heights.push(sz * 1.22 * nl);
        total += heights[i];
    }
    var y = c[1] - total / 2;
    for (i = 0; i < lines.length; i++) {
        var ln = lines[i];
        var style = ln.style || p.style || "slideUp";
        var st = base + (ln.delay !== undefined ? ln.delay : i * step);
        var cy = y + heights[i] / 2;
        y += heights[i];
        var tl = AI.addText(ln.text, {
            font: ln.font || p.font || "title",
            size: ln.size || p.size || 84,
            color: ln.color || p.color || "text",
            align: p.align || "center",
            reveal: style == "typewriter" ? "typewriter" : "",
            start: st,
            cps: p.cps,
            x: c[0],
            y: cy,
            stroke: ln.stroke
        });
        AI.span(tl, st, en - st);
        if (style != "typewriter") { AI.enter(tl, style, st, 0.5); }
        AI.fadeOut(tl, en);
        layers.push(tl);
    }
    if (p.bar) {
        var bw = p.barWidth || 220;
        var bar = AI.newShape("Accent bar", [c[0], c[1] + total / 2 + 26]);
        AI.addRect(bar, bw, 8, 4, AI.color(p.barColor || "accent"), 100, null, 0, 0, 0);
        var bst = base + lines.length * step;
        AI.span(bar, bst, en - bst);
        AI.kf(AI.tp(bar, AI.S), [[bst, [0, 100]], [bst + 0.5, [100, 100]]], "out");
        AI.fadeOut(bar, en);
        layers.push(bar);
    }
    return layers;
};

// Thẻ dữ liệu. p: pos, w, h, title, value, sub, accent, enter, delay, scale, dimAt, dimTo
AI.presets.data_card = function (p, t0, dur) {
    var st = t0 + (p.delay || 0);
    var en = t0 + dur;
    var m = AI.makeCard({
        pos: AI.pt(p.pos || [0.5, 0.5], p.pitch),
        w: p.w, h: p.h, title: p.title, value: p.value, sub: p.sub,
        accent: p.accent, titleSize: p.titleSize, valueSize: p.valueSize
    });
    AI.spanAll(m.all, st, en);
    if (p.scale) { AI.tp(m.card, AI.S).setValue([p.scale * 100, p.scale * 100]); }
    AI.enterGroup(m.card, m.kids, p.enter || "slideUp", st, 0.5);
    for (var i = 0; i < m.all.length; i++) { AI.fadeOut(m.all[i], en); }
    if (p.dimAt !== undefined) { AI.dimAt(m.all, t0 + p.dimAt, p.dimTo || 35); }
    return m.all;
};

// Nhãn viên thuốc. p: text, pos, fill, size, enter, delay
AI.presets.label_tag = function (p, t0, dur) {
    var st = t0 + (p.delay || 0);
    var en = t0 + dur;
    var lp = AI.pill(p.text || "", AI.pt(p.pos || [0.5, 0.5], p.pitch), { fill: p.fill || "accent", size: p.size || 32, textColor: p.textColor });
    AI.spanAll(lp, st, en);
    AI.enterGroup(lp[0], [lp[1]], p.enter || "pop", st, 0.4);
    AI.fadeOut(lp[0], en);
    AI.fadeOut(lp[1], en);
    return lp;
};

// Vòng đánh dấu cầu thủ. p: pos, r, color, label, delay, ping
AI.presets.player_ring = function (p, t0, dur) {
    var st = t0 + (p.delay || 0);
    return AI.ring({
        pos: AI.pt(p.pos || [0.5, 0.5], p.pitch), r: p.r, color: p.color,
        label: p.label, start: st, ping: p.ping, width: p.width
    }, t0 + dur);
};

// Làm tối phần còn lại, chỉ sáng quanh một điểm. p: pos, r, dim, delay
AI.presets.spotlight = function (p, t0, dur) {
    var st = t0 + (p.delay || 0);
    var en = t0 + dur;
    var c = AI.pt(p.pos || [0.5, 0.5], p.pitch);
    var r = p.r || 150;
    var s = AI.comp.layers.addSolid([0, 0, 0], "Spotlight", AI.W, AI.H, 1);
    try {
        var m = s.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        m.property("ADBE Mask Shape").setValue(AI.ellipseShape(c[0], c[1], r * 1.25, r));
        m.inverted = true;
        m.property("ADBE Mask Feather").setValue([90, 90]);
    } catch (e) { AI.log("spotlight mask lỗi: " + e.toString()); }
    AI.span(s, st, en - st);
    AI.kf(AI.tp(s, AI.O), [[st, 0], [st + 0.5, p.dim === undefined ? 55 : p.dim]], "out");
    AI.fadeOut(s, en);
    return [s];
};

// Mũi tên chiến thuật. p: from, to, color, dashed, curve, draw, label, delay, head
AI.presets.tactical_arrow = function (p, t0, dur) {
    var st = t0 + (p.delay || 0);
    return AI.arrow({
        from: AI.pt(p.from, p.pitch), to: AI.pt(p.to, p.pitch),
        color: p.color, width: p.width, dashed: p.dashed, curve: p.curve,
        start: st, draw: p.draw, label: p.label, head: p.head
    }, t0 + dur);
};

// Vùng tô trên sân/khung hình. p: rect[x0,y0,x1,y1], shape (rect|ellipse), color, opacity, label, reveal, delay
AI.presets.zone = function (p, t0, dur) {
    var st = t0 + (p.delay || 0);
    var en = t0 + dur;
    var a = AI.pt([p.rect[0], p.rect[1]], p.pitch);
    var b = AI.pt([p.rect[2], p.rect[3]], p.pitch);
    var w = Math.abs(b[0] - a[0]);
    var h = Math.abs(b[1] - a[1]);
    var cx = Math.min(a[0], b[0]) + w / 2;
    var cy = Math.min(a[1], b[1]) + h / 2;
    var col = AI.color(p.color || "accent2");
    var wipe = (p.reveal == "wipe");
    var z = AI.newShape("Zone", [wipe ? cx - w / 2 : cx, cy]);
    var ox = wipe ? w / 2 : 0;
    if (p.shape == "ellipse") {
        AI.addEllipse(z, w, h, col, p.opacity === undefined ? 28 : p.opacity, col, 4, ox, 0);
    } else {
        AI.addRect(z, w, h, p.radius || 14, col, p.opacity === undefined ? 28 : p.opacity, col, 4, ox, 0);
    }
    AI.span(z, st, en - st);
    if (wipe) {
        AI.kf(AI.tp(z, AI.S), [[st, [0, 100]], [st + 0.6, [100, 100]]], "out");
    } else {
        AI.enter(z, "fade", st, 0.5);
    }
    AI.fadeOut(z, en);
    var layers = [z];
    if (p.label) {
        var lp = AI.pill(p.label, [cx, cy], { fill: p.color || "accent2", size: p.labelSize || 30, textColor: p.textColor || "dark" });
        AI.spanAll(lp, st + 0.3, en);
        AI.enterGroup(lp[0], [lp[1]], "pop", st + 0.3, 0.4);
        AI.fadeOut(lp[0], en);
        AI.fadeOut(lp[1], en);
        layers.push(lp[0]);
        layers.push(lp[1]);
    }
    return layers;
};

// Sân bóng nhìn từ trên xuống (dài theo trục ngang, tấn công sang phải).
// Sau khi tạo, các preset khác dùng pitch:true để vẽ theo toạ độ sân 0..1.
// p: pos, w, delay
AI.presets.pitch = function (p, t0, dur) {
    var st = t0 + (p.delay || 0);
    var en = t0 + dur;
    var c = AI.pt(p.pos || [0.5, 0.5]);
    var w = p.w || 1500;
    var sx = w / 105;
    var h = 68 * sx;
    var line = AI.color("pitchLine");
    var l = AI.newShape("Pitch", c);
    var sw = 3;
    // đường nét (nằm trên)
    AI.addRect(l, w, h, 0, null, 0, line, sw, 0, 0);
    AI.addLine(l, [0, -h / 2], [0, h / 2], line, sw);
    AI.addEllipse(l, 18.3 * sx, 18.3 * sx, null, 0, line, sw, 0, 0);
    AI.addEllipse(l, 8, 8, line, 100, null, 0, 0, 0);
    AI.addRect(l, 16.5 * sx, 40.32 * sx, 0, null, 0, line, sw, -w / 2 + 8.25 * sx, 0);
    AI.addRect(l, 16.5 * sx, 40.32 * sx, 0, null, 0, line, sw, w / 2 - 8.25 * sx, 0);
    AI.addRect(l, 5.5 * sx, 18.32 * sx, 0, null, 0, line, sw, -w / 2 + 2.75 * sx, 0);
    AI.addRect(l, 5.5 * sx, 18.32 * sx, 0, null, 0, line, sw, w / 2 - 2.75 * sx, 0);
    // nền cỏ (nằm dưới)
    AI.addRect(l, w + 60, h + 60, 20, AI.color("pitch"), 96, null, 0, 0, 0);
    AI.tp(l, AI.O).setValue(88);
    AI.span(l, st, en - st);
    AI.enter(l, "fade", st, 0.6);
    AI.fadeOut(l, en);
    AI.pitch = { x: c[0] - w / 2, y: c[1] - h / 2, w: w, h: h };
    return [l];
};

// Đội hình các chấm. p: pitch, dots[{id,pos,color,label,at}], moves[{id,to,at,dur}], links, rings, color, size
AI.presets.formation = function (p, t0, dur) {
    var dots = p.dots || [];
    var base = t0 + (p.delay || 0);
    var en = t0 + dur;
    var size = p.size || 42;
    var step = p.step || 0.12;
    var layers = [];
    var map = {};
    var tl = {};
    var i;
    for (i = 0; i < dots.length; i++) {
        var d = dots[i];
        var id = (d.id !== undefined) ? String(d.id) : String(i);
        var pt = AI.pt(d.pos, p.pitch);
        var col = AI.color(d.color || p.color || "accent");
        var l = AI.newShape("Dot " + id, pt);
        AI.addEllipse(l, size, size, col, 100, AI.color("text"), 3, 0, 0);
        var st = base + (d.at !== undefined ? d.at : i * step);
        AI.span(l, st, en - st);
        AI.enter(l, "pop", st, 0.35);
        AI.fadeOut(l, en);
        layers.push(l);
        if (d.label !== undefined) {
            var tx = AI.addText(String(d.label), { font: "title", size: size * 0.5, color: d.labelColor || "text", parent: l, x: 0, y: 0 });
            AI.span(tx, st, en - st);
            AI.fade(tx, st + 0.05, 0.25);
            AI.fadeOut(tx, en);
            layers.push(tx);
        }
        map[id] = { layer: l, pos: pt };
        tl[id] = [];
    }
    var moves = p.moves || [];
    for (i = 0; i < moves.length; i++) {
        var mv = moves[i];
        var key = String(mv.id);
        var o = map[key];
        if (!o) { continue; }
        var to = AI.pt(mv.to, p.pitch);
        var mt = base + mv.at;
        var md = mv.dur || 0.9;
        var posProp = AI.tp(o.layer, AI.P);
        posProp.setValueAtTime(mt, o.pos);
        posProp.setValueAtTime(mt + md, to);
        AI.ease(posProp, "inout");
        tl[key].push({ t0: mt, t1: mt + md, from: o.pos, to: to });
        o.pos = to;
    }
    var posAt = function (key, t) {
        var o2 = map[key];
        if (!o2) { return null; }
        var list = tl[key];
        var cur = null;
        for (var a = 0; a < list.length; a++) {
            if (list[a].t0 <= t) { cur = list[a]; }
        }
        if (!cur) {
            return list.length > 0 ? list[0].from : o2.pos;
        }
        if (t >= cur.t1) { return cur.to; }
        var k = (t - cur.t0) / (cur.t1 - cur.t0);
        return [cur.from[0] + (cur.to[0] - cur.from[0]) * k, cur.from[1] + (cur.to[1] - cur.from[1]) * k];
    };
    var links = p.links || [];
    for (i = 0; i < links.length; i++) {
        var lk = links[i];
        var lt = base + lk.at;
        var pa = posAt(String(lk.from), lt);
        var pb = posAt(String(lk.to), lt);
        if (!pa || !pb) { continue; }
        var made = AI.arrow({ from: pa, to: pb, color: lk.color || "accent2", width: lk.width || 5, dashed: lk.dashed, curve: lk.curve, start: lt, draw: lk.draw || 0.45, head: lk.head === true, label: lk.label }, en);
        for (var q = 0; q < made.length; q++) { layers.push(made[q]); }
    }
    var rings = p.rings || [];
    for (i = 0; i < rings.length; i++) {
        var rg = rings[i];
        var rt = base + rg.at;
        var rp = posAt(String(rg.id), rt);
        if (!rp) { continue; }
        var rmade = AI.ring({ pos: rp, r: rg.r || size * 1.1, color: rg.color || "accent2", label: rg.label, start: rt, width: 5 }, en);
        for (var q2 = 0; q2 < rmade.length; q2++) { layers.push(rmade[q2]); }
    }
    return layers;
};

// Luồng các ô nối nhau. p: nodes[{title,sub}], pos, nodeW, nodeH, step, labels[], bypass[], highlight, highlightAt
AI.presets.flow = function (p, t0, dur) {
    var nodes = p.nodes || [];
    var n = nodes.length;
    if (n === 0) { return []; }
    var c = AI.pt(p.pos || [0.5, 0.5]);
    var gap = p.gap || 150;
    var nodeW = p.nodeW || Math.min(400, (AI.W * 0.88 - (n - 1) * gap) / n);
    var nodeH = p.nodeH || 200;
    var total = n * nodeW + (n - 1) * gap;
    var x0 = c[0] - total / 2 + nodeW / 2;
    var step = p.step || 0.8;
    var base = t0 + (p.delay || 0);
    var en = t0 + dur;
    var layers = [];
    var cards = [];
    var starts = [];
    var i;
    for (i = 0; i < n; i++) {
        var st = base + i * step;
        starts.push(st);
        var m = AI.makeCard({
            pos: [x0 + i * (nodeW + gap), c[1]], w: nodeW, h: nodeH,
            title: nodes[i].title, sub: nodes[i].sub, value: nodes[i].value,
            accent: nodes[i].accent || p.accent
        });
        AI.spanAll(m.all, st, en);
        AI.enterGroup(m.card, m.kids, "pop", st, 0.5);
        for (var j = 0; j < m.all.length; j++) { AI.fadeOut(m.all[j], en); layers.push(m.all[j]); }
        cards.push(m);
    }
    for (i = 0; i < n - 1; i++) {
        var ax = x0 + i * (nodeW + gap) + nodeW / 2 + 10;
        var bx = x0 + (i + 1) * (nodeW + gap) - nodeW / 2 - 10;
        var made = AI.arrow({ from: [ax, c[1]], to: [bx, c[1]], color: p.lineColor || "accent2", width: 6, start: starts[i] + 0.4, draw: 0.45 }, en);
        for (var q = 0; q < made.length; q++) { layers.push(made[q]); }
        if (p.labels && p.labels[i]) {
            var lp = AI.pill(p.labels[i], [(ax + bx) / 2, c[1] - 50], { fill: "accent2", size: 24, textColor: "dark" });
            AI.spanAll(lp, starts[i] + 0.7, en);
            AI.enterGroup(lp[0], [lp[1]], "pop", starts[i] + 0.7, 0.35);
            layers.push(lp[0]);
            layers.push(lp[1]);
        }
    }
    var bp = p.bypass || [];
    var bt = base + n * step;
    for (i = 0; i < bp.length; i++) {
        var fx = x0 + bp[i].from * (nodeW + gap);
        var tx = x0 + bp[i]["to"] * (nodeW + gap);
        var topY = c[1] - nodeH / 2 - 8;
        var made2 = AI.arrow({ from: [fx, topY], to: [tx, topY], color: bp[i].color || "alert", width: 6, curve: -0.5, dashed: true, start: bt + i * 0.6, draw: 0.7, label: bp[i].label }, en);
        for (var q2 = 0; q2 < made2.length; q2++) { layers.push(made2[q2]); }
    }
    if (p.highlight !== undefined && p.highlightAt !== undefined) {
        for (i = 0; i < n; i++) {
            if (i != p.highlight) { AI.dimAt(cards[i].all, t0 + p.highlightAt, 35); }
        }
    }
    return layers;
};

// Bảng tỷ số. p: left, right, pos, changes[{side,value,at}], caption
AI.presets.scoreboard = function (p, t0, dur) {
    var st = t0 + (p.delay || 0);
    var en = t0 + dur;
    var c = AI.pt(p.pos || [0.5, 0.5]);
    var w = 1000;
    var h = 210;
    var card = AI.newShape("Scoreboard", c);
    AI.addRect(card, 150, 6, 3, AI.color("accent2"), 100, null, 0, 0, -h / 2 + 30);
    AI.addRect(card, w, h, 26, AI.color("card"), 95, AI.color("cardStroke"), 3, 0, 0);
    AI.glow(card, 0.4, 24, 55);
    var kids = [];
    kids.push(AI.addText(p.left || "BARCA", { font: "title", size: 52, color: "text", parent: card, x: -330, y: 0 }));
    kids.push(AI.addText(p.right || "ĐỐI THỦ", { font: "title", size: 52, color: "text", parent: card, x: 330, y: 0 }));
    kids.push(AI.addText("-", { font: "number", size: 90, color: "textDim", parent: card, x: 0, y: -4 }));
    var sides = { left: -90, right: 90 };
    var curr = { left: null, right: null };
    var sideKey;
    for (sideKey in sides) {
        var first = AI.addText("0", { font: "number", size: 120, color: "text", parent: card, x: sides[sideKey], y: 0 });
        kids.push(first);
        curr[sideKey] = first;
    }
    AI.spanAll([card].concat(kids), st, en);
    AI.enterGroup(card, kids, "pop", st, 0.55);
    var changes = p.changes || [];
    for (var i = 0; i < changes.length; i++) {
        var ch = changes[i];
        var side = ch.side == "left" ? "left" : "right";
        var ct = t0 + ch.at;
        var prev = curr[side];
        prev.outPoint = ct;
        var nt = AI.addText(String(ch.value), { font: "number", size: 120, color: "alert", parent: card, x: sides[side], y: 0 });
        AI.span(nt, ct, en - ct);
        AI.kf(AI.tp(nt, AI.S), [[ct, [40, 40]], [ct + 0.2, [135, 135]], [ct + 0.4, [100, 100]]], "out");
        AI.kf(AI.tp(nt, AI.O), [[ct, 0], [ct + 0.12, 100]], "out");
        curr[side] = nt;
        kids.push(nt);
    }
    var all = [card].concat(kids);
    for (var j = 0; j < all.length; j++) { AI.fadeOut(all[j], en); }
    if (p.caption) {
        var cap = AI.addText(p.caption, { font: "body", size: 26, color: "textDim", x: c[0], y: c[1] + h / 2 + 40 });
        AI.span(cap, st + 0.4, en - st - 0.4);
        AI.fade(cap, st + 0.4, 0.4);
        AI.fadeOut(cap, en);
        all.push(cap);
    }
    return all;
};

// ------------------------------------------------------------
// LAYER THƯỜNG: footage, audio, text, solid, adjustment
// ------------------------------------------------------------
AI.BLEND = {
    normal: BlendingMode.NORMAL,
    add: BlendingMode.ADD,
    multiply: BlendingMode.MULTIPLY,
    screen: BlendingMode.SCREEN,
    overlay: BlendingMode.OVERLAY,
    softLight: BlendingMode.SOFT_LIGHT,
    hardLight: BlendingMode.HARD_LIGHT,
    difference: BlendingMode.DIFFERENCE
};

AI.EFFECTS = {
    gaussianBlur: "ADBE Gaussian Blur 2",
    brightnessContrast: "ADBE Brightness & Contrast 2",
    hueSaturation: "ADBE HUE SATURATION",
    tint: "ADBE Tint",
    glow: "ADBE Glo2",
    dropShadow: "ADBE Drop Shadow",
    fill: "ADBE Fill",
    motionBlur: "ADBE Motion Blur"
};

AI.easeName = function (e) {
    if (e == "easeIn") { return "in"; }
    if (e == "easeOut") { return "out"; }
    if (e == "linear") { return "linear"; }
    return "inout";
};

// Keyframe do AI cung cấp. Thời gian tính từ đầu layer (t0 = thời điểm layer bắt đầu trong comp).
// Scale được nhân với fitK để 100 luôn nghĩa là "vừa khung".
AI.keyframes = function (layer, kfs, t0, fitK) {
    var groups = {};
    var order = [];
    var i;
    for (i = 0; i < kfs.length; i++) {
        var pr = kfs[i].property;
        if (!groups[pr]) { groups[pr] = []; order.push(pr); }
        groups[pr].push(kfs[i]);
    }
    for (var g = 0; g < order.length; g++) {
        var name = order[g];
        var list = groups[name];
        var match = null;
        if (name == "position" || name == "positionX" || name == "positionY") { match = AI.P; }
        else if (name == "scale" || name == "scaleX" || name == "scaleY") { match = AI.S; }
        else if (name == "rotation") { match = AI.R; }
        else if (name == "opacity") { match = AI.O; }
        if (!match) { continue; }
        var prop = AI.tp(layer, match);
        for (i = 0; i < list.length; i++) {
            var t = t0 + AI.num(list[i].time, 0);
            var v = list[i].value;
            var cur;
            if (name == "position") {
                if (v instanceof Array) { prop.setValueAtTime(t, [v[0], v[1]]); }
                else if (v && typeof v == "object") { prop.setValueAtTime(t, [AI.num(v.x, AI.W / 2), AI.num(v.y, AI.H / 2)]); }
            } else if (name == "scale") {
                var sx = (v instanceof Array) ? v[0] : (v && typeof v == "object" ? AI.num(v.x, 100) : v);
                var sy = (v instanceof Array) ? v[1] : (v && typeof v == "object" ? AI.num(v.y, 100) : v);
                prop.setValueAtTime(t, [sx * fitK, sy * fitK]);
            } else if (name == "positionX" || name == "positionY" || name == "scaleX" || name == "scaleY") {
                cur = prop.valueAtTime(t, false);
                var idx = (name.charAt(name.length - 1) == "X") ? 0 : 1;
                var val = (v instanceof Array) ? v[idx] : v;
                if (name.indexOf("scale") === 0) { val = val * fitK; }
                cur[idx] = val;
                prop.setValueAtTime(t, cur);
            } else {
                var sv = (v instanceof Array) ? v[0] : v;
                prop.setValueAtTime(t, sv);
            }
        }
        AI.ease(prop, AI.easeName(list[0].easing));
    }
};

// Chuyển động ken-burns tự động cho ảnh/footage. m: {type, amount}
AI.motion = function (layer, m, st, dur, fitK) {
    var amt = AI.num(m.amount, 10) / 100;
    var sc = AI.tp(layer, AI.S);
    var pos = AI.tp(layer, AI.P);
    var s0 = sc.value;
    var p0 = pos.value;
    var en = st + dur;
    if (m.type == "pushIn") {
        AI.kf(sc, [[st, s0], [en, AI.mul(s0, 1 + amt)]], "inout");
    } else if (m.type == "pullOut") {
        AI.kf(sc, [[st, AI.mul(s0, 1 + amt)], [en, s0]], "inout");
    } else if (m.type == "panLeft" || m.type == "panRight") {
        var big = AI.mul(s0, 1 + amt);
        sc.setValue(big);
        var shift = AI.W * amt * 0.5;
        var dir = (m.type == "panLeft") ? 1 : -1;
        AI.kf(pos, [[st, [p0[0] + shift * dir, p0[1]]], [en, [p0[0] - shift * dir, p0[1]]]], "inout");
    } else if (m.type == "driftUp") {
        var big2 = AI.mul(s0, 1 + amt);
        sc.setValue(big2);
        var shiftY = AI.H * amt * 0.5;
        AI.kf(pos, [[st, [p0[0], p0[1] + shiftY]], [en, [p0[0], p0[1] - shiftY]]], "inout");
    }
};

// Dừng hình rồi chạy tiếp bằng Time Remap. f: {at, hold} (at tính từ đầu đoạn cắt)
AI.freeze = function (layer, f, t0, srcIn, dur) {
    layer.timeRemapEnabled = true;
    var tr = layer.property("ADBE Time Remapping");
    var hold = AI.num(f.hold, 1);
    var at = Math.min(AI.num(f.at, 0), dur);
    var total = dur + hold;
    var times = [t0, t0 + at, t0 + at + hold, t0 + total];
    var vals = [srcIn, srcIn + at, srcIn + at, srcIn + dur];
    var i;
    for (i = 0; i < times.length; i++) { tr.setValueAtTime(times[i], vals[i]); }
    for (i = tr.numKeys; i >= 1; i--) {
        var kt = tr.keyTime(i);
        var keep = false;
        for (var j = 0; j < times.length; j++) {
            if (Math.abs(kt - times[j]) < 0.0001) { keep = true; }
        }
        if (!keep) { tr.removeKey(i); }
    }
    var idx = tr.nearestKeyIndex(t0 + at);
    try {
        tr.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD);
    } catch (e) { AI.log("freeze hold lỗi: " + e.toString()); }
    layer.outPoint = t0 + total;
    return total;
};

AI.effects = function (layer, effects) {
    for (var i = 0; i < effects.length; i++) {
        var ef = effects[i];
        var mn = AI.EFFECTS[ef.type];
        if (!mn) { continue; }
        var pa = ef.params || {};
        try {
            var e = layer.property("ADBE Effect Parade").addProperty(mn);
            var t = ef.type;
            if (t == "gaussianBlur") { e.property("Blurriness").setValue(AI.num(pa.blurriness, 10)); }
            else if (t == "brightnessContrast") {
                e.property("Brightness").setValue(AI.num(pa.brightness, 0));
                e.property("Contrast").setValue(AI.num(pa.contrast, 0));
            } else if (t == "hueSaturation") {
                e.property("Channel Control").setValue(1);
                if (pa.hue) { e.property("Master Hue").setValue(pa.hue); }
                if (pa.saturation) { e.property("Master Saturation").setValue(pa.saturation); }
                if (pa.lightness) { e.property("Master Lightness").setValue(pa.lightness); }
            } else if (t == "glow") {
                e.property("Glow Threshold").setValue(AI.num(pa.threshold, 60));
                e.property("Glow Radius").setValue(AI.num(pa.radius, 10));
                e.property("Glow Intensity").setValue(AI.num(pa.intensity, 1));
            } else if (t == "dropShadow") {
                e.property("Opacity").setValue(AI.num(pa.opacity, 50));
                e.property("Distance").setValue(AI.num(pa.distance, 5));
                e.property("Softness").setValue(AI.num(pa.softness, 10));
            } else if (t == "fill" && pa.color) {
                e.property("Color").setValue(AI.color(pa.color));
            }
        } catch (err) { AI.log("effect " + ef.type + " lỗi: " + err.toString()); }
    }
};

// Layer thường do AI mô tả. Trả về layer (hoặc null nếu lỗi)
AI.addLayer = function (spec) {
    var t0 = AI.num(spec.startTime, 0);
    var type = spec.type;
    var layer = null;
    var fitK = 1;
    var dur = AI.num(spec.duration, 0);
    var isMedia = (type == "footage" || type == "audio");

    if (isMedia) {
        var item = AI.files[spec.source];
        if (!item) { AI.log("không tìm thấy source: " + spec.source); return null; }
        layer = AI.comp.layers.add(item);
        var srcIn = AI.num(spec.inPoint, 0);
        var still = false;
        try { still = item.mainSource.isStill; } catch (e0) { }
        if (dur <= 0) {
            if (spec.outPoint !== undefined && spec.outPoint !== null) { dur = spec.outPoint - srcIn; }
            else if (still) { dur = AI.comp.duration - t0; }
            else { dur = item.duration - srcIn; }
        }
        if (!still && item.duration > 0) { dur = Math.min(dur, item.duration - srcIn); }
        if (dur <= 0) { dur = 1; }
        layer.startTime = t0 - srcIn;
        layer.inPoint = t0;
        layer.outPoint = t0 + dur;
        if (type == "footage" && item.width > 0 && item.height > 0) {
            var mode = spec.fit;
            var ca = AI.W / AI.H;
            var ia = item.width / item.height;
            if (!mode) { mode = (Math.abs(ia / ca - 1) < 0.25) ? "cover" : "contain"; }
            if (mode == "cover") { fitK = Math.max(AI.W / item.width, AI.H / item.height); }
            else if (mode == "contain") { fitK = Math.min(AI.W / item.width, AI.H / item.height); }
            if (fitK != 1) { AI.tp(layer, AI.S).setValue([100 * fitK, 100 * fitK]); }
        }
    } else if (type == "text") {
        var tx = spec.text || {};
        var just = tx.justification == "left" ? "left" : "center";
        layer = AI.addText(tx.content || "Text", {
            name: spec.name, font: tx.font, size: tx.size || 72, color: tx.color || "text",
            align: just, reveal: tx.reveal == "typewriter" ? "typewriter" : "", start: t0,
            x: spec.position ? AI.num(spec.position.x, AI.W / 2) : AI.W / 2,
            y: spec.position ? AI.num(spec.position.y, AI.H / 2) : AI.H / 2
        });
        if (dur <= 0) { dur = AI.comp.duration - t0; }
        AI.span(layer, t0, dur);
        if (tx.reveal && tx.reveal != "typewriter") { AI.enter(layer, tx.reveal, t0, 0.5); }
    } else if (type == "solid") {
        var so = spec.solid || {};
        layer = AI.comp.layers.addSolid(AI.color(so.color || [0, 0, 0]), spec.name || "Solid", AI.num(so.width, AI.W), AI.num(so.height, AI.H), 1);
        if (dur <= 0) { dur = AI.comp.duration - t0; }
        AI.span(layer, t0, dur);
    } else if (type == "adjustment") {
        layer = AI.comp.layers.addSolid([0, 0, 0], spec.name || "Adjustment", AI.W, AI.H, 1);
        layer.adjustmentLayer = true;
        if (dur <= 0) { dur = AI.comp.duration - t0; }
        AI.span(layer, t0, dur);
    }
    if (!layer) { return null; }
    layer.name = spec.name || layer.name;

    if (spec.position && type != "text") {
        AI.tp(layer, AI.P).setValue([AI.num(spec.position.x, AI.W / 2), AI.num(spec.position.y, AI.H / 2)]);
    }
    if (spec.scale) {
        AI.tp(layer, AI.S).setValue([AI.num(spec.scale.x, 100) * fitK, AI.num(spec.scale.y, 100) * fitK]);
    }
    if (spec.rotation) { AI.tp(layer, AI.R).setValue(spec.rotation); }
    if (spec.opacity !== undefined && spec.opacity !== null && spec.opacity != 100) {
        AI.tp(layer, AI.O).setValue(spec.opacity);
    }
    if (spec.blendingMode && AI.BLEND[spec.blendingMode]) { layer.blendingMode = AI.BLEND[spec.blendingMode]; }

    if (spec.motion && isMedia) { AI.motion(layer, spec.motion, t0, dur, fitK); }
    if (spec.keyframes && spec.keyframes.length > 0) { AI.keyframes(layer, spec.keyframes, t0, fitK); }
    if (spec.effects && spec.effects.length > 0) { AI.effects(layer, spec.effects); }
    if (spec.freeze && type == "footage") {
        try { AI.freeze(layer, spec.freeze, t0, AI.num(spec.inPoint, 0), dur); }
        catch (ef) { AI.log("freeze lỗi: " + ef.toString()); }
    }
    return layer;
};

// ------------------------------------------------------------
// Transition giữa 2 layer. Không dịch thời gian layer: AI đã đặt startTime chồng lấp.
// ------------------------------------------------------------
AI.transition = function (type, from, to, d) {
    var ws = to.inPoint;
    var fo = from.outPoint;
    var W = AI.W;
    var H = AI.H;
    var toOp = AI.tp(to, AI.O);
    var toPos = AI.tp(to, AI.P);
    var toSc = AI.tp(to, AI.S);
    var p0 = toPos.value;
    var s0 = toSc.value;
    if (type == "crossDissolve") {
        AI.kf(toOp, [[ws, 0], [ws + d, 100]], "inout");
        if (fo > ws) { AI.kf(AI.tp(from, AI.O), [[fo - d, 100], [fo, 0]], "inout"); }
    } else if (type == "slideLeft") {
        AI.kf(toPos, [[ws, [p0[0] + W, p0[1]]], [ws + d, p0]], "out");
    } else if (type == "slideRight") {
        AI.kf(toPos, [[ws, [p0[0] - W, p0[1]]], [ws + d, p0]], "out");
    } else if (type == "slideUp") {
        AI.kf(toPos, [[ws, [p0[0], p0[1] + H]], [ws + d, p0]], "out");
    } else if (type == "slideDown") {
        AI.kf(toPos, [[ws, [p0[0], p0[1] - H]], [ws + d, p0]], "out");
    } else if (type == "pushLeft" || type == "pushRight") {
        var dir = (type == "pushLeft") ? 1 : -1;
        var fp = AI.tp(from, AI.P);
        var f0 = fp.value;
        AI.kf(toPos, [[ws, [p0[0] + W * dir, p0[1]]], [ws + d, p0]], "inout");
        AI.kf(fp, [[ws, f0], [ws + d, [f0[0] - W * dir, f0[1]]]], "inout");
    } else if (type == "zoomIn") {
        AI.kf(toSc, [[ws, AI.mul(s0, 0.2)], [ws + d, s0]], "out");
        AI.kf(toOp, [[ws, 0], [ws + d * 0.4, 100]], "out");
    } else if (type == "zoomOut") {
        var fs = AI.tp(from, AI.S);
        var fs0 = fs.value;
        AI.kf(fs, [[fo - d, fs0], [fo, AI.mul(fs0, 2)]], "in");
        AI.kf(AI.tp(from, AI.O), [[fo - d, 100], [fo, 0]], "in");
    } else if (type == "wipeLeft" || type == "wipeRight") {
        try {
            var w = from.property("ADBE Effect Parade").addProperty("ADBE Linear Wipe");
            w.property("Transition Completion").setValueAtTime(fo - d, 0);
            w.property("Transition Completion").setValueAtTime(fo, 100);
            w.property("Wipe Angle").setValue(type == "wipeLeft" ? 90 : 270);
            w.property("Feather").setValue(50);
        } catch (e) { AI.log("wipe lỗi: " + e.toString()); }
    }
};

// ------------------------------------------------------------
// Điều phối: luôn bắt lỗi từng layer/preset để một lỗi không làm hỏng cả project
// ------------------------------------------------------------
AI.run = function (name, params, t0, dur) {
    var fn = AI.presets[name];
    if (!fn) { AI.log("không có preset: " + name); return null; }
    try {
        return fn(params || {}, t0, dur);
    } catch (e) {
        AI.log("preset " + name + " LỖI: " + e.toString() + " (dòng " + e.line + ")");
        return null;
    }
};

AI.runLayer = function (spec) {
    try {
        return AI.addLayer(spec);
    } catch (e) {
        AI.log("layer " + spec.name + " LỖI: " + e.toString() + " (dòng " + e.line + ")");
        return null;
    }
};

AI.runTransition = function (type, from, to, d) {
    if (!from || !to) { return; }
    try { AI.transition(type, from, to, d); }
    catch (e) { AI.log("transition " + type + " LỖI: " + e.toString()); }
};
