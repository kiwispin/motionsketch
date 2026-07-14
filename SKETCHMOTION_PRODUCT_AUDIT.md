# SketchMotion: Current Product, UX/UI Audit, and Upgrade Roadmap

Audit date: 14 July 2026  
Audited build: the current working copy of `index.html`  
Scope: product behavior, desktop and responsive UI, interaction design, accessibility, reliability, performance, and maintainability

## Executive assessment

SketchMotion already has the bones of a compelling lightweight animation tool. It is much more than a sketch pad: it has vector-like editable objects, pressure-aware drawing, two drawing planes, frame management, onion skinning, grouping, autosave, project files, and working PNG/GIF export. The dark visual treatment is coherent, the canvas is clearly prioritized, and the app is understandable at first glance on a large desktop.

The strongest product position is:

> A fast, friendly, local-first flipbook and motion-sketching studio for making short hand-drawn loops without the weight of a professional animation suite.

The app is not yet production-polished. Its biggest problems are not a lack of features; they are hierarchy, reliability, responsive behavior, discoverability, and interaction consistency. On smaller screens, important controls are clipped or removed. Some saved settings visibly disagree with the underlying state. Undo can be lost after refresh. Keyboard shortcuts conflict with browser shortcuts. Most drawing tools cannot be operated by keyboard or assistive technology.

The right next move is therefore not to add many more drawing tools. It is to make the existing loop—create, draw, duplicate, adjust, preview, save, export—feel effortless and trustworthy.

## What the app currently does

### Product and project behavior

- Runs entirely in the browser from one self-contained HTML application.
- Starts with one 600 × 600 frame at 12 FPS.
- Supports custom canvas width and height.
- Supports zoom from 10% to 500%, plus reset to 100%.
- Offers dark and light themes; the theme preference persists in `localStorage`.
- Autosaves one current project to IndexedDB after edits.
- Shows a save confirmation toast and a storage meter.
- Downloads and opens versioned JSON project files (current format version: 4; versions 2+ are accepted).
- Creates a new blank animation after a confirmation modal.

### Drawing and styling

- Two editable drawing planes per frame:
  - **Foreground** (`strokes`)
  - **Background** (`paperStrokes`)
- Four brush appearances:
  - Standard brush, with pointer-pressure variation
  - Pencil, rendered at a fixed fine width
  - Marker
  - Highlighter, with a wider translucent stroke
- Hold-to-straighten behavior for brush-family strokes.
- Vector eraser that destructively removes or splits intersected stroke geometry; touching text, filled shapes, rectangles, or circles removes the whole intersected object.
- Rectangle, ellipse, and line tools.
- Fill tool that fills a hit object or changes the current frame background when used on empty canvas.
- Text insertion, recoloring, resizing, rotation, and double-click editing. Text uses the browser's sans-serif font.
- Brush size from 1–200 and opacity from 1–100%.
- Custom color picker and ten editable palette swatches.
- Per-frame background colors.
- Live brush cursor and brush-size preview.

### Object editing

- Click selection and drag-box selection on the active drawing plane.
- Ctrl/Cmd-click multi-selection.
- Move, rotate, and resize with eight handles.
- Proportional corner resize and independent side resize.
- Persistent grouping and ungrouping.
- Internal copy and paste with a 20 px offset.
- Delete selected objects.
- Recolor selected objects and change their stroke size or opacity.
- Undo and redo using whole-project snapshots, with roughly 20 recent steps retained.

Not currently present: object/layer lists, z-order commands, lock/hide controls, alignment, snapping, guides, rulers, blend modes, gradients, reusable symbols, or tweening.

### Animation and timeline

- Add a blank frame after the current frame.
- Duplicate or delete a frame.
- Select frames from generated thumbnails.
- Reorder frames with HTML drag and drop.
- Looping playback and rewind-to-start.
- Playback rate from 1–24 FPS.
- Previous-frame onion skin at 30% opacity for foreground artwork.
- Left/right-arrow frame navigation.
- Shortcuts for adding and duplicating frames and toggling playback.

All frames currently have equal duration. There are no per-frame holds, exposure sheets, audio, timeline zoom, markers, named scenes, next-frame onion skin, or onion-skin range/color controls.

### Export

- Exports the current frame as an opaque PNG.
- Exports the full animation as an animated GIF at the canvas size and selected FPS.
- Downloads the editable project as JSON.

PNG, JSON, and GIF export all completed successfully in the live smoke test. GIF generation depends on the externally hosted Gifshot script.

