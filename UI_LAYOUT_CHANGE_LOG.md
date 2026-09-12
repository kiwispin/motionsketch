# UI Layout Change Log

## Release verification — 2026-09-12

- User accepted the local version and authorised release.
- Chromium: 71 passed. WebKit: 69 passed, 2 skipped.
- Local Firefox failed during browser launch (sandbox/framebuffer error), before app testing; GitHub CI must verify Firefox before deployment.
- Production build and diff whitespace checks passed.
- Release includes app changes, associated tests and change logs; the exploratory UI redesign inventory is excluded.

## 2026-09-12 — Scoped layout pass

Exact edits:

- Moved Snap, Grid, Symmetry, Reference, and Remove reference into a fixed-position Drawing Aids popover in the right inspector. Existing toggle methods and state remain unchanged.
- Reduced the brush preview from a tall 200px inspector block to a 76px compact preview with a horizontal, size-responsive stroke mark.
- Moved the existing zoom controls into the timeline playback row.
- Added a compact frame action strip beside the thumbnails for Add, Duplicate, Delete, Copy, and Paste. Copy/paste reuse the existing deep frame clipboard behavior.
- Added selection-aware Duplicate and Delete actions for multi-selected frames; a no-selection action targets the active frame, and deleting the complete timeline leaves one blank frame as before.
- Preserved the existing movement track row and truck motion data paths. Increased timeline/inspector spacing so the right inspector remains above the timeline, with internal scrolling retained.
- Kept the existing play, rewind, previous/next, frame position, Loop, Hold, and FPS state paths; final accepted Hold/FPS presentation uses the original range inputs and live outputs (`#frame-hold`, `#frame-hold-disp`, `#fps-control`, `#fps-disp`). A dropdown variant was rejected during review and reverted.
- Added short-height toolbar compaction (40px controls at 1366×768; 34px controls at 900×600) so the hand and onion controls remain inside the left panel.
- Kept the hidden `#frame-hold-disp`/`#fps-disp` outputs synchronized for compatibility while hiding duplicate visible text; FPS select options now include the `FPS` label.

Measured verification:

- `npm run build` — passed.
- `npm run build:portable` — passed.
- Focused Chromium E2E: `tests/e2e/frame-clipboard.spec.js` and `tests/e2e/truck-motion.spec.js` — 17 passed.
- UI action smoke check — Drawing Aids toggled Grid; multi-selection duplicated and pasted frame groups; Hold 4f and FPS 17 synchronized.
- Updated reliability selectors for the intentional popover/select UI changes (open Drawing Aids before Snap/Grid/Symmetry/Reference, select Hold/FPS options).
- Chromium E2E: `tests/e2e/reliability.spec.js` and `tests/e2e/responsive.spec.js` — 32 passed.

## 2026-09-12 — Final geometry review correction

- Reduced the truck timeline from 238px to 210px at desktop widths (196px at the narrow breakpoint) and reduced the desktop inspector reserve accordingly.
- Added a visual switch indicator to the existing Loop button using its current `aria-pressed` state; playback behavior and IDs are unchanged.
- Measured at 1366×768: canvas bottom 528px; normal timeline top 582px; truck timeline top 538px; truck movement row bottom 747px within the 748px panel bottom; right inspector bottom matches the respective timeline top; left rail bottom 528px.
- `npm run build:portable` — passed after the correction.

## 2026-09-12 — Timeline action consistency correction

- Scoped the legacy circular `.add-frame-btn` styling to frame-track add buttons so the timeline Add action uses the same `.timeline-action` cascade as Duplicate, Delete, Copy, and Paste.
- Standardized the action icon box (16×16px) and label row alignment/minimum height for all five actions, including disabled Paste.
- Measured at 1366×768 and 390×844: all five action buttons share the same row height (58px), padding (6px 5px), font size (10.88px), and icon box (16×16px); widths are 62px desktop and 50px narrow breakpoint.
- `npm run build:portable` — passed.

## 2026-09-12 — Timeline action bar relocation

- Moved the existing Add, Duplicate, Delete, Copy, and Paste buttons into the playback control bar above the thumbnails; handlers, IDs, disabled-state logic, and movement row are unchanged.
- The thumbnails track now spans the full timeline content width without the action group beside it.
- Kept all five actions identical at 60×36px with 2px 3px padding and 9.92px text; the group is right-aligned on desktop and remains horizontally scrollable with the existing compact control bar at narrow widths.
- Measured at 1366×768: normal timeline remains 166px (top 582px), truck timeline remains 210px (top 538px), truck movement row remains fully inside (704–747px), canvas bottom remains 528px.
- `npm run build:portable` — passed.

## 2026-09-12 — Hold/FPS control review correction

- Replaced the reviewed dropdown variant with the original Hold 1–12 and FPS 1–24 range sliders, restoring visible live `1f`/`12 FPS` outputs and the existing `oninput` handlers.
- Restored the reliability test selectors to range `.fill()`/`oninput` paths; the frame-action bar above thumbnails is unchanged.
- Acceptance: pending user visual review of the restored controls.

