import { expect, test } from '@playwright/test';

// A group with another group inside it, as students make by grouping a
// selection that already holds a group. The inner line has an eraser hole.
const line = (x1, y1, x2, y2, extra = {}) => ({ type: 'brush', brushType: 'brush', color: '#000000', size: 20, opacity: 1, sx: 1, sy: 1, angle: 0, points: [{ x: x1, y: y1, p: 0.5 }, { x: x2, y: y2, p: 0.5 }], ...extra });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.errors = errors;
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate((parts) => {
    const app = window.app;
    app.confirmNewAnimation();
    const inner = { type: 'group', angle: 0, items: [parts.a, parts.b] };
    app.frames[0].strokes.push({ type: 'group', angle: 0, items: [inner, parts.c] });
    app.setTool('select');
    app.renderCanvas();
  }, {
    a: line(200, 200, 300, 200, { holes: [{ path: [{ x: 250, y: 200 }], r: 5 }] }),
    b: line(200, 300, 300, 300),
    c: line(350, 200, 350, 300)
  });
});

// Every point and hole on the frame, in drawing order.
const geometry = (page) => page.evaluate(() => {
  const out = [];
  const walk = (s) => {
    if (s.type === 'group') return s.items.forEach(walk);
    s.points.forEach((p) => out.push([Math.round(p.x), Math.round(p.y)]));
    (s.holes || []).forEach((h) => h.path.forEach((p) => out.push(['hole', Math.round(p.x), Math.round(p.y)])));
  };
  window.app.frames[0].strokes.forEach(walk);
  return out;
});

const press = (page, [x, y], [toX, toY]) => page.evaluate(([from, to]) => {
  const app = window.app;
  app.onDown(from);
  app.onMove({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  app.onMove(to);
  app.onUp();
}, [{ x, y }, { x: toX, y: toY }]);

test('a group with a group inside it can be dragged', async ({ page }) => {
  await press(page, [350, 250], [390, 270]);
  expect(await page.evaluate(() => window.app.selectedObject?.isPersistentGroup)).toBe(true);
  expect(await geometry(page)).toEqual([
    [240, 220], [340, 220], ['hole', 290, 220],
    [240, 320], [340, 320],
    [390, 220], [390, 320]
  ]);
  expect(page.errors).toEqual([]);

  // It is one step to undo.
  await page.evaluate(() => window.app.undo());
  expect((await geometry(page))[0]).toEqual([200, 200]);
});

test('its corner handle resizes the parts inside the inner group too', async ({ page }) => {
  await press(page, [350, 250], [350, 250]);
  const bounds = await page.evaluate(() => window.app.selectedObject.bounds);
  const corner = [bounds.x + bounds.w, bounds.y + bounds.h];
  await press(page, corner, [corner[0] + bounds.w, corner[1] + bounds.h]);
  const [first, second] = await geometry(page);
  // Twice the size, from the top-left corner: the first line is twice as long.
  expect(second[0] - first[0]).toBeCloseTo(200, -1);
  expect(page.errors).toEqual([]);
});

test('a selection holding a group and a line can be rotated', async ({ page }) => {
  await page.evaluate((extra) => {
    window.app.frames[0].strokes.push(extra);
    window.app.selectAll();
  }, line(450, 200, 450, 300));
  expect(await page.evaluate(() => window.app.selectedObject.items.length)).toBe(2);
  const bounds = await page.evaluate(() => window.app.selectedObject.bounds);
  const centre = [bounds.x + bounds.w / 2, bounds.y + bounds.h / 2];
  const handle = [centre[0], bounds.y - 25];
  // A quarter turn clockwise around the middle.
  await press(page, handle, [centre[0] + (centre[1] - handle[1]), centre[1]]);
  const points = await geometry(page);
  // The first inner line was flat; after a quarter turn it stands upright.
  expect(Math.abs(points[0][0] - points[1][0])).toBeLessThan(2);
  expect(page.errors).toEqual([]);
});

test('Ctrl+A on a frame holding only a group selects it and lets it move', async ({ page }) => {
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('Control+a');
  expect(await page.evaluate(() => window.app.selectedObject?.isPersistentGroup)).toBe(true);
  await press(page, [350, 250], [360, 250]);
  expect((await geometry(page))[0]).toEqual([210, 200]);
  expect(page.errors).toEqual([]);
});
