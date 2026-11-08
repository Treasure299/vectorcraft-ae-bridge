import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = await readFile(path.join(root, "src", "core.js"), "utf8");
const panel = await readFile(path.join(root, "src", "panel.jsx"), "utf8");
const out = path.join(root, "dist");
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "VectorCraft Bridge.jsx"), `${core}\n\n${panel}\n`, "utf8");
console.log(path.join(out, "VectorCraft Bridge.jsx"));