## 2026-09-12 — FPS label wrap correction

- Reserved a non-shrinking 48px `.fps-value` width and applied `white-space: nowrap` so values such as `17 FPS` stay on one line.
- `npm run build:portable` — passed.

## 2026-09-12 — Flyout arrow/portal transition correction

- Vertically centered the existing brush/shape caret arrows; measured center delta is 0px for both anchors at 1366×768.
- Limited flyout animation to `opacity, transform`, keeping left/top portal placement out of the animated properties.
- Truck flyouts now portal and receive fixed left/top coordinates before the reveal class is applied, with a short left-to-right fade/slide; normal flyouts retain the same transition.
- Relevant smoke measurement: normal brush menu stayed absolute under its wrapper; Truck brush menu was `BODY`-portaled, `position: fixed`, `left: 92px`, `top: 173px`, and fully revealed after placement. `npm run build:portable` — passed.
- Follow-up review: the centered caret arrows were user-refused; removed that override and restored the original inline `bottom: 4px; right: 4px` arrow placement. Horizontal-only animation and Truck portal positioning remain.

## 2026-09-12 — Selected-frame outline correction

- Matched `.frame-card.active.frame-selected` to the existing orange selected-frame border and shadow so every selected frame, including the active current frame, has identical orange treatment; unselected active frames remain blue.
- `npm run build:portable` — passed.

Acceptance: pending user visual review.

## 2026-09-12 — Brush preview wave visual

- Replaced the checkerboard/capsule brush preview mark with a compact white rounded panel containing a flowing SVG wave stroke matching the supplied reference shape.
- Kept the existing `brush-preview-mark` ID and update path; brush type, color, opacity, and screen-space size continue to update the wave stroke without changing drawing behavior or inspector layout.
- `npm run build:portable` — passed after this edit.
- Added a subtle dark SVG drop-shadow only for white brush/eraser strokes so those existing tool states remain visible on the white preview surface.
- Preview stroke width now maps the full actual brush-size range 1–200 monotonically to 2–34 SVG units; this is a scaled sample rather than a pixel-accurate canvas-size rendering.
- Measured mapping: size 1 → 2.00, 30 → 6.66, 50 → 9.88, 100 → 17.92, 150 → 25.96, 200 → 34.00; all strictly increase and remain within the 0–80 SVG viewBox with the wave path.
- `npm run build:portable` — passed after the monotonic size mapping.
- Acceptance: pending user visual review.

## 2026-09-12 — Motion timeline internal row fit

- Reallocated only existing motion-timeline interior space: 6px bottom breathing room, 6px thumbnail-track vertical padding, compact 3px vertical movement-control padding, a 34px keyframe row, and a 72px movement scroll region at desktop widths.
- Kept the outer truck timeline height (210px desktop / 196px short-height), canvas geometry, movement data, and keyframe behavior unchanged. Short-height rules retain a 70px movement region and 75px thumbnail row for the existing 55px thumbnails.
- Measured seeded track at 1366×768: canvas bottom 528px; truck timeline 538–748px; motion row 707–741px (7px row clearance), active keyframe cell bottom 737px (11px clearance), center delta 0px.
- Measured seeded track at 1600×1000: canvas bottom 760px; truck timeline 770–980px; motion row 939–973px (7px row clearance), active keyframe cell bottom 969px (11px clearance), center delta 0px. Canvas rects remained unchanged.
- `npm run build:portable` — passed after this edit.
- Acceptance: pending root visual review.

## 2026-09-12 — Release test blockers

- Updated the stale layer-hint reliability assertion to require `#layer-hint` absence while retaining the existing Foreground/Background title-tooltip assertions.
- Reproduced the Truck flyout failure as a reveal timing race: five Chromium repeats were 4 passed / 1 failed with a valid option rectangle but `elementFromPoint` returning `null` before the portal’s next-frame reveal.
- Preserved the exact hit-test assertion and added a bounded poll (2s) for the existing flyout reveal to settle; no app behavior changed.
- Focused Chromium results: layer-hint test 1 passed; Truck flyout repeat 5/5 passed.
- Full Chromium suite: 71/71 passed.
- `npm run build:portable` — passed.
- Acceptance: pending root review.

## 2026-09-12 — Header Drawing Aids dropdown

- Moved the single existing Drawing Aids wrapper from the right inspector into the header immediately beside Canvas Settings; Snap, Grid, Symmetry, Reference, Remove reference, IDs, state, and handlers are unchanged.
- Restored the menu as a fixed viewport-safe dropdown below the header button so header overflow/scroll containers cannot clip it; placement clamps to the viewport and flips above only when needed.
- Removed the inspector wrapper instance; no other inspector controls moved.
- Measured at 1366×768: exactly one wrapper, header button `x=1125..1273` immediately beside Settings `x=1281..1325`, dropdown `x=1080..1294, y=95..251`, fully inside the viewport and below the button; canvas remained `x=404..782, y=150..528, 378×378`. Outside click closed the dropdown and reset `aria-expanded`.
- `npm run build:portable` — passed after this edit.
- Acceptance: pending root visual review.

