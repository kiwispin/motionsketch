# Clipboard routing — 2026-09-14

- Confirmed using the supplied student project in an isolated browser: copying the six-item road-marking group on frame 7 succeeded, but clicking frame 8 routed Ctrl-V to the empty frame clipboard. Returning focus to the canvas allowed artwork paste.
- Keyboard paste now follows the most recent successful copy (artwork or whole frames), rather than changing clipboard when navigating the timeline. Explicit frame toolbar actions remain frame-only; text input handling is unchanged.
- Verified the original frame 7 → frame 8 workflow using actual mouse selection and Ctrl-C/Ctrl-V: frame 8 gains the six-item group, total frames remain 74; Undo restores its original eight strokes. The student file was only read, never modified or committed.
- Added Control and Meta regression tests with a stale frame clipboard, destination navigation, Undo, and switching back to whole-frame copy/paste.
- Portable build passed. Full Chromium suite: 88 passed. WebKit clipboard suite: 6 passed. Diff whitespace check passed.
- Local only; awaiting user acceptance. No UI/layout changes or deployment.

## Cross-frame position follow-up

- Artwork copy records its source frame. Pasting into a different frame preserves coordinates; same-frame duplicates retain the existing +20/+20 offset. Points, text positions and eraser holes use the same offset.
- Verified with the supplied project's six road markings: every pasted point on frame 8 exactly matches frame 7; total frame count remains 74. Original file remains untouched.
- Added text-coordinate and persistent-group/eraser-hole regressions. All seven Chromium clipboard tests passed; portable build passed.
