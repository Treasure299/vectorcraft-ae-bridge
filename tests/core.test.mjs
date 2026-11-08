import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/core.js", import.meta.url), "utf8");
const panelSource = await readFile(new URL("../src/panel.jsx", import.meta.url), "utf8");
const context = { isFinite, Object, Math, String };
vm.runInNewContext(source, context);
const C = context.VCABCore;

test("converts VectorCraft colors", () => {
  assert.deepEqual(Array.from(C.rgb({ model: "rgb", r: 0.2, g: 0.4, b: 0.6 })), [0.2, 0.4, 0.6]);
  assert.deepEqual(Array.from(C.rgb({ model: "gray", k: 0.25 })), [0.75, 0.75, 0.75]);
  assert.deepEqual(Array.from(C.rgb({ model: "cmyk", c: 1, m: 0, y: 0, k: 0.2 })), [0, 0.8, 0.8]);
});

test("chooses the artboard containing the selection center", () => {
  const doc = { selectionBounds: [110, 10, 130, 30], artboards: [
    { name: "A", x: 0, y: 0, width: 100, height: 100 },
    { name: "B", x: 100, y: 0, width: 100, height: 100 }
  ] };
  assert.equal(C.artboard(doc, -1).name, "B");
});

test("extracts subpaths and reports unsupported paint", () => {
  const path = { id: 1, kind: { type: "path", path: { subpaths: [{ closed: true, anchors: [{ p: [0, 0] }, { p: [10, 0] }] }] } }, appearance: { items: [
    { kind: "fill", paint: { type: "solid", color: { model: "rgb", r: 1, g: 0, b: 0 } } },
    { kind: "stroke", paint: { type: "gradient", gradient: { kind: "linear" } } }
  ] } };
  assert.equal(C.subpaths(path).length, 1);
  assert.equal(C.stats([path]).paths, 1);
  assert.equal(C.stats([path]).gradients, 1);
  assert.deepEqual(Array.from(C.solidPaint(path.appearance.items[0]).color), [1, 0, 0]);
});

test("reads basic text data", () => {
  const node = { kind: { type: "text", xf: [1, 0, 0, 1, 25, 40], runs: [
    { text: "Hello ", style: { size: 20 } }, { text: "world", style: { size: 20 } }
  ] } };
  const info = C.textInfo(node);
  assert.equal(info.text, "Hello world");
  assert.deepEqual(Array.from(info.position), [25, 40]);
});

test("raster transfer exports directly to disk without Base64 decoding", () => {
  assert.match(panelSource, /rpc\(port, "document\.exportSelection", \{ path: file\.fsName/);
  assert.doesNotMatch(panelSource, /rpc\(port, "clipboard\.exportPng"/);
  assert.doesNotMatch(panelSource, /function decodeBase64/);
  assert.match(panelSource, /selectedCount: doc\.selection\.length/);
  assert.match(panelSource, /Select or group separate backdrop\/shadow objects too/);
});

test("RPC skips notifications and compares reply ids by their wire value", () => {
  assert.match(panelSource, /String\(reply\.id\) === String\(id\)/);
  assert.match(panelSource, /attempts < 100/);
  assert.match(panelSource, /typeof reply\.ok === "boolean"/);
  assert.doesNotMatch(panelSource, /reply\.id !== id/);
});

test("RPC normalizes requests to VectorCraft's one-line JSON protocol", () => {
  assert.match(panelSource, /JSON\.stringify\([\s\S]*?\)\.replace\(\/\[\\r\\n\]\+\/g, ""\)/);
});

test("asset controls default beside the project and support a persistent custom folder", () => {
  assert.match(panelSource, /app\.project\.file\.parent\.fsName \+ "\/VectorCraft Bridge Assets"/);
  assert.match(panelSource, /setting\("assetFolder", ""\)/);
  assert.match(panelSource, /saveSetting\("assetFolder", folder\.fsName\)/);
  assert.match(panelSource, /"Open Assets Folder"/);
  assert.match(panelSource, /"Choose Assets Folder"/);
  assert.match(panelSource, /"BUILT BY VAULTR"/);
});
