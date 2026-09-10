# Brush resize change log

This log records the narrow brush-resize investigation and implementation. It tracks each attempted modification and the measured result so resize behavior can be reviewed without altering the source Ball.json fixture.

## Baseline (before this turn)

- Existing multipoint brush resize remapped centerline points into the new selection bounds but left `size` unchanged. For the giant Ball marks (`size: 200`), a frame-20 selection height of `208.123791` resized to `104.061896` still had an approximately `204.0619` px selection/bounding height because the brush thickness was not scaled.
- Repeated single-dot resizes reset `sx`/`sy` from the current drag ratio instead of accumulating the prior scale.
- Existing files use `sx: 1` and `sy: 1` for ordinary brush strokes and must remain visually unchanged.
- The eraser log was consulted. Its accepted per-object isolated-hole renderer was preserved; no refused aggregate or shared-target hole renderer was repeated.
- Status: baseline accepted as the behavior to replace.

## Attempt 1 — persistent anisotropic brush scales (implemented)

- Modification: reuse existing `sx`/`sy` fields as persistent brush-thickness scales. During a multipoint `type: "brush"` resize, centerline points continue to map to the new bounds while `sx` and `sy` accumulate the same horizontal and vertical factors. Single-dot resizes multiply the drag-start scales so repeated resizes accumulate.
- Rendering: brush paths use a transformed context for the scaled line width, with inverse-transformed path coordinates so the centerline remains in canvas space. Existing `sx: 1`, `sy: 1` follows the original path unchanged.
- Bounds/hit/eraser: scaled brush padding is reflected in bounds; selection and eraser broad-phase checks include the anisotropic scale. Existing eraser holes remain canvas-space and are applied after isolated object rendering.
- Export: SVG uses the equivalent inverse-point path plus anisotropic group transform; PNG/frame/video exports use the shared canvas renderer.
- Status: implemented; focused validation passed. Root review accepted the representation, with portable/full-suite verification pending at this point.

## Attempt 1 measurements

- Import/render regression: all 34 Ball frames retained their original rendered pixel hashes before and after the change, including the portable `file://` build. Ball.json SHA-256 remained `c12959947ab5932fc3e5561ef310f6bec97b53107697b861567ec30a401effa0`.
- Direct `onDown`/`onMove`/`onUp` checks on giant Ball frames: frame 20 selection/bounding height `208.123791 → 104.061896 → 52.030948`; frames 21–23 also reached half then quarter bounds. Portable top-handle selection/bounding heights for frames 20–23 measured `104.061896`, `101.740812`, `103.481624`, and `100.580271` px respectively.
- Real browser mouse top-handle resize on the Ball geometry measured selection/bounding height `203.481625 → 101.740812`; undo restored the original JSON, redo restored the resized JSON, duplicate frame retained both dimensions, and browser reload retained both duplicated strokes.
- Direct handler resize on the single-dot frame measured selection/bounding height `59 → 29.5 → 14.75` px.
- Resized/anisotropically translated Ball geometry remained selectable; a 10 px eraser changed the targeted opaque and 0.3-opacity pixels with zero changed pixels outside the requested radius-plus-antialias footprint.
- Focused `brush-resize.spec.js`: 10/10 Chromium + WebKit tests passed, covering an actual Ball-shaped mark, nonuniform thickness, repeated multipoint and single-dot resizes, hit/eraser holes, SVG export, and top-handle undo/redo/duplicate/reload persistence.
- Existing suite: Chromium + WebKit 94 passed, 2 intentional skips; including the focused regressions, the combined run was 104 passed, 2 intentional skips. Firefox remains unavailable in the environment.
- Build: `npm run build` and `npm run build:portable` passed.
- Status: accepted by root for user local review. No deployment approval is implied.
