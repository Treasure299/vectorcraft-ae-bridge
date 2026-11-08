/* VectorCraft Bridge for After Effects 26.5. Original implementation. */
(function vectorCraftBridge(thisObj) {
    var C = VCABCore;
    var SECTION = "VectorCraft Bridge";
    var VERSION = "0.3.1";
    var serial = 0;

    function setting(name, fallback) {
        try { if (app.settings.haveSetting(SECTION, name)) return app.settings.getSetting(SECTION, name); } catch (ignore) {}
        return fallback;
    }
    function saveSetting(name, value) { try { app.settings.saveSetting(SECTION, name, String(value)); } catch (ignore) {} }
    function fail(message) { throw new Error(message); }
    function activeComp() {
        var c = app.project && app.project.activeItem;
        if (!(c instanceof CompItem)) fail("Open an After Effects composition, or click New Comp.");
        return c;
    }
    function rpc(port, command, params) {
        var socket, id, request, line, reply, attempts, matched;
        try { socket = new Socket(); } catch (e) { fail("Enable Preferences > Scripting & Expressions > Allow Scripts to Write Files and Access Network."); }
        socket.timeout = 60;
        try {
            if (!socket.open("127.0.0.1:" + port, "UTF-8")) fail("VectorCraft is offline. Restart it after installing the bridge, then try Connect.");
            id = ++serial;
            // VectorCraft's control protocol requires exactly one JSON object per
            // physical line. Some AE ExtendScript builds serialize an empty object
            // with literal CR/LF characters, so normalize the complete request.
            request = JSON.stringify({ id: id, method: "engine.execute", params: { command: command, params: params || {} } }).replace(/[\r\n]+/g, "");
            if (!socket.writeln(request)) fail("Could not send a command to VectorCraft.");
            matched = false;
            // VectorCraft may publish notifications on the connection before the
            // command response (clipboard changes are one example). Ignore those
            // packets and keep reading for this request's response.
            for (attempts = 0; attempts < 100; attempts++) {
                line = socket.readln();
                if (!line) fail("VectorCraft did not reply to " + command + ".");
                reply = JSON.parse(line);
                if (String(reply.id) === String(id)) { matched = true; break; }
                // Some VectorCraft builds omit the id on a response sent over a
                // dedicated single-request socket. An id-less packet with an `ok`
                // flag is a response; id-less event packets do not have that flag.
                if ((reply.id === undefined || reply.id === null) && typeof reply.ok === "boolean") { matched = true; break; }
            }
            if (!matched) fail("VectorCraft sent too many unrelated notifications while running " + command + ".");
            if (!reply.ok) fail(reply.error || "VectorCraft rejected the command.");
            return reply.result;
        } finally { try { if (socket) socket.close(); } catch (ignore) {} }
    }
    function readSelection(port) {
        var doc = rpc(port, "document.inspect", { depth: 0 }), ids = doc.selection || [], nodes = [], i, after;
        if (!ids.length) fail("Select artwork in VectorCraft first.");
        if (ids.length > 250) fail("Select at most 250 top-level objects per transfer.");
        for (i = 0; i < ids.length; i++) nodes.push(rpc(port, "document.node", { id: ids[i] }));
        after = rpc(port, "document.inspect", { depth: 0 });
        if (after.revision !== doc.revision || after.uid !== doc.uid) fail("VectorCraft changed while the selection was being read. Try again.");
        return { doc: doc, nodes: nodes };
    }
    function compPoint(v, board, offset) {
        v = C.point(v);
        return [v[0] - C.number(board.x, 0) + offset[0], v[1] - C.number(board.y, 0) + offset[1]];
    }
    function makeShape(sub, board, offset) {
        var shape = new Shape(), anchors = sub.anchors || [], vertices = [], inTangents = [], outTangents = [], i, a, p, hin, hout;
        if (typeof anchors.length !== "number" || anchors.length < 1) return null;
        for (i = 0; i < anchors.length; i++) {
            if (!anchors[i] || !anchors[i].p) continue;
            a = anchors[i]; p = compPoint(a.p, board, offset);
            hin = compPoint(a["in"] || a.p, board, offset); hout = compPoint(a.out || a.p, board, offset);
            vertices.push(p);
            inTangents.push([hin[0] - p[0], hin[1] - p[1]]);
            outTangents.push([hout[0] - p[0], hout[1] - p[1]]);
        }
        if (!vertices.length) return null;
        shape.vertices = vertices;
        shape.inTangents = inTangents;
        shape.outTangents = outTangents;
        shape.closed = !!sub.closed;
        return shape;
    }
    function addPathOperators(contents, node, board, offset, report) {
        var paths = C.subpaths(node), i, p, prop, shape;
        for (i = 0; i < paths.length; i++) {
            if (!paths[i] || !paths[i].anchors || typeof paths[i].anchors.length !== "number" || paths[i].anchors.length < 1) { report.emptyPaths++; continue; }
            shape = makeShape(paths[i], board, offset);
            if (!shape) { report.emptyPaths++; continue; }
            p = contents.addProperty("ADBE Vector Shape - Group");
            p.name = paths.length > 1 ? "Path " + (i + 1) : "Path";
            prop = p.property("ADBE Vector Shape");
            prop.setValue(shape);
            report.paths++;
        }
    }
    function addFill(contents, item, report) {
        var solid = C.solidPaint(item), fill;
        if (!item.visible) return;
        if (!solid) { report.unsupportedPaint++; return; }
        fill = contents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue(solid.color);
        fill.property("ADBE Vector Fill Opacity").setValue(solid.opacity);
        report.fills++;
    }
    function addStroke(contents, item, report) {
        var solid = C.solidPaint(item), stroke, cap, join, dash, dashes;
        if (!item.visible) return;
        if (!solid) { report.unsupportedPaint++; return; }
        stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").setValue(solid.color);
        stroke.property("ADBE Vector Stroke Opacity").setValue(solid.opacity);
        stroke.property("ADBE Vector Stroke Width").setValue(Math.max(0, C.number(item.width, 1)));
        cap = C.lower(item.cap); join = C.lower(item.join);
        try { stroke.property("ADBE Vector Stroke Line Cap").setValue(cap === "round" ? 2 : cap === "square" ? 3 : 1); } catch (ignore1) {}
        try { stroke.property("ADBE Vector Stroke Line Join").setValue(join === "round" ? 2 : join === "bevel" ? 3 : 1); } catch (ignore2) {}
        try { stroke.property("ADBE Vector Stroke Miter Limit").setValue(Math.max(1, C.number(item.miter_limit, 10))); } catch (ignore3) {}
        dash = item.dash;
        if (dash && dash.values && dash.values.length) {
            try {
                dashes = stroke.property("ADBE Vector Stroke Dashes");
                dashes.addProperty("ADBE Vector Stroke Dash 1").setValue(Math.max(0, C.number(dash.values[0], 0)));
                if (dash.values.length > 1) dashes.addProperty("ADBE Vector Stroke Gap 1").setValue(Math.max(0, C.number(dash.values[1], 0)));
                if (dash.offset) dashes.property("ADBE Vector Stroke Offset").setValue(C.number(dash.offset, 0));
            } catch (ignore4) { report.warnings.push("One dashed stroke was simplified."); }
        }
        report.strokes++;
    }
    function addAppearance(contents, node, report) {
        var items = C.paintItems(node), i, kind;
        for (i = 0; i < items.length; i++) {
            kind = C.lower(items[i].kind);
            if (kind === "fill") addFill(contents, items[i], report);
            else if (kind === "stroke") addStroke(contents, items[i], report);
        }
    }
    function setGroupOpacity(group, node) {
        var t;
        if (node.opacity === undefined) return;
        try { t = group.property("ADBE Vector Transform Group"); t.property("ADBE Vector Group Opacity").setValue(C.clamp(C.number(node.opacity, 1), 0, 1) * 100); } catch (ignore) {}
    }
    function addVectorNode(parentContents, node, board, offset, report) {
        var type = C.nodeType(node), group, contents, ch, i;
        if (node.visible === false) return;
        if (type === "path" || type === "compound") {
            group = parentContents.addProperty("ADBE Vector Group");
            group.name = C.nodeName(node, type === "compound" ? "Compound Path" : "Path");
            contents = group.property("ADBE Vectors Group");
            addPathOperators(contents, node, board, offset, report);
            addAppearance(contents, node, report);
            setGroupOpacity(group, node);
            return;
        }
        if (type === "group" || type === "layer") {
            group = parentContents.addProperty("ADBE Vector Group");
            group.name = C.nodeName(node, type === "layer" ? "Layer" : "Group");
            contents = group.property("ADBE Vectors Group");
            ch = C.children(node);
            for (i = ch.length - 1; i >= 0; i--) addVectorNode(contents, ch[i], board, offset, report);
            setGroupOpacity(group, node);
            report.groups++;
            return;
        }
        report.unsupported++;
    }
    function addTextLayer(comp, node, board, offset, report) {
        var info = C.textInfo(node), layer, doc, color, p;
        if (!info.text) { report.unsupported++; return null; }
        layer = comp.layers.addText(info.text);
        layer.name = C.nodeName(node, info.text.substring(0, 48));
        try {
            doc = layer.property("ADBE Text Properties").property("ADBE Text Document").value;
            if (info.style.size) doc.fontSize = info.style.size;
            if (info.style.tracking !== undefined) doc.tracking = info.style.tracking;
            if (info.style.leading) { doc.autoLeading = false; doc.leading = info.style.leading; }
            color = info.style.fill && C.lower(info.style.fill.type) === "solid" ? C.rgb(info.style.fill.color) : null;
            if (color) { doc.applyFill = true; doc.fillColor = color; }
            layer.property("ADBE Text Properties").property("ADBE Text Document").setValue(doc);
        } catch (ignore) { report.warnings.push("Text styling was partially simplified."); }
        p = compPoint(info.position, board, offset);
        layer.property("ADBE Transform Group").property("ADBE Position").setValue(p);
        if (node.opacity !== undefined) layer.property("ADBE Transform Group").property("ADBE Opacity").setValue(C.clamp(C.number(node.opacity, 1), 0, 1) * 100);
        report.text++;
        return layer;
    }
    function prepareShapeLayer(comp, name) {
        var l = comp.layers.addShape(), t = l.property("ADBE Transform Group");
        l.name = name || "VectorCraft";
        t.property("ADBE Anchor Point").setValue([0, 0]);
        t.property("ADBE Position").setValue([0, 0]);
        return l;
    }
    function assetFolder(createIfMissing) {
        var custom = setting("assetFolder", ""), folder;
        if (custom) {
            folder = new Folder(custom);
        } else {
            if (!(app.project && app.project.file)) fail("Save the After Effects project first, or choose a custom Assets Folder.");
            folder = new Folder(app.project.file.parent.fsName + "/VectorCraft Bridge Assets");
        }
        if (createIfMissing && !folder.exists && !folder.create()) fail("Could not create the raster asset folder: " + folder.fsName);
        return folder;
    }
    function stamp() {
        var d = new Date();
        function pad(v, n) { v = String(v); while (v.length < n) v = "0" + v; return v; }
        return d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2) + "_" + pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2) + "_" + pad(d.getMilliseconds(), 3);
    }
    function nextRasterFile() {
        return new File(assetFolder(true).fsName + "/VectorCraft_" + stamp() + ".png");
    }
    function rasterTransfer(port, comp, options) {
        var doc = rpc(port, "document.inspect", { depth: 0 }), board, result, file, footage, layer, t, bounds, scale = 2, offset;
        if (!doc.selection || !doc.selection.length) fail("Select artwork in VectorCraft first.");
        board = C.artboard(doc, options.artboard);
        // Supplying an explicit path makes exportSelection non-interactive and lets
        // VectorCraft write the PNG directly. This avoids moving a large Base64
        // string through ExtendScript and decoding it byte by byte in After Effects.
        file = nextRasterFile();
        result = rpc(port, "document.exportSelection", { path: file.fsName, format: "png", scale: scale, background: "transparent", antiAlias: "art" });
        file = new File(file.fsName);
        if (!file.exists || file.length < 1) fail("VectorCraft did not create the PNG asset.");
        try {
            footage = app.project.importFile(new ImportOptions(file));
            layer = comp.layers.add(footage);
            layer.name = "VectorCraft Raster";
            t = layer.property("ADBE Transform Group");
            t.property("ADBE Anchor Point").setValue([0, 0]);
            bounds = doc.selectionBounds || [board.x, board.y, footage.width / scale, footage.height / scale];
            offset = options.center ? [(comp.width - board.width) / 2, (comp.height - board.height) / 2] : [0, 0];
            t.property("ADBE Position").setValue([C.number(bounds[0], board.x) - board.x + offset[0], C.number(bounds[1], board.y) - board.y + offset[1]]);
            t.property("ADBE Scale").setValue([100 / scale, 100 / scale]);
            layer.comment = JSON.stringify({ bridge: "VectorCraft Bridge", version: VERSION, mode: "rasterized", document: doc.uid, revision: doc.revision, ids: doc.selection, asset: file.fsName });
        } catch (e) {
            try { if (layer) layer.remove(); } catch (ignore1) {}
            try { if (footage) footage.remove(); } catch (ignore2) {}
            throw e;
        }
        return { layers: 1, paths: 0, groups: 0, fills: 0, strokes: 0, text: 0, unsupported: 0, unsupportedPaint: 0, emptyPaths: 0, rasterized: true, selectedCount: doc.selection.length, warnings: result.warnings || [] };
    }
    function transfer(snapshot, comp, options) {
        var board = C.artboard(snapshot.doc, options.artboard), offset = options.center ? [(comp.width - board.width) / 2, (comp.height - board.height) / 2] : [0, 0];
        var report = { layers: 0, paths: 0, groups: 0, fills: 0, strokes: 0, text: 0, unsupported: 0, unsupportedPaint: 0, emptyPaths: 0, rasterized: false, warnings: [] };
        var nodes = snapshot.nodes, layer, root, i, type, metadata;
        if (options.mode === "combined") {
            layer = prepareShapeLayer(comp, "VectorCraft · " + (board.name || "Artwork"));
            root = layer.property("ADBE Root Vectors Group");
            for (i = nodes.length - 1; i >= 0; i--) {
                type = C.nodeType(nodes[i]);
                if (type === "text") { report.unsupported++; continue; }
                addVectorNode(root, nodes[i], board, offset, report);
            }
            metadata = { bridge: "VectorCraft Bridge", version: VERSION, document: snapshot.doc.uid, revision: snapshot.doc.revision, ids: snapshot.doc.selection };
            layer.comment = JSON.stringify(metadata);
            report.layers++;
        } else {
            for (i = nodes.length - 1; i >= 0; i--) {
                type = C.nodeType(nodes[i]);
                if (type === "text") {
                    layer = addTextLayer(comp, nodes[i], board, offset, report);
                    if (layer) { layer.comment = JSON.stringify({ bridge: "VectorCraft Bridge", version: VERSION, document: snapshot.doc.uid, id: nodes[i].id }); report.layers++; }
                } else {
                    layer = prepareShapeLayer(comp, C.nodeName(nodes[i], "VectorCraft " + nodes[i].id));
                    addVectorNode(layer.property("ADBE Root Vectors Group"), nodes[i], board, offset, report);
                    layer.comment = JSON.stringify({ bridge: "VectorCraft Bridge", version: VERSION, document: snapshot.doc.uid, id: nodes[i].id });
                    report.layers++;
                }
            }
        }
        return report;
    }
    function reportText(r) {
        if (r.rasterized) {
            var rasterMsg = "Created one combined transparent PNG layer from " + r.selectedCount + " selected object" + (r.selectedCount === 1 ? "" : "s") + ".";
            if (r.selectedCount === 1) rasterMsg += " Select or group separate backdrop/shadow objects too if they are part of the style.";
            return rasterMsg + (r.warnings && r.warnings.length ? " VectorCraft: " + r.warnings[0] : "");
        }
        var msg = "Created " + r.layers + " layer" + (r.layers === 1 ? "" : "s") + ", " + r.paths + " path" + (r.paths === 1 ? "" : "s") + ".";
        if (r.unsupported || r.unsupportedPaint) msg += " Simplified/skipped " + (r.unsupported + r.unsupportedPaint) + " unsupported item" + ((r.unsupported + r.unsupportedPaint) === 1 ? "" : "s") + ".";
        if (r.emptyPaths) msg += " Skipped " + r.emptyPaths + " empty path" + (r.emptyPaths === 1 ? "" : "s") + ".";
        return msg;
    }
    function buildUI() {
        var win = thisObj instanceof Panel ? thisObj : new Window("palette", "VectorCraft Bridge", undefined, { resizeable: true });
        var root = win.add("group"), row1, row2, row3, assetRow, versionLabel, status, branding, port, mode, center, artboard, connect, newComp, push, rasterPush, openAssets, chooseAssets;
        root.orientation = "column"; root.alignChildren = ["fill", "top"]; root.margins = 10; root.spacing = 7;
        versionLabel = root.add("statictext", undefined, "VectorCraft Bridge v" + VERSION);
        row1 = root.add("group"); row1.add("statictext", undefined, "Port");
        port = row1.add("edittext", undefined, setting("port", "7979")); port.characters = 7;
        connect = row1.add("button", undefined, "Connect");
        row2 = root.add("group"); row2.add("statictext", undefined, "Layers");
        mode = row2.add("dropdownlist", undefined, ["Separate", "Combined"]);
        mode.selection = setting("mode", "separate") === "combined" ? 1 : 0;
        center = row2.add("checkbox", undefined, "Center in comp"); center.value = setting("center", "false") === "true";
        row3 = root.add("group");
        newComp = row3.add("button", undefined, "New Comp");
        push = row3.add("button", undefined, "Push Editable"); push.preferredSize.width = 140;
        rasterPush = root.add("button", undefined, "Push Rasterized PNG (one layer)");
        rasterPush.alignment = ["fill", "top"];
        assetRow = root.add("group"); assetRow.alignment = ["fill", "top"]; assetRow.alignChildren = ["fill", "center"];
        openAssets = assetRow.add("button", undefined, "Open Assets Folder");
        chooseAssets = assetRow.add("button", undefined, "Choose Assets Folder");
        status = root.add("statictext", undefined, "Restart VectorCraft once after installation.", { multiline: true }); status.minimumSize.height = 38;
        branding = root.add("statictext", undefined, "BUILT BY VAULTR"); branding.alignment = ["fill", "top"]; branding.justify = "center";
        function getPort() { var p = parseInt(port.text, 10); if (!(p >= 1024 && p <= 65535)) fail("Port must be between 1024 and 65535."); return p; }
        function setStatus(text) { status.text = text; status.helpTip = text; win.layout.layout(true); }
        connect.onClick = function () {
            try { var d = rpc(getPort(), "document.inspect", { depth: 0 }); saveSetting("port", port.text); setStatus("Connected · " + (d.title || "Untitled") + " · " + (d.selection || []).length + " selected"); }
            catch (e) { setStatus("Error: " + e.message); }
        };
        newComp.onClick = function () {
            try {
                var snap = readSelection(getPort()), b = C.artboard(snap.doc, -1), c;
                app.beginUndoGroup("VectorCraft Bridge · New Comp");
                try { c = app.project.items.addComp(b.name || "VectorCraft", Math.max(1, Math.round(b.width)), Math.max(1, Math.round(b.height)), 1, 10, 30); c.openInViewer(); }
                finally { app.endUndoGroup(); }
                setStatus("Created " + c.name + " (" + c.width + " × " + c.height + ").");
            } catch (e) { setStatus("Error: " + e.message); }
        };
        push.onClick = function () {
            try {
                var p = getPort(), snap, comp = activeComp(), options, r;
                options = { mode: mode.selection.index === 1 ? "combined" : "separate", center: center.value, artboard: -1 };
                saveSetting("port", p); saveSetting("mode", options.mode); saveSetting("center", center.value);
                app.beginUndoGroup("VectorCraft Bridge · Push");
                try { snap = readSelection(p); r = transfer(snap, comp, options); } finally { app.endUndoGroup(); }
                setStatus(reportText(r));
            } catch (e) { setStatus("Error: " + e.message); }
        };
        rasterPush.onClick = function () {
            try {
                var p = getPort(), comp = activeComp(), options = { mode: "rasterized", center: center.value, artboard: -1 }, r;
                saveSetting("port", p); saveSetting("center", center.value);
                app.beginUndoGroup("VectorCraft Bridge · Push Rasterized");
                try { r = rasterTransfer(p, comp, options); } finally { app.endUndoGroup(); }
                setStatus(reportText(r));
            } catch (e) { setStatus("Error: " + e.message); }
        };
        openAssets.onClick = function () {
            try {
                var folder = assetFolder(true);
                if (!folder.execute()) fail("Could not open the Assets Folder: " + folder.fsName);
                setStatus("Assets Folder: " + folder.fsName);
            } catch (e) { setStatus("Error: " + e.message); }
        };
        chooseAssets.onClick = function () {
            try {
                var folder = Folder.selectDialog("Choose where VectorCraft Bridge should save raster assets");
                if (!folder) { setStatus("Assets Folder unchanged."); return; }
                saveSetting("assetFolder", folder.fsName);
                setStatus("Assets Folder changed to: " + folder.fsName);
            } catch (e) { setStatus("Error: " + e.message); }
        };
        win.onResizing = win.onResize = function () { this.layout.resize(); };
        if (win instanceof Window) { win.center(); win.show(); } else { win.layout.layout(true); }
        return win;
    }
    buildUI();
}(this));
