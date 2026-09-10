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
