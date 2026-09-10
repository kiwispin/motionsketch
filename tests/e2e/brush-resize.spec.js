import { expect, test } from '@playwright/test';

// This is the three-point brush mark from Ball.json frame 22 (the third
// giant-dot frame in the source file). It deliberately keeps the original
// 200 px brush size and short centerline that exposed the resize bug.
const ballStroke = {
  type: 'brush',
  brushType: 'brush',
  color: '#000000',
  size: 200,
  opacity: 1,
  points: [
    { x: 423.0174081237911, y: 450.29013539651834, p: 0.951171875 },
    { x: 429.9806576402321, y: 443.3268858800773, p: 0.9619140625 },
    { x: 433.4622823984526, y: 443.3268858800773, p: 0.8115234375 }
  ],
  fillColor: null,
  sx: 1,
  sy: 1,
  angle: 0,
  symmetric: false
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

test('scales the full actual Ball-shaped brush, including nonuniform thickness', async ({ page }) => {
  const result = await page.evaluate((source) => {
    const resize = (stroke, axis, factor) => {
      const bounds = window.app.getStrokeBounds(stroke);
      window.app.tool = 'select';
      window.app.selectedObject = { stroke, layer: 'ink', index: 0, bounds: { ...bounds } };
      window.app.calcBounds(stroke);
      const handle = axis === 'x'
        ? { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 }
        : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h };
      const pos = axis === 'x'
        ? { x: bounds.x + bounds.w * factor, y: handle.y }
        : { x: handle.x, y: bounds.y + bounds.h * factor };
      window.app.onDown(handle);
      window.app.onMove(pos);
      window.app.onUp();
    };
    const stroke = structuredClone(source);
    window.app.frames[0].strokes = [stroke];
    const before = window.app.getStrokeBounds(stroke);
    resize(stroke, 'x', 0.5);
    resize(stroke, 'y', 0.5);
    const after = window.app.getStrokeBounds(stroke);
    window.app.selectedObject = null;
    window.app.renderCanvas();
    const image = window.app.ctx.getImageData(0, 0, window.app.canvasWidth, window.app.canvasHeight).data;
    let minY = window.app.canvasHeight;
    let maxY = -1;
    for (let y = 0; y < window.app.canvasHeight; y++) {
      for (let x = 0; x < window.app.canvasWidth; x++) {
        const offset = (y * window.app.canvasWidth + x) * 4;
        if (image[offset + 3] > 0 && image[offset] < 128 && image[offset + 1] < 128 && image[offset + 2] < 128) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return {
      before,
      after,
      scales: { sx: stroke.sx, sy: stroke.sy },
      centerline: stroke.points,
      renderedHeight: maxY - minY + 1
    };
  }, ballStroke);

  expect(result.scales.sx).toBeCloseTo(0.5, 8);
  expect(result.scales.sy).toBeCloseTo(0.5, 8);
  expect(result.after.w).toBeCloseTo(result.before.w / 2, 8);
  expect(result.after.h).toBeCloseTo(result.before.h / 2, 8);
  expect(result.centerline).not.toEqual(ballStroke.points);
  expect(result.renderedHeight).toBeGreaterThan(95);
  expect(result.renderedHeight).toBeLessThan(112);
});

test('accumulates repeated nonuniform resizes for both multi-point and single-dot brushes', async ({ page }) => {
  const result = await page.evaluate((source) => {
    const resize = (stroke, axis, factor) => {
      const bounds = window.app.getStrokeBounds(stroke);
      window.app.tool = 'select';
      window.app.selectedObject = { stroke, layer: 'ink', index: 0, bounds: { ...bounds } };
      window.app.calcBounds(stroke);
      const handle = axis === 'x'
        ? { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 }
        : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h };
      const pos = axis === 'x'
        ? { x: bounds.x + bounds.w * factor, y: handle.y }
        : { x: handle.x, y: bounds.y + bounds.h * factor };
      window.app.onDown(handle);
      window.app.onMove(pos);
      window.app.onUp();
    };
    const multi = structuredClone(source);
    const single = {
      ...structuredClone(source),
      size: 60,
      points: [{ x: 300, y: 300, p: 0.5 }]
    };

    resize(multi, 'y', 0.5);
    resize(multi, 'y', 0.5);
    resize(single, 'x', 0.5);
    resize(single, 'x', 0.5);
    return {
      multi: { sx: multi.sx, sy: multi.sy, bounds: window.app.getStrokeBounds(multi) },
      single: { sx: single.sx, sy: single.sy, bounds: window.app.getStrokeBounds(single) }
    };
  }, ballStroke);

  expect(result.multi.sy).toBeCloseTo(0.25, 8);
  expect(result.multi.sx).toBeCloseTo(1, 8);
  expect(result.single.sx).toBeCloseTo(0.25, 8);
  expect(result.single.sy).toBeCloseTo(1, 8);
  expect(result.single.bounds.w).toBeCloseTo(15, 8);
});

test('keeps resized brush selectable and preserves a canvas-space eraser hole', async ({ page }) => {
  const result = await page.evaluate((source) => {
    const resize = (stroke, axis, factor) => {
      const bounds = window.app.getStrokeBounds(stroke);
      window.app.tool = 'select';
      window.app.selectedObject = { stroke, layer: 'ink', index: 0, bounds: { ...bounds } };
      window.app.calcBounds(stroke);
      const handle = axis === 'x'
        ? { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 }
        : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h };
      const pos = axis === 'x'
        ? { x: bounds.x + bounds.w * factor, y: handle.y }
        : { x: handle.x, y: bounds.y + bounds.h * factor };
      window.app.onDown(handle);
      window.app.onMove(pos);
      window.app.onUp();
    };
    const stroke = structuredClone(source);
    const originalPoints = structuredClone(stroke.points);
    resize(stroke, 'y', 0.5);
    const resizedPoints = structuredClone(stroke.points);
    const point = stroke.points[1];
    const hit = window.app.strokeHit(stroke, point);
    const erased = window.app.eraseStrokeWithSegment(stroke, point, point, 8);
    return {
      hit,
      points: erased[0].points,
      holes: erased[0].holes,
      scale: { sx: stroke.sx, sy: stroke.sy },
      originalPoints,
      resizedPoints
    };
  }, ballStroke);

  expect(result.hit).toBe(true);
  expect(result.scale.sy).toBeCloseTo(0.5, 8);
  expect(result.holes).toHaveLength(1);
  expect(result.holes[0].length).toBeGreaterThan(10);
  expect(result.points).toEqual(result.resizedPoints);
});

