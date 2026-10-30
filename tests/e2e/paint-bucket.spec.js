import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// An outline drawn the way students draw: separate open strokes split across
// both layers, a 2px gap at the top right, and a bark mark inside.
const line = (from, to, size = 8) => ({ type: 'brush', brushType: 'brush', color: '#000000', size, opacity: 1, points: [{ x: from[0], y: from[1], p: 0.5 }, { x: to[0], y: to[1], p: 0.5 }] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate((outline) => {
    const app = window.app;
    app.confirmNewAnimation();
    app.frames[0].paperStrokes = [outline.left, outline.top, outline.bark];
    app.frames[0].strokes = [outline.right, outline.bottom];
    app.setLayer('ink');
    app.setTool('bucket');
    app.setColor('#8b5a2b');
    app.renderCanvas();
    window.pixel = (x, y) => {
      const canvas = document.createElement('canvas');
      canvas.width = app.canvasWidth; canvas.height = app.canvasHeight;
      const ctx = canvas.getContext('2d');
      app.renderFrameToContext(ctx, app.frames[0]);
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    };
  }, {
    left: line([200, 100], [200, 500]),
    top: line([200, 100], [310, 100]),
    right: line([320, 100], [320, 500]),
    bottom: line([200, 500], [320, 500]),
    bark: line([240, 250], [250, 300], 6)
  });
});

test('fills the area enclosed by separate strokes on both layers, beneath the lines', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window.app;
    app.onDown({ x: 280, y: 400 }, 0.5, false);
    const fill = app.frames[0].strokes[0];
    return {
      type: fill.type,
      layerStrokes: app.frames[0].strokes.length,
      outlines: fill.points.filter((point) => point.m).length,
      inside: window.pixel(280, 400),
      nearGap: window.pixel(300, 110),
      outside: window.pixel(100, 300),
      aboveGap: window.pixel(315, 95),
      bark: window.pixel(245, 275),
      edge: window.pixel(320, 300)
    };
  });
  expect(result.type).toBe('fill');
  expect(result.layerStrokes).toBe(3);
  // One outline for the area and one hole for the bark mark.
  expect(result.outlines).toBe(2);
  expect(result.inside).toBe('#8b5a2b');
  expect(result.nearGap).toBe('#8b5a2b');
  expect(result.outside).toBe('#ffffff');
  expect(result.aboveGap).toBe('#ffffff');
  expect(result.bark).toBe('#000000');
  expect(result.edge).toBe('#000000');
});

test('recolours an existing fill or a clicked line, and undo restores it', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window.app;
    app.onDown({ x: 280, y: 400 }, 0.5, false);
    app.setColor('#2ecc71');
    app.onDown({ x: 280, y: 400 }, 0.5, false);
    const afterRecolour = { strokes: app.frames[0].strokes.length, inside: window.pixel(280, 400) };
    app.undo();
    const afterUndo = window.pixel(280, 400);
    app.setColor('#ff0000');
    app.onDown({ x: 320, y: 300 }, 0.5, false);
    return { afterRecolour, afterUndo, lineColor: app.frames[0].strokes.find((stroke) => stroke.points[0].x === 320).color, strokes: app.frames[0].strokes.length };
  });
  expect(result.afterRecolour).toEqual({ strokes: 3, inside: '#2ecc71' });
  expect(result.afterUndo).toBe('#8b5a2b');
  expect(result.lineColor).toBe('#ff0000');
  expect(result.strokes).toBe(3);
});

test('a fill moves with Select and keeps its hole', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window.app;
    app.onDown({ x: 280, y: 400 }, 0.5, false);
    const fill = app.frames[0].strokes[0];
    const before = app.getPointBounds(fill.points);
    app.setTool('select');
    app.onDown({ x: 280, y: 400 }, 0.5, false);
    app.onMove({ x: 330, y: 400 }, 0.5);
    app.onUp();
    const after = app.getPointBounds(fill.points);
    return {
      moved: Math.round(after.x - before.x),
      outlines: fill.points.filter((point) => point.m).length,
      insideHole: app.containsPoint(fill.points, { x: 295, y: 275 }),
      insideFill: app.containsPoint(fill.points, { x: 330, y: 400 })
    };
  });
  expect(result).toEqual({ moved: 50, outlines: 2, insideHole: false, insideFill: true });
});

test('SVG export draws a fill as an even-odd path with its hole', async ({ page }) => {
  await page.evaluate(() => window.app.onDown({ x: 280, y: 400 }, 0.5, false));
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.app.exportSVG())]);
  const svg = (await readFile(await download.path())).toString();
  const path = svg.match(/<path d="([^"]+)" fill="#8b5a2b" fill-opacity="1" fill-rule="evenodd" stroke="none"\/>/);
  expect(path).not.toBeNull();
  expect(path[1].match(/Z M/g)).toHaveLength(1);
});
