# Eraser change log

This log records the narrow eraser investigation and implementation attempts. It is kept with the source so each change can be reviewed against measured behavior.

## Baseline (before this turn)

- Existing behavior: non-filled strokes are split and whole stored segments are removed when their centerline is within the eraser radius plus the stroke radius.
- Prior diagnostic recorded in the task: a 10 px eraser applied to a sparse 40 px brush changed 9,206 pixels outside the requested footprint at opacity 1.0 and 9,204 pixels at opacity 0.3. A separate mask diagnostic produced 0 pixels outside the footprint.
- Existing filled-shape holes were already present; this change does not repeat that approach as a solution for ordinary strokes.
- Status: baseline accepted as the behavior to replace, not as a proposed fix.

## Attempt 1 — superseded

- Modification: keep affected strokes intact and attach the eraser's exact swept circular path as a `holes` entry. Render that hole with `destination-out` after drawing the stroke. Text uses the same hole path after its fill is drawn.
- Intended result: the selected eraser diameter controls the removed footprint; thick or translucent strokes no longer cause their whole stored segments to disappear.
- Measurement: to be recorded after the focused pixel tests run.
- Acceptance: superseded by the renderer review below; this intermediate implementation is not accepted as the final form.

## Attempt 1 review — refused

- Refused modification: applying all stored holes once after an entire rendered layer.
- Reason: the aggregate pass cannot preserve artwork that is drawn later over an earlier erased object, can clear content from the wrong compositing layer, and does not preserve onion-skin composition semantics.
- Measurement: not accepted for testing; no result is recorded as a product measurement.
- Status: refused. Do not repeat this renderer-wide approach.

## Earlier draft review — refused

- Refused modification: punching holes directly into the shared render target from each object renderer.
- Reason: direct `destination-out` on the shared target could clear artwork belonging to another object or layer, and text holes were evaluated in a transformed context.
- Status: refused. Replaced by per-object isolated rendering.

## Attempt 2 — accepted by root

- Modification: isolate each object with holes in a reusable transparent canvas, subtract its stored eraser footprint there, and composite the isolated result back with `source-over`. This preserves artwork underneath and later artwork while keeping the hole size exact.
- Measured focused result: sparse 80 px strokes erased with a 20 px eraser produced 0 changed pixels outside an 11 px swept footprint at opacity 1.0 and 0.3; stroke point counts stayed unchanged. Focused eraser suite: 4/4 passed.
- Root review measurements still pending fixes: a 10 px click on a plain 0.3 opacity stroke produced 0 outside-footprint changes and cleared the center (77 to 0); a rotated 40 px stroke was not erased at the hit location; a symmetric stroke erased an extra mirrored location (90 pixels outside the requested footprint).
- Follow-up modification: object-angle hit testing now inverse-rotates the eraser segment for collision checks, while the stored hole remains in canvas coordinates. Mirrored holes are no longer created automatically; a symmetric drawing is erased only where the cursor passes.
- Follow-up measurement: rotated center pixel changed from opaque to transparent, and the mirrored pixel remained byte-for-byte unchanged. The focused eraser suite is now 5/5 passing.
- Additional modification: collision uses the mirrored brush geometry when symmetry is enabled; single-point hit radius includes the point's existing scale. Group eraser segments are inverse-rotated for child collision checks while the stored hole remains in canvas coordinates.
- Additional modification: existing selection transforms now carry holes through move, rotate, resize, align, and paste using the same deltas/scales already applied to the artwork. Group children are isolated individually so a later overdraw remains visible.
- Additional measurements: erasing then moving restored the old location and kept the moved hole; overdraw remained visible after grouping; text stayed as one object with one hole; 1 px and 2 px holes measured diameters 1 and 2 with 0 outside-footprint changes. Focused eraser suite: 8/8 passing.
- Root blocker measurements that prompted the follow-up: right-side symmetric hit previously left alpha 77 unchanged; a scaled dot (`sx=4`, `sy=2`) previously left alpha 77 unchanged; both now pass the expanded collision checks.
- Root verification after the follow-up: mirrored-right, scaled-dot, and 90° group cases each changed the target alpha from 77 to 0 with zero pixels changed outside the requested radius plus one. A 2 px eraser edge pixel changed from 77 to 18 from normal antialiasing, with 0 outside-footprint changes.
- Final local verification: `npm test` passed with no unit files; portable build passed; full Chromium suite passed 47/47.
- Status: accepted by root for user review. No deployment approval is implied.

