import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Three wide bands of colour to smudge between: red, yellow and blue.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => {
    const app = window.app;
    app.confirmNewAnimation();
    const band = (y, color) => ({ type: 'brush', brushType: 'brush', color, size: 150, opacity: 1, points: [{ x: -50, y, p: 0.5 }, { x: 650, y, p: 0.5 }] });
    app.frames[0].strokes.push(band(150, '#ff3b30'), band(300, '#ffcc00'), band(450, '#007aff'));
    app.renderCanvas();
    app.setBrushType('smudge');
    app.setSize(60);
  });
});

const drag = async (page, from, to, { hold = false } = {}) => {
  const box = await page.locator('#rendering-canvas').boundingBox();
  const at = ([x, y]) => [box.x + x * box.width / 600, box.y + y * box.height / 600];
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 12 });
  if (hold) await page.waitForTimeout(800);
  await page.mouse.up();
};
const smudges = (page) => page.evaluate(() => window.app.frames[0].strokes.filter((s) => s.brushType === 'smudge'));
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const pixel = (page, x, y) => page.evaluate(([px, py]) => {
  const canvas = document.createElement('canvas');
  canvas.width = window.app.canvasWidth; canvas.height = window.app.canvasHeight;
  const ctx = canvas.getContext('2d');
  window.app.renderFrameToContext(ctx, window.app.frames[0]);
  return Array.from(ctx.getImageData(px, py, 1, 1).data.slice(0, 3));
}, [x, y]);

test('S picks Smudge, and the panel shows Carry and Softness instead of colours', async ({ page }) => {
  await page.evaluate(() => window.app.setBrushType('brush'));
  await expect(page.locator('#smudge-carry')).toBeHidden();
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('s');
  expect(await page.evaluate(() => ({ tool: window.app.tool, type: window.app.brushType }))).toEqual({ tool: 'brush', type: 'smudge' });
  await expect(page.locator('#inspector-title')).toHaveText('Smudge');
  await expect(page.locator('#smudge-carry')).toBeVisible();
  await expect(page.locator('#smudge-softness')).toBeVisible();
  await expect(page.locator('.colour-group')).toBeHidden();

  await page.locator('#tool-brush-standard').evaluate((button) => button.click());
  await expect(page.locator('#smudge-carry')).toBeHidden();
  await expect(page.locator('.colour-group')).toBeVisible();
});

test('a smudge drags the colour where it starts into the next colour', async ({ page }) => {
  const yellowBefore = await pixel(page, 300, 260);
  await drag(page, [300, 150], [300, 330]);
  const [stroke] = await smudges(page);
  expect(stroke.points.length).toBeGreaterThan(20);
  expect(stroke.softness).toBe(50);

  // It starts red, and is still carrying some red when it reaches the yellow.
  const [r0, g0] = rgb(stroke.points[0].c);
  expect(r0).toBeGreaterThan(200);
  expect(g0).toBeLessThan(100);
  const [, gEnd] = rgb(stroke.points[stroke.points.length - 1].c);
  expect(gEnd).toBeGreaterThan(g0 + 40);

  // On the frame, the yellow along the smudge has turned orange.
  const after = await pixel(page, 300, 260);
  expect(after[1]).toBeLessThan(yellowBefore[1] - 20);
  // Away from it, the yellow is untouched.
  expect(await pixel(page, 100, 260)).toEqual(yellowBefore);
});

test('Carry sets how far the colour is dragged', async ({ page }) => {
  const greenAtEnd = async (carry) => {
    await page.evaluate((value) => { window.app.frames[0].strokes.splice(3); window.app.setSmudgeCarry(value); }, carry);
    await drag(page, [300, 150], [300, 330]);
    const [stroke] = await smudges(page);
    return rgb(stroke.points[stroke.points.length - 1].c)[1];
  };
  // Red has little green; a long carry keeps more red, so less green, at the end.
  expect(await greenAtEnd(95)).toBeLessThan(await greenAtEnd(10));
});

test('holding still does not tidy a smudge, and one undo removes it', async ({ page }) => {
  await page.evaluate(() => { window.app.quickLineDelay = 300; });
  await drag(page, [200, 150], [400, 160], { hold: true });
  await expect(page.locator('#shape-label')).toBeHidden();
  const [stroke] = await smudges(page);
  expect(stroke.points.length).toBeGreaterThan(20);
  expect(stroke.sharp).toBeUndefined();

  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('Control+z');
  expect(await smudges(page)).toHaveLength(0);
});

test('a smudge keeps its colours when the page is opened again', async ({ page }) => {
  await drag(page, [300, 150], [300, 330]);
  const [before] = await smudges(page);
  await expect(page.locator('#save-status-text')).toHaveText('Saved in this browser');
  await page.reload();
  await page.waitForFunction(() => window.app?.frames?.[0]?.strokes.length === 4);
  const [after] = await smudges(page);
  expect(after.points.map((p) => p.c)).toEqual(before.points.map((p) => p.c));
});

test('a smudge can be selected and moved like other lines', async ({ page }) => {
  await drag(page, [300, 150], [300, 330]);
  const [before] = await smudges(page);
  await page.evaluate(() => window.app.setTool('select'));
  const box = await page.locator('#rendering-canvas').boundingBox();
  const at = ([x, y]) => [box.x + x * box.width / 600, box.y + y * box.height / 600];
  await page.mouse.move(...at([300, 240]));
  await page.mouse.down();
  await page.mouse.move(...at([360, 240]), { steps: 6 });
  await page.mouse.up();
  const strokes = await page.evaluate(() => window.app.frames[0].strokes);
  const moved = strokes.find((s) => s.brushType === 'smudge');
  expect(Math.abs(moved.points[0].x - before.points[0].x - 60)).toBeLessThan(2);
  expect(moved.points.map((p) => p.c)).toEqual(before.points.map((p) => p.c));
  // The bands didn't move.
  expect(strokes[1].points[0].x).toBe(-50);
});

test('SVG export has the smudge as soft coloured lines', async ({ page }) => {
  await drag(page, [300, 150], [300, 330]);
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.app.exportSVG())]);
  const svg = (await readFile(await download.path())).toString();
  expect(svg).toContain('<feGaussianBlur stdDeviation="9.00"/>');
  expect(svg).toMatch(/<g opacity="1" filter="url\(#smudge-blur-\d+\)" fill="none" stroke-width="60" stroke-linecap="round"><line /);
  expect(svg).toContain('stroke="#ff3b30"');
});