## 2026-09-12 — Loop label stability

- Kept `loopMode` playback behavior and the existing `aria-pressed` blue/off indicator unchanged, but made the visible button text always `Loop` in `syncTimelineSettings` for both loop and once modes.
- Kept the accessible `aria-label` descriptive (`Playback mode: loop` / `Playback mode: once`) and updated the focused reliability expectation accordingly.
- Focused Chromium test `supports undoable frame holds and loop/once playback modes` — passed.
- `npm run build:portable` — passed after this edit.
- Acceptance: pending root visual review.

## 2026-09-12 — Drawing Aids in-flow accordion

- Kept the existing bottom Drawing Aids wrapper after Background Color and before Onion Skin, but changed only its menu from fixed-position sizing to an in-flow grid that expands within the right inspector.
- Removed the old fixed `top`/`right` placement calculation from `setDrawingAidsOpen`; `aria-expanded`, existing IDs, controls, handlers, and outside-click/Escape behavior remain unchanged.
- Measured at 1366×768 with Truck active: panel bounds stayed `y=100–538`, canvas stayed `x=404..782, y=150..528, 378×378`; opening increased panel scroll height `626→792px`, menu computed position is `static`, and manual panel scroll brought the menu fully inside the panel (`y=276.4–432.4`).
- `npm run build:portable` — passed after this edit.
- Acceptance: pending root visual review.

## 2026-09-12 — Right inspector Drawing Aids discoverability

- Removed the visible Layer explanatory paragraph to free inspector height; retained its guidance as titles on the existing Foreground and Background buttons.
- Moved the existing Drawing Aids wrapper directly below the Layer switch; Snap, Grid, Symmetry, and Reference controls/handlers are unchanged.
- Measured at 1366×768 with Truck active: right panel bounds `y=100–538`, Drawing Aids bounds `y=198–230`, `scrollTop=0`, and the wrapper is fully inside the panel. `#layer-hint` count is 0; both layer button titles remain present.
- `npm run build:portable` — passed after this edit.
- Acceptance: pending root visual review.

## 2026-09-12 — Curved motion guide interpolation

- Reproduced the curved-turn issue with keys `(0,0,0)`, `(3,40,120)`, `(4,70,150)`, `(9,180,10)`: the old coordinate clamp returned `dy=150` at both frames 3.5 and 3.75 despite the cubic evaluating to approximately `151.25` and `156.56`.
- Removed only that damaging per-coordinate clamp while retaining finite fallback behavior and exact keyframe endpoint values.
- Changed the guide from integer-frame samples (9 line segments for frames 0–9, making adjacent keys 3→4 appear straight) to four fractional samples per frame span using the same `getMotionOffset` evaluator. Straight segments remain linear.
- Added focused Chromium regression coverage for exact key positions, curved fractional samples, and fractional guide density in `tests/e2e/truck-motion.spec.js`.
- Focused Chromium interpolation/guide tests: 2 passed; full Chromium truck suite: 13 passed, 1 unrelated pre-existing toolbar flyout hit-test failed (`tool-rect` received no element).
- `npm run build:portable` — passed.
- Acceptance: pending root visual review.

## 2026-09-12 — Drawing Aids position follow-up

- User-refused the top-of-inspector placement; restored the existing Drawing Aids wrapper to its original position after Background Color and before Onion Skin.
- Layer paragraph removal and Foreground/Background title tooltips remain in place; no control behavior changed.
- `npm run build:portable` — passed after this edit.
- Acceptance: pending root visual review.

## 2026-09-12 — Toolbar height breakpoint follow-up

- Raised only the existing desktop compact-toolbar breakpoint from 800px to 890px viewport height. At 820–890px the existing compact sizes/gaps now apply before the onion control can fall below the left toolbar panel; the ≤700px rule remains unchanged.
- Preserved panel placement, flyout overflow behavior, canvas geometry, tool order, and all toolbar handlers. No overflow clipping was added.
- Added a focused bounds regression covering normal and Truck states at 1366×820, 1366×850, 1366×900, 1600×1000, and 1024×850; every direct tool/flyout/onion control and divider must remain within `.tools-panel`.
- Measured bounds: 1366×820 panel `80–580`, onion `437–477`; 1366×850 panel `80–610`, onion `437–477`; 1366×900 panel `100–660`, onion `587–631`; 1600×1000 panel `100–760`, onion `587–631`; 1024×850 panel `80–610`, onion `437–477`. Canvas wrapper rectangles were identical before/after Truck in every case.
- Acceptance: pending root visual review.
