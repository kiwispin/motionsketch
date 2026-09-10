# Timeline frame copy/paste candidate

## Changes

- Added transient timeline frame selection with normal click, Shift-click range selection, and Ctrl/Cmd-click toggling.
- Added distinct selected-frame styling while retaining the active-frame styling.
- Added a separate deep-copy frame clipboard and paste-after-active behavior that preserves source order and frame data, including artwork, paper strokes, background color, and hold.
- Routed Cmd/Ctrl+C/V by focused surface: timeline cards use the frame clipboard, while the canvas retains the existing artwork clipboard. Text-like inputs remain excluded by the existing keyboard guard.
- Cleared stale timeline selection at history mutation boundaries, undo/redo, import, new-animation reset, canvas focus, and frame navigation/mutation paths.
- Added focused browser test source covering selection, shortcut routing, deep-copy behavior, order/data preservation, and one-step undo.

## Status

| Area | Status | Evidence measured in this checkpoint |
| --- | --- | --- |
| Selection behavior | Measured passing | Focused Chromium file: 4/4 passed, including range/toggle highlighting. |
| Frame copy/paste data and order | Measured passing | Focused Chromium file: 4/4 passed, including ordered insertion and frame data assertions. |
| Deep-copy isolation | Measured passing | Focused Chromium file: 4/4 passed, including nested artwork/paper mutation isolation. |
| One-step undo | Measured passing | Focused Chromium file: 4/4 passed, including paste history delta and undo restoration. |
| Existing artwork clipboard | Measured passing | Focused Chromium file: 4/4 passed, including canvas-owned C routing. |
| Text-input shortcut routing | Measured passing | Focused Chromium file: 4/4 passed, including input-owned C/V assertion. |
| Accessibility regression | Measured passing | Existing Chromium hardening accessibility test: 1/1 passed with no serious/critical violations. |
| Portable build | Measured passing | `npm run build:portable` completed successfully. |
| Full browser regression status | Not measured | The full cross-browser suite remains outside this focused checkpoint. |

Root review: accepted for user local testing. Complete Chromium suite passed 57/57 (22.6 seconds), including the new frame clipboard tests. The rebuilt portable HTML contains the frame clipboard handlers and selection styling. Firefox/WebKit were not run for this scoped local checkpoint. No commit or push.

## Accepted scope

- Multi-frame selection, copy, and paste after the active frame.
- Transient selection highlighting and focused keyboard routing.
- Deep copies and one undo step for a multi-frame paste.

## Refused scope

- Multi-frame dragging, deletion, and cut were not added.
- FPS, shared artwork, project settings, and the existing single-frame duplicate action were not changed.
- No full browser suite or iterative polish was performed in this checkpoint.
