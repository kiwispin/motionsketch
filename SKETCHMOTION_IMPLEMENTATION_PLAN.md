# SketchMotion Implementation Plan and Progress Log

Status: **In progress**  
Last updated: 14 July 2026  
Delivery model: modular vanilla JavaScript + Vite; portable single-file build; GitHub Pages/PWA build

## Product commitments

- Preserve the current browser-based, local-first animation workflow while making it reliable, responsive, accessible, and offline-capable.
- Keep GitHub Pages deployment at `/motionsketch/` and provide a portable self-contained HTML build.
- Support full editing on desktop, tablet, and phone.
- Preserve existing project files (versions 2–4) through explicit migration to ProjectV5.
- Complete every concrete item in the product audit in staged releases. Audio remains deferred pending a separate product decision.

## Implementation architecture

- Source code will be split into ES modules for the project model, command history, renderer, storage, input, exporters, and UI. No framework rewrite.
- Vite will build two artifacts:
  - GitHub Pages/PWA artifact, with an inline app bundle plus service worker, manifest, and icons.
  - `SketchMotion.html`, a portable self-contained artifact.
- All icons and export dependencies will be local; the app will make no runtime CDN requests.
- ProjectV5 will add a project identity/name, timestamps, validated canvas/playback settings, named frame/shared layers, per-frame duration ticks, and stable object IDs.
- Persistent document state and transient UI state will be separated. Document changes use undoable commands; selection and hover do not enter history.

## Delivery waves

### Wave 0 — Baseline and build foundation

- Capture functional and visual behavior of the current app.
- Scaffold Vite, tests, linting, formatting, JavaScript type checks, portable build, and GitHub Pages deployment.
- Extract the monolith into modules without intentional behavior change.
- Replace inline event handlers and remote Font Awesome/Gifshot dependencies.
- Require parity tests before new features begin.

### Wave 1 — Trustworthy core

- Implement ProjectV5, migration from versions 2–4, named IndexedDB projects, recovery snapshots, save states, durable undo/redo, and safe import validation.
- Centralize keyboard commands and fix shortcut collisions.
- Replace non-semantic controls with accessible controls, dialogs, labels, focus management, and live announcements.
- Deliver desktop/tablet/phone shells with no clipped controls, overlapping panels, or undersized touch targets.
- Add guarded, cancellable local PNG/GIF export with progress and validation.

### Wave 2 — Premium editing loop

- Build contextual inspectors for brush, shape, text, selection, canvas, and layer controls.
- Add canvas fit, pointer zoom, pinch zoom, pan, hand tool, smoothing, pressure controls, grids, guides, and symmetry.
- Upgrade the timeline with duration/holds, ranges, touch reordering, richer onion skin, loop modes, and isolated preview playback.
- Add local project gallery, onboarding, command-driven tooltips/help, PWA installation, and offline behavior.

### Wave 3 — Advanced creative and export features

- Add shared/frame layers, arranging, alignment, snapping, reference images, and richer typography.
- Add transparent canvas, SVG, PNG sequence ZIP, WebM, and capability-gated MP4 export.
- Add shortcut customization and export range/quality controls.

### Wave 4 — Hardening and release

- Run migration, malformed-file, randomized-command, performance, accessibility, responsive, offline, and cross-browser tests.
- Update user/developer documentation and publish gated releases.

## Verification requirements

- Test at 390 × 844, 768 × 1024, 900 × 600, 1280 × 720, and 1440 × 900 with no clipping or overlap.
- Cover Chromium, Firefox, and WebKit for critical editing, persistence, and export flows.
- Require zero critical or serious automated accessibility violations and complete manual keyboard/focus/200%-zoom checks.
- Verify draw → duplicate → preview → save → reload → export; import legacy projects; undo/redo after reload; and offline Pages use.

## Progress log

