# SketchMotion

A local-first, browser-based flipbook and motion-sketching editor. Projects autosave in the browser and can be downloaded as JSON; exports include PNG, transparent PNG, SVG, PNG-frame ZIP, GIF, and WebM.

## Run locally

```bash
npm install
npm run dev
```

## Verify and build

```bash
npm run test
npx playwright test --project=chromium
npm run build
npm run build:portable
```

The normal build is written to `dist/` for GitHub Pages at `/motionsketch/`. The self-contained offline-friendly file is written to `dist-portable/index.html`.

For the complete browser matrix, install the Playwright engines once, then run the suite per browser:

```bash
npx playwright install chromium firefox webkit
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Release checks

The browser suite covers drawing, editing, frame timing, persistence, project migration/import validation, export, responsive layouts, PWA metadata, and automated accessibility. Release work is tracked in `SKETCHMOTION_IMPLEMENTATION_PLAN.md`.
