import { expect, test } from '@playwright/test';

const dot = (x, color = '#000000') => ({ type: 'brush', brushType: 'brush', color, size: 40, opacity: 1, points: [{ x, y: 300, p: 0.5 }] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate((strokes) => {
    const app = window.app;
    app.confirmNewAnimation();
    app.frames = strokes.map((stroke) => ({ strokes: [stroke], paperStrokes: [], hold: 1 }));
    app.frameIndex = 2;
    app.renderUI();
    app.renderCanvas();
    // Count which frames get a thumbnail drawn from here on.
    window.thumbnailDraws = [];
    const original = app.updateThumbnails.bind(app);
    app.updateThumbnails = (indices = null) => {
      window.thumbnailDraws.push(...(indices ?? app.frames.map((_, index) => index)));
      return original(indices);
    };
  }, [dot(100), dot(200), dot(300), dot(400), dot(500)]);
});

const draws = (page) => page.evaluate(() => window.thumbnailDraws.splice(0));
const thumbs = (page) => page.evaluate(() => window.app.frames.map((frame) => frame.thumb));

test('drawing, undo and redo redraw only the frame that changed', async ({ page }) => {
  const before = await thumbs(page);
  await page.evaluate(() => {
    window.app.setTool('brush');
    window.app.onDown({ x: 100, y: 100 }, 0.5);
    window.app.onMove({ x: 300, y: 120 }, 0.5);
    window.app.onUp();
  });
  expect(await draws(page)).toEqual([2]);
  const afterStroke = await thumbs(page);
  expect(afterStroke[2]).not.toBe(before[2]);
  expect(afterStroke.filter((thumb, index) => index !== 2)).toEqual(before.filter((thumb, index) => index !== 2));

  await page.evaluate(() => window.app.undo());
  expect(await draws(page)).toEqual([2]);
  expect(await thumbs(page)).toEqual(before);

  await page.evaluate(() => window.app.redo());
  expect(await draws(page)).toEqual([2]);
  expect(await thumbs(page)).toEqual(afterStroke);
});

test('timeline changes draw only new frames, and canvas settings redraw all', async ({ page }) => {
  await page.evaluate(() => window.app.duplicateFrame(2));
  expect(await draws(page)).toEqual([3]);
  await page.evaluate(() => window.app.addFrame());
  expect(await draws(page)).toEqual([4]);
  await page.evaluate(() => window.app.deleteFrame(0));
  expect(await draws(page)).toEqual([]);

  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  await page.locator('#canvas-width').fill('800');
  await page.locator('#settings-apply').click();
  expect((await draws(page)).sort()).toEqual([0, 1, 2, 3, 4, 5]);
});

test('style changes to selected artwork refresh its thumbnail once they settle', async ({ page }) => {
  const before = await thumbs(page);
  await page.evaluate(() => {
    const app = window.app;
    app.setTool('select');
    app.selectedObject = { stroke: app.frames[2].strokes[0], layer: 'ink', index: 0 };
    app.calcBounds(app.selectedObject.stroke);
    app.setColor('#ff0000');
    for (let size = 10; size <= 60; size += 10) app.setSize(String(size));
  });
  await expect.poll(() => page.evaluate(() => window.thumbnailDraws.length)).toBeGreaterThan(0);
  expect(await draws(page)).toEqual([2]);
  const after = await thumbs(page);
  expect(after[2]).not.toBe(before[2]);
  expect(after.filter((thumb, index) => index !== 2)).toEqual(before.filter((thumb, index) => index !== 2));
});