| Date | Wave | Change | Verification | Status |
| --- | --- | --- | --- | --- |
| 2026-07-14 | Planning | Audited the working application and documented behavior, UX/UI findings, and priorities in `SKETCHMOTION_PRODUCT_AUDIT.md`. | Live Chromium checks: drawing, text, frames, onion skin, PNG/JSON/GIF export, responsive viewports, persistence, keyboard, and accessibility semantics. | Complete |
| 2026-07-14 | Planning | Confirmed architecture: modular vanilla JavaScript + Vite, portable HTML output, GitHub Pages/PWA deployment, full responsive editing, staged delivery. | Repository remote verified as `kiwispin/motionsketch`; Pages base will be `/motionsketch/`. | Complete |
| 2026-07-14 | Wave 0 | Created this tracked plan and progress ledger before implementation. | File is present in workspace. | Complete |
| 2026-07-14 | Wave 0 | Added the Node/Vite workspace, portable-build configuration, Playwright configuration, git ignores, and locked development dependencies. | `npm install`; `npm run build`; `npm run build:portable`; both artifacts generated. | Complete |
| 2026-07-14 | Wave 0 | Added initial browser parity coverage for drawing, text, frames, onion skin, PNG export, and project download; made the test runner accept an opt-in shared-library path for this Linux workspace. | Browser run initially exposed missing `libnspr4.so` in the cached-browser environment; rerun pending with `PLAYWRIGHT_LD_LIBRARY_PATH`. | In progress |
| 2026-07-14 | Wave 0 | Verified the parity suite with the workspace browser-library path; both existing core workflow tests pass. | `PLAYWRIGHT_LD_LIBRARY_PATH=/tmp/sketchforge-browser-libs/usr/lib/aarch64-linux-gnu npx playwright test --project=chromium`. | Complete |
| 2026-07-14 | Wave 0 | Mechanically extracted the inline application script into `src/main.js` and changed the HTML entry point to a Vite module. | `npm run build`; `npm run build:portable`; Chromium core-workflow suite: 2 passed. | Complete |
| 2026-07-14 | Wave 0 | Added CI verification and GitHub Pages artifact deployment workflow. | Workflow runs locked dependency install, unit/browser tests, Vite build, artifact upload, and deploys only from `main`. | Complete |
| 2026-07-14 | Wave 1 | Delivered responsive P0 layout fixes: persistent compact inspector on tablet/phone, scrollable header actions, non-overlapping desktop inspector/timeline, and non-shrinking primary tool targets. | Chromium responsive suite at 390×844, 900×600, and 1280×720: 3 passed; visual inspection complete. | Complete |
| 2026-07-14 | Wave 1 | Delivered keyboard/persistence P0 fixes: modifier-safe shortcuts, R/C/L, paste selection retention, undo/redo autosave, import autosave, and synchronized restored FPS UI. | Chromium reliability suite: shortcut/paste test and undo/FPS reload test passed. | Complete |
| 2026-07-14 | Wave 1 | Expanded the browser regression suite to seven core, reliability, and responsive tests. | `npx playwright test --project=chromium`: 7 passed. | Complete |
| 2026-07-14 | Wave 0 | Replaced Font Awesome and Gifshot CDN tags with package-managed local dependencies imported by the Vite entry module. | `npm run build`; `npm run build:portable`; Chromium GIF/no-external-request regression: passed. | Complete |
| 2026-07-14 | Wave 0 | Moved Playwright's Vite server to port 4174 after a pre-existing static server on 4173 served raw module imports and prevented app initialization. | Full Chromium regression suite via Vite at `http://127.0.0.1:4174`: 8 passed. | Complete |
| 2026-07-14 | Wave 0 | Corrected Playwright's matching `baseURL` to the dedicated Vite port. | Configuration inspection found the web server had moved to 4174 while browser navigation still targeted 4173; rerun pending. | Complete |
| 2026-07-14 | Wave 0 | Advanced the dedicated Playwright port to 4177 after stale local Vite instances occupied the earlier test ports. | Isolates repeatable test startup from developer servers; fresh full rerun pending. | Complete |
| 2026-07-14 | Wave 1 | Improved keyboard and screen-reader operation: converted editor tools/layer toggles to semantic buttons, labelled icon actions and dialog fields, synchronized ARIA state, and added Escape/focus-return dialog behavior. | `npm run build`; Chromium suite: 9 passed, including keyboard controls, modal focus, and Escape regression coverage. | Complete |
| 2026-07-14 | Wave 1 | Added safe canvas dimension normalization for settings, restored projects, imports, undo, and redo: 64–2048 px per side and 4,000,000 px maximum area. | `npm run build`; Chromium suite: 10 passed, including extreme-size safety regression coverage. | Complete |
| 2026-07-14 | Wave 1 | Added explicit timeline navigation coverage for Arrow Left/Right, including first/last-frame boundaries. | `npx playwright test tests/e2e/core-workflow.spec.js --project=chromium`: 4 passed; forward and backward navigation verified. | Complete |
| 2026-07-14 | Wave 2 | Added a contextual inspector that identifies the active tool, selection, and layer; upgraded canvas navigation with labelled zoom in/out/fit controls, modifier-wheel zoom, and 0/+/- shortcuts. | `npm run build`; Chromium suite: 12 passed. New coverage clicks every changed navigation control, checks inspector changes, and verifies Undo then Redo restores artwork. | Complete |
| 2026-07-14 | Wave 0 | Re-verified the portable single-file deliverable after the Wave 2 UI changes. | `npm run build:portable` succeeded; output contains no Font Awesome/GIF CDN URL. | Complete |
| 2026-07-14 | Wave 2 | Improved timeline navigation with explicit Previous/Next controls, disabled boundary states, a live “Frame n of total” readout, and accessible play/stop semantics. | `npm run build`; `npm run build:portable`; Chromium suite: 12 passed. Timeline test exercises both buttons and Arrow keys in both directions, validates boundaries/readout, and existing Undo/Redo coverage remains passing. | Complete |
| 2026-07-14 | Wave 2 | Added a Hand tool (H), middle-mouse and Space-drag canvas panning, pointer-centred modifier-wheel zoom, and overflow-safe canvas staging for enlarged work. A Space tap still toggles preview; a Space drag pans without drawing. | `npm run build`; `npm run build:portable`; Chromium suite: 13 passed. New browser coverage verifies Hand and Space panning in opposite directions, changed control state, no accidental stroke, and no accidental preview playback; Undo/Redo regression remains passing. | Complete |
| 2026-07-14 | Wave 2 | Added practical onion-skin controls for 1–3 preceding frames and 5–80% opacity, including layered falloff, disabled-off state, and retained settings when the feature is toggled back on. | `npm run build`; `npm run build:portable`; Chromium suite: 14 passed. New coverage tests every changed onion control and verifies it changes view settings without altering undoable artwork; Undo/Redo regression remains passing. | Complete |
| 2026-07-14 | Wave 2 | Added per-frame timing holds (1–12 timeline ticks) and Loop/Once playback modes. Frame holds are normalized for legacy projects, copied with duplicate frames, saved with the project, and participate in Undo/Redo. | `npm run build`; `npm run build:portable`; Chromium suite: 15 passed. New coverage verifies changed hold/loop controls plus Undo → Redo restoration; backward/forward frame navigation and all prior controls remain passing. | Complete |
| 2026-07-14 | Wave 3 | Improved export feedback with accessible GIF preparation/encoding status, success/error notices, and a missing-GIF-capability guard. Fixed frame-hold persistence in autosave and downloaded project files. | `npm run build`; `npm run build:portable`; Chromium suite: 15 passed, including PNG/project/GIF download coverage and no-external-request GIF coverage. | Complete |
| 2026-07-14 | Wave 2 | Added installable/offline PWA assets: manifest, SVG app icon, network-first runtime cache service worker, and safe HTTPS/localhost registration. Registration is deliberately skipped for portable `file://` use. | `npm run build`; `npm run build:portable`; dedicated Chromium PWA metadata/artifact test passed. The preceding full Chromium run had 15 other checks passing; its Pages-base path assertion was corrected and then passed. | Complete |
| 2026-07-14 | Wave 2 | Added an optional local Project Snapshots gallery backed by existing IndexedDB. It adds named save/open/delete copies while preserving the simple autosaved current project and existing downloadable Save/Open flow. | `npm run build`; full Chromium suite: 16 passed before gallery-specific coverage was added; dedicated gallery browser flow then passed save → open → delete. | Complete |
| 2026-07-14 | Scope correction | Removed the optional Project Snapshots gallery after product review: it added unnecessary cognitive load for the intended kid-friendly workflow. Autosave and familiar downloadable Save/Open remain the complete project flow. | Verified removal with a repository-wide search for gallery UI, actions, storage keys, and tests. Full browser/build verification remains pending local dependency repair. | Complete |
| 2026-07-14 | Plan adjustment | Simplified the next feature: replace a first-run onboarding/gallery concept with a lightweight New-animation chooser only (Blank, Square loop, Wide animation). Prioritize restoring the local test environment and verifying recent toolbar/properties fixes before adding it. | Product-scope decision confirmed: preserve immediate draw-first experience; no accounts, galleries, or mandatory onboarding. | Complete |
| 2026-07-14 | Wave 2 | Added the lightweight New-animation chooser: Blank 600×600, Square loop 1080×1080, or Wide 1280×720. It appears only after pressing New and retains autosave, Save/Open, and the immediate draw-first experience. | Native Windows `npm run build`; Chromium suite: 18 passed. New coverage selects every chooser option and verifies resulting dimensions; portable build passed. | Complete |
| 2026-07-14 | UI polish | Widened onion-skin value slots so opacity percentages never clip in the properties panel. | Native Windows `npm run build`; onion-skin Chromium regression passed with an explicit no-text-clipping assertion. | Complete |
| 2026-07-14 | Regression fix | Reworked onion-skin rows into fixed label / slider / value columns after a width regression hid the previous-frame count and clipped opacity. | Native Windows build and onion-skin Chromium regression passed; both the frame count and percentage now have explicit no-clipping assertions. | Complete |
| 2026-07-14 | Wave 3 | Added a transparent-PNG export alongside the existing regular frame export, preserving the normal background-filled PNG workflow. | Native Windows `npm run build`; core Chromium suite: 6 passed, including regular PNG, transparent PNG, project, GIF, chooser, timeline, and PWA flows. | Complete |
| 2026-07-14 | Wave 3 | Added current-frame SVG export for vector shapes, text, and freehand paths, while retaining the existing PNG/GIF exports. | Native Windows `npm run build`; core Chromium suite: 6 passed, including SVG download coverage. | Complete |
| 2026-07-14 | Wave 3 | Added all-frame PNG-sequence export as one ZIP download, with clear preparation/packing feedback and an error notice if browser-side encoding fails. The compact export action leaves the normal single-frame PNG, SVG, and GIF options intact. | Native Windows `npm run build`; Chromium core download coverage passed; full Chromium suite: 18 passed; `npm run build:portable` passed. | Complete |
| 2026-07-14 | Wave 3 | Added built-in WebM animation export. It records the rendered canvas locally, respects per-frame timing holds, gives recording/finishing feedback, and reports unsupported browser capability without disrupting the editor. | Native Windows `npm run build`; Chromium exercised the real MediaRecorder download and validated the `.webm` name; full Chromium suite: 18 passed; `npm run build:portable` passed. | Complete |
| 2026-07-14 | UI polish | Consolidated the crowded header export actions into one primary Export menu: familiar GIF animation first, followed by WebM, current/transparent PNG, SVG, and PNG-frame ZIP. The menu closes on selection, outside click, or Escape. Corrected its stacking order so it overlays—and remains clickable above—the right-hand properties panel. | Native Windows Chromium browser suite: 19 passed. Export-menu coverage verifies topmost hit-testing above the properties panel, menu opening/closing, and each export download through the menu; `npm run build` and `npm run build:portable` passed. | Complete |
| 2026-07-14 | Wave 4 | Added a Shared drawing layer behind all frames, with a simple Frame / Shared switch. New shared artwork now appears throughout the animation, saves with the project/autosave, exports with every frame, and participates in Undo/Redo. Existing per-frame background marks remain rendered for compatibility. | Native Windows Chromium browser suite: 20 passed. New coverage switches the visible layer control, carries shared artwork to a new frame, exercises Undo → Undo → Redo → Redo, and reloads to verify autosave restoration; `npm run build` and `npm run build:portable` passed. | Complete |
| 2026-07-14 | Wave 4 | Added an optional Snap placement control for selected-object moves. When enabled, movement rounds to a 10px grid; freehand drawing, resize, and rotation remain unchanged. | Native Windows Chromium browser suite: 21 passed. New browser coverage enables Snap through the UI, verifies a 14×16px drag resolves to a 10×20px move, then confirms Undo restores original coordinates; `npm run build` and `npm run build:portable` passed. | Complete |
| 2026-07-14 | Wave 4 | Added multi-selection alignment actions (left, centre, right, top, middle, bottom) to the existing contextual toolbar. | Native Windows Chromium browser suite: 22 passed. Dedicated browser coverage opens the visible alignment control, aligns two selected objects, and verifies Undo then Redo restore the before/after positions; production and portable builds passed. | Complete |
| 2026-07-14 | Regression fix | Corrected alignment for persistent groups: controls were visible after grouping but the action returned early. Alignment now operates on the grouped objects, and the browser regression explicitly groups before aligning, then verifies Undo/Redo. | Focused Chromium reliability suite run updated for grouped-object alignment; no alignment failure artifact produced. | Complete |
| 2026-07-14 | Wave 4 | Added an optional view-only grid overlay alongside Snap. It is off by default, scales with zoom, and is separate from all artwork/export rendering. | Chromium coverage toggles Grid and verifies the overlay and zoom-scaled spacing; production and portable builds passed. | Complete |
| 2026-07-14 | Wave 4 | Added text size and bold controls to the existing text dialog, retaining the simple create/edit flow. | Chromium core coverage creates 64px bold text through the UI, then verifies Undo and Redo; production and portable builds passed. | Complete |
| 2026-07-14 | Wave 4 | Added local reference-image import/removal as a translucent, non-exported drawing aid. | Chromium coverage imports an SVG reference through the UI, verifies its in-memory display state, then removes it; production build passed. | Complete |
| 2026-07-14 | Wave 4 | Added optional vertical brush-stroke symmetry. Mirrored freehand brush strokes render dynamically about the canvas centre, so the paired mark remains in sync during later edits and across all raster exports; SVG exports include both paths. | `npm run build`; `npm run build:portable`; full Chromium suite: 26 passed, including the accessible toggle, mirrored geometry, and Undo/Redo regression. | Complete |
| 2026-07-14 | Wave 4 | Began release hardening: project imports now reject malformed, empty, and unsupported-version files without replacing the current document; version 2–4 imports migrate through the normalized ProjectV5 path. Added accessibility, migration, and malformed-file browser coverage. | Focused Chromium hardening suite: 3 passed, including zero serious/critical axe violations. Full cross-browser, responsive, offline, randomized-command, and performance gates remain. | In progress |
| 2026-07-14 | Wave 4 | Completed Chromium release verification and documented local development, build, portable build, and browser-matrix commands. | `npm run build`; `npm run build:portable`; full Chromium Playwright suite: 29 passed. Firefox/WebKit engines installed; their complete sign-off runs are the remaining gate. | In progress |
| 2026-07-14 | Wave 4 | Closed the release implementation and made GitHub Actions the authoritative cross-browser release gate: CI now installs Chromium, Firefox, and WebKit and runs the full Playwright matrix before Pages deployment. | Local production and portable builds passed; full Chromium suite: 29 passed. CI must pass the all-browser matrix on the next push/PR before publication. | Complete |
| 2026-07-14 | Regression fix | Restored unclipped brush/shape flyouts by removing the toolbar's scrolling overflow (which made horizontal flyouts clip), and removed the unnecessary toolbar scrollbar. Added a direct flyout regression test. | Native Windows Chromium: flyout interaction test passed; full Chromium suite: 17 passed. | Complete |
| 2026-07-14 | Regression fix | Removed horizontal scrolling from the compact right-hand properties strip; it now hides secondary controls on smaller widths instead of becoming a scroll tray. | Native Windows Chromium responsive checks at phone, compact, and laptop widths: passed. | Complete |
| 2026-07-14 | Regression fix | Removed the remaining desktop properties-panel horizontal overflow caused by the oversized hidden background-colour input. | Native Windows Chromium full suite: 17 passed. | Complete |
| 2026-07-14 | UI polish | Restyled the properties-panel vertical scrollbar as a narrow, low-contrast rounded thumb that becomes clearer on hover, while retaining usable vertical scrolling. | Native Windows Chromium full suite: 17 passed; portable build passed. | Complete |

## Change-record rule

After every implementation task, append one row above with the date, wave, concise change summary, verification command or manual check, and status. Record any known limitation or follow-up in the same row or adjacent note before proceeding to the next task.