## What is already working well

1. **The core mental model is simple.** Tools on the left, canvas in the middle, properties on the right, frames below is a familiar creative-app layout.
2. **The visual language is coherent.** The dark stage, blue accent, rounded panels, subtle borders, and restrained shadows already feel like one product.
3. **The happy path works.** I successfully drew a freehand stroke, created a rectangle, added text, duplicated the frame, enabled onion skin, and exported PNG, JSON, and GIF without runtime errors.
4. **Direct manipulation is a genuine strength.** Selection handles, marquee selection, multi-select, rotation, grouping, and per-object styling give the editor more depth than its compact interface suggests.
5. **Local-first is the right default.** No sign-in is required and user work stays in the browser unless explicitly downloaded.
6. **Frame thumbnails make the animation tangible.** They are much easier to understand than a purely abstract timeline.
7. **Per-frame background art and color create useful flexibility.** This supports simple scene changes without introducing a complex layer model.

## Audit method and verified findings

I inspected the complete HTML/CSS/JavaScript implementation and exercised the running app in Chromium. The runtime checks covered drawing, shapes, text, frame duplication, onion skinning, FPS persistence, keyboard behavior, autosave/undo behavior, responsive geometry, accessibility semantics, and all three downloads.

| Check | Result |
| --- | --- |
| Large desktop, 1440 × 1000 | Main composition looks balanced and all primary panels fit |
| Laptop, 1280 × 720 | Timeline overlaps the bottom of the properties panel |
| Compact landscape, 900 × 600 | Properties disappear; Export GIF and Settings are off-screen; tool targets shrink as low as 19 px high |
| Phone, 390 × 844 | Header actions measure about 776 px inside a 390 px viewport; most actions are unreachable; properties disappear; fitted canvas is only about 210 px square |
| Persist 7 FPS and reload | Runtime restores 7 FPS, but the visible value and slider both still say 12 FPS |
| Copy and Ctrl/Cmd+V | Paste succeeds, then the `V` tool shortcut clears the pasted selection |
| Undo after autosave, then reload | Undo changes the current session, but refresh restores the pre-undo state |
| Tool accessibility | All 14 `.tool-btn` controls are non-semantic `div`s, absent from tab order, without roles or accessible names |
| Dialog accessibility | All three modal overlays lack dialog semantics, accessible labelling, focus trapping, and keyboard close behavior |
| Form accessibility | All three range inputs lack associated labels or `aria-label`s |
| Exports | PNG, project JSON, and GIF downloads succeed |

## Highest-priority product and UX problems

### P0 — Fix before calling the app responsive or production-ready

#### 1. The responsive UI removes or clips essential functionality

At 900 px and below, the properties panel is set to `display: none`, so layer choice, color, background color, brush size, and opacity have no alternative access path. The top action row remains full-width and is simply clipped by the viewport. On short screens, the flex-based tool rail compresses targets below comfortable pointer size. At 1280 × 720, the timeline overlays the inspector.

This is the largest current UX failure because users can see the app but cannot reach its core controls.

**Fix:** introduce deliberate desktop, tablet, and phone compositions instead of hiding fixed panels.

| Viewport | Recommended composition |
| --- | --- |
| Desktop ≥ 1200 px | Left tool rail, central canvas, contextual right inspector, full timeline |
| Tablet 768–1199 px | Compact icon header, collapsible inspector drawer, resizable timeline, no clipped actions |
| Phone < 768 px | Bottom tool bar, properties bottom sheet, collapsible frame strip, overflow menu for file/export actions |

Acceptance criteria:

- No action or panel is outside the viewport at 390 × 844, 768 × 1024, 900 × 600, 1280 × 720, or 1440 × 900.
- Every core drawing property is reachable within two taps on phone/tablet.
- Pointer targets stay at least 44 × 44 CSS px on touch layouts.
- The timeline, inspector, and zoom controls never overlap.
- The canvas fits available space without the current fixed 100 px allowance wasting most of a small workspace.

#### 2. Keyboard commands collide with browser shortcuts and each other

Unmodified `D` and `N` create frames, while tool switching also runs even when Ctrl/Cmd is held. Consequently Ctrl/Cmd+V pastes and then executes the `V` selection shortcut, clearing the pasted selection. Ctrl/Cmd+F, Ctrl/Cmd+T, Ctrl/Cmd+N, and Ctrl/Cmd+D can trigger app behavior alongside standard browser behavior. Advertised R, C, and L shape shortcuts are not implemented. Several shortcuts only recognize lowercase letters.