## Attempt 3 — accepted by root

- Modification: use the same inverse-rotation containment check for filled shape interiors, including mirrored filled brush geometry.
- Measurement: the rotated filled rectangle interior eraser regression passed; root independently measured target alpha 77 to 0 with the requested footprint.
- Validation: focused filled-shape tests passed 2/2; portable build passed.
- Acceptance: accepted by root for user review. No deployment approval is implied.

## Attempt 4 — compact sweep holes (student project crash)

- Problem: a 27-frame student project grew to 190 MB and crashed the tab. 182 MB of it was eraser holes: every pointer move added a 26-point capsule outline (full float precision, ~1.3 KB) to every stroke it touched, so one drag left dozens of outlines per stroke, and duplicated frames copied them. Each undo snapshot serialized the whole project (~190 MB), up to 21 times.
- Modification: a hole may now be a sweep, `{ r, path }`: the eraser circle of radius `r` dragged along `path`, rendered as one round-capped, round-joined stroke with `destination-out` in the same per-object isolated canvas. Consecutive moves of a drag extend the same sweep; coordinates are rounded to 0.01 px. Polygon holes remain supported.
- Migration: on load, import and undo, untouched 26-point capsules are recognised geometrically (1% radius tolerance), rebuilt as sweeps and joined when consecutive. Any other polygon is kept unchanged. Non-uniform scaling expands a sweep back into capsule polygons because a circle does not stay a circle.
- Rendering: each stroke with holes is isolated only within a conservative paint box (points ± size × scale + 4 px, rotated and mirrored as drawn), in a scratch canvas that reaches from the origin to the box's far corner; only the box is cleared and copied back. All sweeps of one radius are cut in one stroke and all dots in one fill, and sweep segments that cannot reach the box are skipped. Text and groups keep the full-canvas path.
- Refused along the way: clipping to the box (changed edge antialiasing, no speed-up); a box-sized scratch canvas with the drawing translated by whole pixels (fastest, 148 ms, but Firefox and WebKit antialias curves differently after any horizontal translation, which failed the exact-footprint test with 4–16 changed edge pixels); Douglas–Peucker simplification of sweep paths (removed only 13–16% of points, no speed-up).
- Measurement on the student project: 136,975 capsules became 17,973 sweeps with no polygons left over; saved project 190 MB → 11.7 MB; opening takes 2.5–6.5 s instead of crashing; frame 26 (600 strokes, 495 with holes) redraw 860 ms → 233 ms in Chromium (1,019 ms → 260 ms in Firefox); an eraser move there 1,040 ms → about 300 ms.
- Render comparison, sweeps vs the same holes as capsule polygons: every pixel the sweep erases additionally lies inside the eraser footprint (478 pixels across frames 18/23/26, all seams of partial coverage between neighbouring capsules); 139 boundary pixels (within 0.1 px of the circle edge) are erased less because overlapping capsules no longer compound edge antialiasing. Boxed vs full-canvas rendering across all 27 frames: 327 of 38.9 M channel values differ, all edge antialiasing where skipped or batched hole segments meet.
- Remaining cost: undo snapshots of this project are still ~11.7 MB each (~245 MB for 21), 117 ms per edit.
- Tests: `tests/e2e/eraser-storage.spec.js` (sweep storage, migration, boxed rendering, SVG export); three existing assertions updated from outline to sweep shape.
