/* VectorCraft Bridge: pure conversion helpers. ES3-compatible for ExtendScript. */
var VCABCore = (function () {
    function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }
    function number(v, fallback) { return typeof v === "number" && isFinite(v) ? v : fallback; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function lower(v) { return String(v || "").toLowerCase(); }
    function point(v) {
        if (v && v.length >= 2) return [number(v[0], 0), number(v[1], 0)];
        if (v && typeof v === "object") return [number(v.x, 0), number(v.y, 0)];
        return [0, 0];
    }
    function rgb(color) {
        var m = lower(color && color.model), c, k;
        if (m === "rgb") return [clamp(number(color.r, 0), 0, 1), clamp(number(color.g, 0), 0, 1), clamp(number(color.b, 0), 0, 1)];
        if (m === "gray") { k = clamp(number(color.k, 0), 0, 1); return [1 - k, 1 - k, 1 - k]; }
        if (m === "cmyk") {
            k = clamp(number(color.k, 0), 0, 1);
            return [(1 - clamp(number(color.c, 0), 0, 1)) * (1 - k), (1 - clamp(number(color.m, 0), 0, 1)) * (1 - k), (1 - clamp(number(color.y, 0), 0, 1)) * (1 - k)];
        }
        return [0, 0, 0];
    }
    function artboard(doc, requested) {
        var boards = doc && doc.artboards ? doc.artboards : [];
        if (!boards.length) return { name: "VectorCraft", x: 0, y: 0, width: 1920, height: 1080 };
        if (requested >= 0 && requested < boards.length) return boards[requested];
        var b = doc.selectionBounds, cx, cy, i, a;
        if (b && b.length >= 4) {
            cx = (number(b[0], 0) + number(b[2], 0)) / 2;
            cy = (number(b[1], 0) + number(b[3], 0)) / 2;
            for (i = 0; i < boards.length; i++) {
                a = boards[i];
                if (cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height) return a;
            }
        }
        return boards[0];
    }
    function nodeType(node) { return lower(node && node.kind && node.kind.type); }
    function children(node) {
        var k = node && node.kind;
        if (!k) return [];
        return k.children || k.content || [];
    }
    function subpaths(node) {
        var t = nodeType(node), k = node && node.kind, out = [], i, child;
        if (t === "path" && k.path && k.path.subpaths) return k.path.subpaths;
        if (t === "compound") {
            for (i = 0; i < k.children.length; i++) {
                child = k.children[i];
                if (child.kind && child.kind.path && child.kind.path.subpaths) out = out.concat(child.kind.path.subpaths);
            }
        }
        return out;
    }
    function paintItems(node) {
        return node && node.appearance && node.appearance.items ? node.appearance.items : [];
    }
    function solidPaint(item) {
        var p = item && item.paint;
        return p && lower(p.type) === "solid" && p.color ? { color: rgb(p.color), opacity: clamp(number(item.opacity, 1), 0, 1) * 100 } : null;
    }
    function nodeName(node, fallback) { return node && node.name ? String(node.name) : fallback; }
    function textInfo(node) {
        var k = node && node.kind, runs = k && k.runs ? k.runs : [], text = "", i, first, xf;
        for (i = 0; i < runs.length; i++) text += String(runs[i].text || "");
        first = runs.length ? runs[0].style || {} : {};
        xf = k && k.xf && k.xf.length >= 6 ? k.xf : [1, 0, 0, 1, 0, 0];
        return { text: text, style: first, position: [number(xf[4], 0), number(xf[5], 0)] };
    }
    function stats(nodes) {
        var s = { paths: 0, groups: 0, text: 0, unsupported: 0, gradients: 0, patterns: 0 }, i;
        function walk(n) {
            var t = nodeType(n), ch = children(n), items = paintItems(n), j, pt;
            if (t === "path" || t === "compound") s.paths++;
            else if (t === "group" || t === "layer") s.groups++;
            else if (t === "text") s.text++;
            else s.unsupported++;
            for (j = 0; j < items.length; j++) {
                pt = lower(items[j].paint && items[j].paint.type);
                if (pt === "gradient") s.gradients++;
                if (pt === "pattern") s.patterns++;
            }
            for (j = 0; j < ch.length; j++) walk(ch[j]);
        }
        for (i = 0; i < nodes.length; i++) walk(nodes[i]);
        return s;
    }
    return {
        own: own, number: number, clamp: clamp, lower: lower, point: point, rgb: rgb,
        artboard: artboard, nodeType: nodeType, children: children, subpaths: subpaths,
        paintItems: paintItems, solidPaint: solidPaint, nodeName: nodeName, textInfo: textInfo, stats: stats
    };
}());
