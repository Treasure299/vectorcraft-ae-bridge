# VectorCraft Bridge for After Effects

An original, dockable After Effects 26.5 ScriptUI panel that transfers the current VectorCraft selection into editable After Effects layers. It communicates locally with VectorCraft's documented JSON control channel; no cloud service or background daemon is used.

## Current support

- Bézier and compound paths with editable vertices and tangents
- Nested groups
- Solid RGB, CMYK, and gray fills and strokes
- Stroke width, caps, joins, miter limit, and a basic dash pair
- Object opacity
- Basic live text transfer
- Separate-layer and combined-layer modes
- One-layer transparent PNG rasterization for complex appearances and effects
- Project-local raster assets by default (`VectorCraft Bridge Assets` beside the saved `.aep`)
- Buttons to open the active assets folder or choose a persistent custom folder
- Artboard-relative coordinates and optional composition centering
- Persistent source metadata in After Effects layer comments

Gradients, patterns, images, clipping masks, live effects, and advanced text runs can be preserved visually with **Rasterized PNG** mode. They are reported as unsupported in editable modes rather than silently approximated. Reverse transfer is not included yet.

## Install

1. Close or save work in VectorCraft and After Effects.
2. Run `npm run verify` in this folder.
3. Run `powershell -ExecutionPolicy Bypass -File .\Install.ps1`.
4. Restart VectorCraft and After Effects.
5. In After Effects, enable **Preferences > Scripting & Expressions > Allow Scripts to Write Files and Access Network**.
6. Open **Window > VectorCraft Bridge.jsx**.

Select artwork in VectorCraft, open an AE composition, and click **Push Selection**. **New Comp** creates a composition matching the selected artwork's artboard.

Raster pushes are saved in a **VectorCraft Bridge Assets** folder beside the saved After Effects project. Use **Open Assets Folder** to reveal it or **Choose Assets Folder** to use another location. Unsaved AE projects must be saved first unless a custom assets folder has been chosen.

Built by **VAULTR**.

## Development

The source is deliberately independent of Effect Master. `src/core.js` contains pure VectorCraft-schema helpers; `src/panel.jsx` contains the After Effects adapter and UI. `npm run build` combines them into the single installable panel in `dist/`.
