import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const line = (points, extra = {}) => ({ type: 'brush', brushType: 'brush', color: '#0000ff', size: 30, opacity: 1, points: points.map(([x, y]) => ({ x, y, p: 0.5 })), ...extra });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

test('an eraser drag stores one compact sweep per stroke instead of an outline per move', async ({ page }) => {
  const result = await page.evaluate((stroke) => {
    const app = window.app;
    app.frames[0].strokes = [stroke];
    app.setTool('eraser');
    app.setSize(20);
    app.onDown({ x: 100, y: 300 }, 0.5, false);
    for (let x = 110; x <= 500; x += 10) app.onMove({ x, y: 300 }, 0.5);
    app.onUp();
    const holes = app.frames[0].strokes[0].holes;
    app.renderCanvas();
    const alphaAt = (x, y) => app.ctx.getImageData(x, y, 1, 1).data[3];
    return { holes: holes.length, r: holes[0].r, pathPoints: holes[0].path.length, chars: JSON.stringify(holes).length, erased: alphaAt(300, 300), kept: alphaAt(300, 280) };
  }, line([[50, 300], [550, 300]], { size: 60 }));

  expect(result.holes).toBe(1);
  expect(result.r).toBe(10);
  expect(result.pathPoints).toBe(41);
  // 40 moves used to store 40 outlines of 26 points each (~50 KB).
  expect(result.chars).toBeLessThan(1500);
  expect(result.erased).toBe(0);
  expect(result.kept).toBe(255);
});

test('opening a project converts stored eraser outlines to sweeps and joins each drag', async ({ page }) => {
  const project = await page.evaluate((stroke) => {
    const app = window.app;
    const path = [[100, 300], [140, 300], [180, 310], [220, 300]];
    const holes = path.slice(1).map(([x, y], i) => app.buildEraserHole({ x: path[i][0], y: path[i][1] }, { x, y }, 12));
    holes.push(app.buildEraserHole({ x: 400, y: 300 }, { x: 400, y: 300 }, 12));
    // An outline that is not an untouched eraser capsule must be kept as is.
    holes.push([{ x: 450, y: 280 }, { x: 470, y: 280 }, { x: 470, y: 320 }]);
    return { version: 7, width: 600, height: 600, frames: [{ strokes: [{ ...stroke, holes }], paperStrokes: [], hold: 1 }] };
  }, line([[50, 300], [550, 300]], { size: 60 }));

  await page.locator('#file-input').setInputFiles({ name: 'old-eraser.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0].holes.length)).toBe(3);

  const holes = await page.evaluate(() => window.app.frames[0].strokes[0].holes);
  expect(holes[0]).toEqual({ r: 12, path: [{ x: 100, y: 300 }, { x: 140, y: 300 }, { x: 180, y: 310 }, { x: 220, y: 300 }] });
  expect(holes[1]).toEqual({ r: 12, path: [{ x: 400, y: 300 }] });
  expect(holes[2]).toEqual([{ x: 450, y: 280 }, { x: 470, y: 280 }, { x: 470, y: 320 }]);

  const alpha = await page.evaluate(() => {
    window.app.renderCanvas();
    const at = (x, y) => window.app.ctx.getImageData(x, y, 1, 1).data[3];
    return { sweep: at(160, 305), dot: at(400, 300), polygon: at(466, 300), untouched: at(300, 300) };
  });
  expect(alpha).toEqual({ sweep: 0, dot: 0, polygon: 0, untouched: 255 });
});

test('erased strokes render the same in their paint box as on the full canvas', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window.app;
    const hole = { r: 15, path: [{ x: 60, y: 60 }, { x: 300, y: 300 }, { x: 560, y: 120 }] };
    const strokes = [
      { type: 'brush', brushType: 'highlighter', color: '#ff0000', size: 24, opacity: 0.6, points: [{ x: 120, y: 200, p: 0.5 }, { x: 260, y: 260, p: 0.5 }], angle: 0.7, holes: [hole] },
      { type: 'brush', brushType: 'brush', color: '#00aa00', size: 18, opacity: 1, sx: 1.8, sy: 1.8, points: [{ x: 200, y: 330, p: 0.5 }], holes: [hole] },
      { type: 'brush', brushType: 'brush', color: '#0000ff', size: 20, opacity: 1, symmetric: true, points: [{ x: 80, y: 120, p: 0.5 }, { x: 160, y: 160, p: 0.5 }], holes: [hole] }
    ];
    const render = () => {
      const c = document.createElement('canvas'); c.width = app.canvasWidth; c.height = app.canvasHeight;
      const ctx = c.getContext('2d');
      strokes.forEach((s) => app.drawObject(ctx, s, false, 'ink'));
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const boxed = render();
    const original = app.getStrokePaintBox;
    app.getStrokePaintBox = () => null;
    const full = render();
    app.getStrokePaintBox = original;
    let painted = 0, large = 0;
    for (let i = 3; i < full.length; i += 4) {
      if (full[i]) painted++;
      for (let k = i - 3; k <= i; k++) if (Math.abs(full[k] - boxed[k]) > 64) large++;
    }
    return { painted, large };
  });
  expect(result.painted).toBeGreaterThan(1000);
  // Only faint edge antialiasing may differ; nothing may be clipped away.
  expect(result.large).toBe(0);
});

test('SVG export cuts sweep holes with round-capped lines', async ({ page }) => {
  await page.evaluate((stroke) => {
    window.app.frames[0].strokes = [{ ...stroke, holes: [{ r: 10, path: [{ x: 100, y: 300 }, { x: 200, y: 300 }] }, { r: 5, path: [{ x: 400, y: 300 }] }] }];
  }, line([[50, 300], [550, 300]]));
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.app.exportSVG())]);
  const svg = (await readFile(await download.path())).toString();
  expect(svg).toContain('<polyline points="100,300 200,300" fill="none" stroke="black" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>');
  expect(svg).toContain('<circle cx="400" cy="300" r="5" fill="black"/>');
});
