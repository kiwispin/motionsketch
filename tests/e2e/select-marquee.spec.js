import { expect, test } from '@playwright/test';

const seedStrokes = async (page) => {
  await page.evaluate(() => {
    const text = (label, x, y) => ({ type: 'text', text: label, x, y, width: 48, height: 24, sx: 1, sy: 1, color: '#000000', size: 24, bold: false, opacity: 1, angle: 0, points: [] });
    window.app.frames[0].strokes = [text('top-left', 4, 30), text('middle', 280, 300), text('bottom-right', 540, 570)];
    window.app.frameIndex = 0;
    window.app.setTool('select');
    window.app.renderUI();
    window.app.renderCanvas();
  });
};

const selectionCount = (page) => page.evaluate(() => {
  const selected = window.app.selectedObject;
  if (!selected) return 0;
  return selected.isGroup ? selected.items.length : 1;
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

test('a marquee started outside the canvas selects everything it covers', async ({ page }) => {
  await seedStrokes(page);
  const canvas = await page.locator('#rendering-canvas').boundingBox();
  const workspace = await page.locator('.workspace').boundingBox();
  const startX = Math.max(workspace.x + 4, canvas.x - 30);
  const startY = Math.max(workspace.y + 4, canvas.y - 30);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 4 });
  await expect(page.locator('#selection-marquee')).toBeVisible();
  await page.mouse.move(canvas.x + canvas.width + 20, canvas.y + canvas.height + 20, { steps: 4 });
  await page.mouse.up();

  await expect(page.locator('#selection-marquee')).toBeHidden();
  expect(await selectionCount(page)).toBe(3);

  // A click in the empty workspace clears the selection.
  await page.mouse.click(startX, startY);
  expect(await selectionCount(page)).toBe(0);
});

test('Ctrl+A selects all artwork on the active layer and switches to Select', async ({ page }) => {
  await seedStrokes(page);
  await page.evaluate(() => window.app.setTool('brush'));
  await page.locator('#rendering-canvas').focus();

  await page.keyboard.press('ControlOrMeta+a');

  expect(await page.evaluate(() => window.app.tool)).toBe('select');
  expect(await selectionCount(page)).toBe(3);
  expect(await page.evaluate(() => window.getSelection().toString())).toBe('');
});
