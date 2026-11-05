import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => { window.app.confirmNewAnimation(); window.app.setTool('brush'); });
});

const size = (page) => page.evaluate(() => ({
  brush: window.app.brushSize,
  slider: document.getElementById('brush-size').value,
  shown: document.getElementById('size-disp').textContent
}));
const overCanvas = async (page) => {
  const box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
};

test('Shift + scroll over the canvas makes the brush bigger or smaller', async ({ page }) => {
  await overCanvas(page);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -100);
  await expect.poll(() => size(page)).toEqual({ brush: 11, slider: '11', shown: '11' });
  // No label: the circle at the pointer shows the size.
  await expect(page.locator('#shape-label')).toBeHidden();

  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 100);
  await expect.poll(() => size(page)).toEqual({ brush: 7, slider: '7', shown: '7' });
  await page.keyboard.up('Shift');

  // Ctrl + scroll still zooms, and leaves the size alone.
  const zoom = await page.evaluate(() => window.app.zoom);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(() => page.evaluate(() => window.app.zoom)).toBeGreaterThan(zoom);
  expect((await size(page)).brush).toBe(7);
});

test('small touchpad movements add up to one step', async ({ page }) => {
  await overCanvas(page);
  await page.keyboard.down('Shift');
  for (let i = 0; i < 9; i++) await page.mouse.wheel(0, -10);
  await page.waitForTimeout(100);
  expect((await size(page)).brush).toBe(10);
  await page.mouse.wheel(0, -10);
  await expect.poll(() => size(page)).toMatchObject({ brush: 11 });
  await page.keyboard.up('Shift');
});

test('[ and ] change the size, and it stays between 1 and 200', async ({ page }) => {
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press(']');
  expect(await size(page)).toEqual({ brush: 11, slider: '11', shown: '11' });
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  expect((await size(page)).brush).toBe(9);

  await page.evaluate(() => window.app.setSize(195));
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  expect((await size(page)).brush).toBe(200);

  await page.evaluate(() => window.app.setSize(2));
  for (let i = 0; i < 3; i++) await page.keyboard.press('[');
  expect((await size(page)).brush).toBe(1);
});

test('the eraser and shapes change size too', async ({ page }) => {
  for (const tool of ['eraser', 'rect']) {
    await page.evaluate((name) => { window.app.setSize(10); window.app.setTool(name); }, tool);
    await page.locator('#rendering-canvas').focus();
    await page.keyboard.press(']');
    expect((await size(page)).brush).toBe(11);
  }
});

test('nothing changes with something selected, or while typing', async ({ page }) => {
  await page.evaluate(() => {
    const app = window.app;
    app.frames[0].strokes.push({ type: 'brush', brushType: 'brush', color: '#000000', size: 30, opacity: 1, points: [{ x: 300, y: 300, p: 0.5 }] });
    app.setTool('select');
    const stroke = app.frames[0].strokes[0];
    app.selectedObject = { stroke, layer: 'ink', index: 0 };
    app.calcBounds(stroke);
  });
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press(']');
  expect((await size(page)).brush).toBe(10);
  expect(await page.evaluate(() => window.app.frames[0].strokes[0].size)).toBe(30);

  await page.evaluate(() => { window.app.selectedObject = null; window.app.setTool('brush'); });
  await page.locator('#project-name').click();
  await page.keyboard.press(']');
  expect((await size(page)).brush).toBe(10);
});