**Fix:** centralize keyboard commands, normalize keys, ignore tool/frame shortcuts when Ctrl/Cmd/Alt is held, prevent default only for commands the app owns, and keep tooltip labels generated from the same command registry.

#### 3. Persisted and imported state is not fully synchronized with the UI

FPS reloads internally but does not update the slider or its label. Opening a project also does not immediately make it the autosaved current project, so a refresh before the next edit can restore the previous work. Unsupported project versions fail silently.

**Fix:** create one `applyProjectState()` path used by startup, import, undo, and redo; update every related control from that state; autosave a successful import; show a useful error for invalid or unsupported files.

#### 4. Undo is not a durable source of truth

Undo and redo update the live document but do not schedule autosave. If the previous state has already saved, undoing and refreshing brings the undone content back. Canvas-size changes are not added to undo history even though width and height are included in snapshots.

**Fix:** make every document mutation a command, persist after undo/redo, and include project setting changes in the same history model. Selection-only actions should not create history entries.

#### 5. Accessibility blocks entire input modes

The tool rail, layer switch, frame cards, play control, add-frame control, and color swatches are mainly clickable `div`s. They cannot be reached or activated with a keyboard and expose little or no state to assistive technology. The page also disables user scaling and globally disables text selection.

**Fix:** use semantic buttons, labelled form controls, `aria-pressed`/`aria-selected`, proper dialogs, visible focus states, logical tab order, keyboard-operable menus, and screen-reader announcements for save/export state. Remove `maximum-scale=1`, `user-scalable=no`, and blanket `user-select: none` where unnecessary. Target WCAG 2.2 AA.

#### 6. Canvas and export inputs need guardrails

Canvas dimensions accept negative, zero, or extremely large values. Large canvases and many frames can make thumbnail and GIF creation expensive; GIF export currently renders and base64-encodes every frame on the main thread. If the remote GIF library is unavailable, `gifshot` is undefined and the processing overlay can remain stuck.

**Fix:** validate dimensions against sensible minimums/maximums, estimate export memory before starting, add cancel/progress/error states, guard optional dependencies, and move GIF encoding off the main thread.

### P1 — Make the product feel deliberate and premium

#### 7. The header has too many equally weighted actions

New, Save, Open, storage, undo, redo, theme, frame export, GIF export, settings, and the brand all compete in one bar. The visually strongest action is Export GIF, even during drawing. “Save” means download a file while a separate “Saved” toast means browser autosave, which creates two meanings for the same word.

**Recommended hierarchy:**

- **Project menu:** New, Open, Download project, recent/local projects.
- **Document identity:** editable project name plus “Saved locally” / “Saving…” status.
- **Edit cluster:** undo and redo, with disabled states.
- **Preview:** a clear preview mode separate from editing.
- **Export:** one primary button opening PNG, GIF, and future formats.
- **More:** theme, canvas settings, keyboard shortcuts, help.
- Remove the storage meter from the main bar; place accurate storage details in project settings if they are still useful.

#### 8. The properties panel is static rather than contextual

A 200 px brush preview dominates the inspector even when Select, Text, Shape, Fill, or Eraser is active. The same size and opacity controls remain visible when they have confusing or no effect—for example pencil width is rendered as a fixed 2 px.

**Fix:** make the inspector respond to the current tool or selection:

- Brush: preset, size, opacity, smoothing, pressure, preview.
- Shape: stroke, fill, width, corner/shape controls.
- Text: font, size, weight, alignment, line height, color.
- Selection: position, size, rotation, opacity, arrange, align, group.
- Canvas: dimensions, background, transparency, fit/zoom.

Reduce the brush preview to a compact live stroke sample and give the reclaimed space to useful controls.

#### 9. The animation workflow needs clearer intent

The “Background” plane is stored separately for every frame, but its label can imply a shared static background. Onion skin shows only the previous frame’s foreground. All frames have equal timing. Delete/duplicate buttons are tiny overlays on thumbnails, and HTML drag-and-drop is weak on touch.

**Fix:**

- Rename the two planes to something unambiguous, or introduce a real layer model.
- Let users choose whether a layer is shared across frames or frame-specific.
- Add previous and next onion skins with tint, opacity, and range.
- Add frame hold/duration controls before building full keyframe animation.
- Use a selected-frame action menu and keyboard commands rather than 18 px overlay buttons.
- Support touch reordering with a long-press drag handle.
- Show frame number, total duration, and current time in the transport.

