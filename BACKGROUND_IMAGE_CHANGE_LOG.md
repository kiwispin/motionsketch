# Shared background image — local implementation

## Scope approved

- Add Set Background Image beneath Width/Height in Project Settings, not to either toolbar.
- One shared image beneath all drawn artwork, centred and fitted proportionally without cropping.
- Pending Set/Replace/Remove operations commit on Apply; Cancel discards the draft.
- One Undo step for an applied Settings change, including canvas size when changed together; Redo restores it.
- Save one embedded image per project and in autosave, include it in normal exports and thumbnails, omit it from explicitly transparent PNG export.
- Keep the non-exported drawing reference feature and background-colour controls unchanged.
- Local testing only; no commit or deployment requested for this implementation.

## Implementation

- `index.html`: scoped Settings controls, loading/error state, and a selected filename rendered with textContent.
- `src/main.js`: validated PNG/JPEG/WebP import (10 MiB and 16 megapixel limits), decoded-image cache, draft cancellation guards, proportional placement, history snapshots and shared rendering.
- Project format version 7 stores background image data once at the project root. Versions 2–6 remain loadable and default to no imported background. New projects clear the image.
- Project files decode/validate their image before replacing the current project; stale import/autosave loads cannot overwrite a newer New/Open request. Cancel/Remove invalidate outstanding Settings image loads.
- Raster exports use the shared frame renderer. SVG embeds the image as a data URL at the same fitted coordinates. Transparent PNG excludes the solid colour and imported image but retains artwork.
- No new cropping, movement, opacity, per-frame images, permanent panels, or sidebar layout changes.

## Verification

- Added eight Playwright scenarios in `tests/e2e/background-image.spec.js`: draft/apply/cancel; replace/remove and undo/redo; project/autosave round-trips; old/new projects; malformed/oversized files; raster/SVG/ZIP pixels; GIF input frames; actual WebM download and recorded-frame pixels; late-load cancellation; artwork/eraser-hole compositing; JPEG/WebP input and PNG alpha.
- Focused Chromium + WebKit: 15 passed, 1 skipped. WebKit's video test is skipped because this local WebKit build lacks canvas captureStream. GIF coverage inspects the encoder input frames rather than decoding the generated GIF.
- Final full Chromium suite: 86 passed (32.2s). Production and portable builds both passed; `git diff --check` passed.
- Visually inspected the actual portable Settings dialog empty and loaded at 1366×820, and loaded at 390×844; controls fit without overlap. Screenshots: `/tmp/background-settings-empty.png`, `/tmp/background-settings-loaded.png`, `/tmp/background-settings-narrow.png`.
- Automated geometry check confirms the left toolbar is unchanged by import/apply/resize.
- Acceptance: awaiting user testing of the local portable build.
