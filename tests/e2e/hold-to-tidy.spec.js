import { expect, test } from '@playwright/test';

// A hand-drawn version of a path: points every few pixels with a gentle wobble.
const wobbly = (corners, amp = 3) => {
  const out = [];
  for (let c = 1; c < corners.length; c++) {
    const [x0, y0] = corners[c - 1], [x1, y1] = corners[c];
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10));
    for (let s = c === 1 ? 0 : 1; s <= steps; s++) {
      const t = s / steps, i = out.length;
      const wob = amp * (Math.sin(i * 0.5) * 0.7 + Math.sin(i * 1.3 + 1) * 0.3);
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      out.push([x0 + (x1 - x0) * t - (y1 - y0) / len * wob, y0 + (y1 - y0) * t + (x1 - x0) / len * wob]);
    }
  }
  return out;
};
const loop = (cx, cy, rx, ry) => Array.from({ length: 41 }, (_, i) => {
  const a = -0.2 + i / 40 * (Math.PI * 2 + 0.4);
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});

// Draw through the points in project pixels, then hold still if asked. A slow
// test browser can stall mid-line, so holding only counts once the line is
// finished.
const draw = async (page, points, { hold = true, thenMoveTo } = {}) => {
  const box = await page.locator('#rendering-canvas').boundingBox();
  const at = ([x, y]) => [box.x + x * box.width / 600, box.y + y * box.height / 600];
  await page.evaluate(() => { window.app.quickLineDelay = 60000; });
  await page.mouse.move(...at(points[0]));
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...at(point));
  if (hold) {
    const [x, y] = at(points[points.length - 1]);
    await page.evaluate(() => { window.app.quickLineDelay = 550; });
    await page.mouse.move(x + 0.5, y);
    await page.waitForTimeout(800);
  }
  if (thenMoveTo) await page.mouse.move(...at(thenMoveTo), { steps: 5 });
};
const lastStroke = (page) => page.evaluate(() => {
  const strokes = window.app.frames[window.app.frameIndex].strokes;
  const stroke = strokes[strokes.length - 1];
  if (!stroke) return null;
  const xs = stroke.points.map((p) => p.x), ys = stroke.points.map((p) => p.y);
  return { count: strokes.length, points: stroke.points.length, sharp: Boolean(stroke.sharp), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => { window.app.confirmNewAnimation(); window.app.setTool('brush'); });
});

for (const [name, points, expected] of [
  ['Line', wobbly([[80, 400], [460, 180]]), { points: 2, sharp: true }],
  ['Curve', wobbly(loop(300, 300, 150, 150).slice(4, 30)), { sharp: false }],
  ['Zigzag', wobbly([[300, 80], [200, 280], [360, 300], [260, 520]], 2), { points: 4, sharp: true }],
  ['Circle', wobbly(loop(300, 300, 160, 155)), { points: 73, sharp: false }],
  ['Oval', wobbly(loop(300, 300, 220, 110)), { points: 73, sharp: false }],
  ['Triangle', wobbly([[300, 100], [480, 440], [120, 440], [298, 104]]), { points: 4, sharp: true }],
  ['Square', wobbly([[150, 150], [450, 146], [454, 450], [148, 452], [150, 156]]), { points: 5, sharp: true }],
  ['Rectangle', wobbly([[80, 200], [520, 206], [516, 400], [84, 396], [80, 206]]), { points: 5, sharp: true }]
]) {
  test(`holding still at the end tidies the line: ${name}`, async ({ page }) => {
    await draw(page, points);
    await expect(page.locator('#shape-label')).toHaveText(name);
    await page.mouse.up();
    expect(await lastStroke(page)).toMatchObject({ count: 1, ...expected });
  });
}

test('one undo brings back the line as drawn; the next removes it', async ({ page }) => {
  await draw(page, wobbly([[150, 150], [450, 146], [454, 450], [148, 452], [150, 156]]));
  await page.mouse.up();
  expect(await lastStroke(page)).toMatchObject({ points: 5, sharp: true });

  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('Control+z');
  const drawn = await lastStroke(page);
  expect(drawn.sharp).toBe(false);
  expect(drawn.points).toBeGreaterThan(20);

  await page.keyboard.press('Control+z');
  expect(await lastStroke(page)).toBeNull();

  // Redo goes forward again: the drawn line, then the square.
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+y');
  expect(await lastStroke(page)).toMatchObject({ points: 5, sharp: true });
});

test('still holding, moving the mouse resizes the shape from its middle', async ({ page }) => {
  // The square ends near its top-left corner; dragging further out grows it.
  await draw(page, wobbly([[200, 200], [400, 196], [404, 400], [198, 402], [200, 206]]), { thenMoveTo: [100, 100] });
  await page.mouse.up();
  const shape = await lastStroke(page);
  expect(shape.sharp).toBe(true);
  expect(shape.width).toBeGreaterThan(350);
  expect(Math.abs(shape.width - shape.height)).toBeLessThan(1);
});

test('a line that never stops moving is left as drawn', async ({ page }) => {
  await draw(page, wobbly(loop(300, 300, 160, 155)), { hold: false });
  await page.mouse.up();
  const stroke = await lastStroke(page);
  expect(stroke.sharp).toBe(false);
  expect(stroke.points).not.toBe(73);
  await expect(page.locator('#shape-label')).toBeHidden();
});