#### 10. First-run discoverability is too low

The initial state is an unexplained blank canvas. Native title tooltips reveal some shortcuts, but grouping, box select, quick-line hold, palette editing, text editing, and foreground/background behavior are hidden knowledge.

**Fix:** add a dismissible three-step first-run guide and an always-available shortcut/help panel. Use polished tooltips with tool name, shortcut, and one-line explanation. Include an optional sample two-frame project so playback and onion skin are immediately understandable.

#### 11. Project management is too fragile for repeat use

Only one unnamed project is autosaved. “New” overwrites that current slot after the debounce, and the warning always talks about unsaved progress without tracking a real dirty state. There is no recent-project view or recovery history.

**Fix:** add project names, a local project gallery, explicit duplication, last-opened timestamps, thumbnail previews, and a small recovery history. Use “Download project file” for JSON export and reserve “Saved locally” for autosave.

#### 12. Offline behavior does not match the local-first promise

Font Awesome and Gifshot are loaded from CDNs. Without network access, tool icons can disappear and GIF export is unavailable even though drawing data is local.

**Fix:** bundle a small local SVG icon set and the GIF encoder, then add a service worker and installable PWA shell. Local-first should mean the editor and export path work offline after first install.

### P2 — Quality, depth, and differentiation

- Add fit-to-screen, wheel zoom centered on the pointer, pinch zoom, spacebar pan, and a hand tool.
- Add transparent canvas/export; the checkerboard currently suggests transparency even though output is always filled.
- Add bring forward/send backward, alignment, distribution, duplicate-object, and snap controls.
- Add font choices and proper text metrics.
- Add frame ranges, ping-pong playback, and playback while editing another frame.
- Add WebM/MP4 and image-sequence export; consider SVG export for a single vector frame.
- Add reference-image import and a non-exporting reference layer.
- Add pressure/smoothing controls and stabilizer options for pen users.
- Add optional grid, guides, and symmetry tools.
- Add keyboard shortcut customization only after the default command model is reliable.

## Visual direction: how to make it look “like a million bucks”

The existing look is a good base. Premium here should mean calm, precise, and responsive—not more glass, glow, or decoration.

### 1. Establish a stronger visual hierarchy

- Use one elevated top bar and docked side/timeline surfaces rather than several floating panels with equally heavy shadows.
- Keep the canvas as the highest-contrast object in the workspace.
- Use the blue accent for selection and the primary next action, not for every active concept.
- Reserve red for destructive actions and playback stop.
- Introduce true disabled states for undo/redo and unavailable actions.

### 2. Tighten the design system

- Define a spacing scale such as 4, 8, 12, 16, 24, and 32 px and remove one-off inline spacing.
- Use two corner-radius levels: compact controls and larger panels.
- Standardize control heights at 32 px desktop and 44–48 px touch.
- Replace Font Awesome’s mixed visual weights with a consistent local SVG icon set.
- Use tabular numerals for FPS, zoom, frame count, size, coordinates, and rotation.
- Add intentional focus, hover, active, selected, disabled, and destructive states to every control.
- Keep blur subtle and ensure panels remain legible when backdrop blur is unsupported.

### 3. Add delightful, informative motion

- Animate inspector content changes with a fast fade/slide rather than moving the whole workspace.
- Make frame insertion visibly originate beside the selected frame.
- Use a brief thumbnail pulse after duplication.
- Animate “Saving…” to “Saved locally” without a floating toast covering the work.
- Respect `prefers-reduced-motion`.

### 4. Improve the canvas experience

- Show an unobtrusive canvas boundary and optional shadow, with transparency communicated honestly.
- Add a compact status strip: tool, active plane/layer, zoom, canvas dimensions, frame X/Y, and duration.
- Keep selection handles a consistent screen size at every zoom level.
- Use cursor shapes that communicate move, rotate, resize direction, fill, and forbidden states.
- Auto-fit on project open and canvas resize, with an easy “Fit” control next to the zoom value.

## Recommended product structure

```text
Top bar
├── Project menu + project name + local save state
├── Undo / redo
├── Preview
└── Export + More

Editor
├── Tool rail
├── Canvas workspace
└── Contextual inspector

Timeline dock
├── Transport + FPS + duration
├── Frame strip
└── Selected-frame actions
```