test('exports anisotropically resized brush thickness to SVG', async ({ page }) => {
  const svg = await page.evaluate(async (source) => {
    const stroke = structuredClone(source);
    stroke.size = 40;
    stroke.sx = 0.5;
    stroke.sy = 0.25;
    window.app.frames[0].strokes = [stroke];
    const oldCreate = URL.createObjectURL;
    const oldClick = HTMLAnchorElement.prototype.click;
    let textPromise;
    URL.createObjectURL = (blob) => {
      textPromise = blob.text();
      return 'blob:brush-resize-test';
    };
    HTMLAnchorElement.prototype.click = () => {};
    try {
      window.app.exportSVG();
      return await textPromise;
    } finally {
      URL.createObjectURL = oldCreate;
      HTMLAnchorElement.prototype.click = oldClick;
    }
  }, ballStroke);

  expect(svg).toContain('scale(0.5 0.25)');
  expect(svg).toContain('stroke-width="40"');
});

test('retains a top-handle resize through undo, redo, duplicate, and reload', async ({ page }) => {
  const resized = await page.evaluate((source) => {
    const stroke = structuredClone(source);
    window.app.frames[0].strokes = [stroke];
    window.app.tool = 'select';
    window.app.selectedObject = { stroke, layer: 'ink', index: 0 };
    window.app.calcBounds(stroke);
    const bounds = { ...window.app.selectedObject.bounds };
    const handle = { x: bounds.x + bounds.w / 2, y: bounds.y };
    window.app.onDown(handle);
    window.app.onMove({ x: handle.x, y: bounds.y + bounds.h / 2 });
    window.app.onUp();
    const afterResize = structuredClone(stroke);
    const resizedHeight = window.app.getStrokeBounds(stroke).h;
    const undone = window.app.undo();
    const undoHeight = window.app.getStrokeBounds(window.app.frames[0].strokes[0]).h;
    const redone = window.app.redo();
    const redoStroke = window.app.frames[0].strokes[0];
    const resizedForDuplicate = structuredClone(redoStroke);
    window.app.duplicateFrame(0);
    return {
      afterResize,
      resizedHeight,
      undoHeight,
      undoResult: undone,
      redoResult: redone,
      countAfterDuplicate: window.app.frames.length,
      duplicateStroke: window.app.frames[1].strokes[0],
      resizedForDuplicate
    };
  }, ballStroke);

  expect(resized.afterResize.sy).toBeCloseTo(0.5, 8);
  expect(resized.resizedHeight).toBeCloseTo(resized.undoHeight / 2, 8);
  expect(resized.undoResult).toBe(true);
  expect(resized.redoResult).toBe(true);
  expect(resized.countAfterDuplicate).toBe(2);
  expect(resized.duplicateStroke).toEqual(resized.resizedForDuplicate);

  await page.waitForTimeout(1_200);
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.frames);
  await expect.poll(() => page.evaluate(() => ({
    frameCount: window.app.frames.length,
    strokeCounts: window.app.frames.map((frame) => frame.strokes.length),
    scales: window.app.frames.map((frame) => frame.strokes[0]?.sy),
    equal: JSON.stringify(window.app.frames[0].strokes[0]) === JSON.stringify(window.app.frames[1].strokes[0])
  }))).toEqual({ frameCount: 2, strokeCounts: [1, 1], scales: [0.5, 0.5], equal: true });
});