On tablet, the inspector becomes a drawer. On phone, the tool rail becomes a bottom bar, the inspector becomes a bottom sheet, and the timeline collapses to the current frame plus a filmstrip button. The information architecture stays the same even though its presentation changes.

## Engineering foundation required for polish

The current 3,532-line `index.html` is impressive as a prototype, but embedded CSS, markup, state, rendering, persistence, export, and inline event handlers make changes risky and automated testing difficult.

Recommended boundaries, without requiring a heavy framework:

- `model/`: project, frame, layer/plane, drawable object schemas and migrations.
- `commands/`: every undoable document mutation.
- `render/`: canvas renderer, hit testing, thumbnails, onion skin, export renderer.
- `storage/`: IndexedDB projects, recovery snapshots, import/export validation.
- `ui/`: toolbar, inspector, timeline, dialogs, responsive shell.
- `input/`: pointer, touch gestures, keyboard command registry.
- `export/`: PNG/GIF/video encoders and progress/cancellation.
- `styles/`: tokens, components, layouts, responsive rules.

Add:

- Runtime validation for imported project JSON and explicit migrations by version.
- Import sanitization; imported thumbnail-like fields should never be interpolated into `innerHTML`.
- Unit tests for geometry, erasing, project migrations, commands, and serialization.
- Browser tests for the golden create → duplicate → preview → save → reload → export path.
- Responsive screenshot tests for the five audit viewports.
- Accessibility automation plus manual keyboard and screen-reader passes.
- Performance budgets for pointer latency, thumbnail rendering, project load, and export memory.

Other implementation issues to address during the refactor:

- Thumbnail rendering scales from canvas width only, which can crop tall portrait canvases.
- History stores complete project snapshots and can become expensive as frames grow.
- Storage usage is compared to a hard-coded 100 MB rather than the browser’s actual storage estimate.
- Object URLs created for project downloads are not revoked.
- Project and export filenames inconsistently use `motionsketch` and `sketchmotion`.
- Canvas resize changes dimensions without defining whether existing art should crop, scale, or anchor.

## Practical roadmap

### Phase 1 — Trustworthy core

Goal: every existing feature is reachable, consistent, keyboard-safe, and persistent.

- Rebuild responsive shell and prevent panel overlap/clipping.
- Create central project-state hydration and UI synchronization.
- Fix autosave after import, undo, and redo.
- Replace shortcut handling with a command registry.
- Add canvas validation and guarded export failure states.
- Make current controls semantic and keyboard-operable.
- Add automated smoke tests for persistence and export.

Exit criteria: all P0 acceptance criteria pass at the five target viewports; save/reload never changes visible document state; keyboard commands do not trigger unintended app or browser behavior.

### Phase 2 — Premium editing loop

Goal: create → animate → preview → export feels fast and self-explanatory.

- Simplify top bar and clarify local save versus file download.
- Build contextual inspector.
- Improve timeline actions, touch reordering, frame duration, and onion skin.
- Add fit/pan/pinch/wheel canvas navigation.
- Add first-run guide, polished tooltips, shortcut reference, and empty-state sample.
- Bundle dependencies and ship the offline PWA shell.

Exit criteria: a first-time user can make and export a three-frame loop without documentation; a returning user can reopen any named local project; phone/tablet workflows retain full drawing control.

### Phase 3 — Differentiation

Goal: make SketchMotion memorable rather than merely competent.

- Shared versus frame-specific layers.
- Reference images, grids, guides, and better brush stabilization.
- Arrange/align/snap controls.
- Transparent, video, and sequence exports.
- Reusable loop templates and social aspect-ratio presets.
- Optional audio or timing markers if user demand supports it.

## Suggested success measures

- Time for a new user to export a first loop.
- Percentage of started projects that reach preview and export.
- Save/reload document fidelity across automated randomized projects.
- Median pointer-to-paint latency and timeline thumbnail update time.
- Export completion/failure rate by frame count and canvas size.
- Responsive task completion at phone, tablet, laptop, and desktop sizes.
- Keyboard-only completion of the non-canvas project workflow.
- WCAG 2.2 AA automated and manual audit results.

## Bottom line

SketchMotion does not need a reinvention. It needs a focused product pass around the strong editor that is already there. Fix the responsive shell, state reliability, shortcuts, and accessibility first. Then simplify the header, make the inspector contextual, and elevate the timeline into the heart of the animation workflow. Once those foundations are solid, offline packaging, richer timing, better canvas navigation, and a few signature animation features can turn this from an impressive prototype into a polished creative product.
