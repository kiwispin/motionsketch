import { expect, test } from '@playwright/test';

const seed = (page) => page.evaluate(() => {
  const app = window.app;
  app.confirmNewAnimation();
  const dot = (x, y) => ({ type: 'brush', brushType: 'brush', color: '#e74c3c', size: 50, opacity: 1, points: [{ x, y, p: 0.5 }] });
  app.frames = [100, 200, 300].map((x) => ({ strokes: [dot(x, 300)], paperStrokes: [], hold: 1 }));
  app.frameIndex = 1;
  app.renderUI();
  app.renderCanvas();
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
});

test('frame badges show on the current frame only, until another frame is hovered', async ({ page }) => {
  await seed(page);
  const opacity = () => page.evaluate(() => [...document.querySelectorAll('#frames-list .frame-card .frame-delete-btn')].map((badge) => getComputedStyle(badge).opacity));
  await expect.poll(opacity).toEqual(['0', '1', '0']);
  await page.locator('#frames-list .frame-card').nth(2).hover();
  await expect.poll(opacity).toEqual(['0', '1', '1']);
});

test('the right panel is headed by the active tool or selection', async ({ page }) => {
  await seed(page);
  const panel = () => page.evaluate(() => ({ heading: document.getElementById('inspector-title').textContent, mode: document.querySelector('.props-panel').dataset.mode }));
  await page.evaluate(() => window.app.setTool('eraser'));
  expect(await panel()).toEqual({ heading: 'Eraser', mode: 'draw' });
  await page.evaluate(() => window.app.setTool('bucket'));
  expect(await panel()).toEqual({ heading: 'Fill', mode: 'other' });
  await page.evaluate(() => {
    const app = window.app;
    app.setTool('select');
    const stroke = app.frames[1].strokes[0];
    app.selectedObject = { stroke, layer: 'ink', index: 0 };
    app.calcBounds(stroke);
    app.renderCanvas();
  });
  expect(await panel()).toEqual({ heading: 'Stroke selected', mode: 'other' });
  await expect(page.locator('.props-panel .brush-preview')).toBeHidden();
});

for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [768, 1024], [390, 844]]) {
  test(`zoom stays above the timeline and the motion timeline never covers the canvas at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);
    await seed(page);
    const layout = () => page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const zoom = rect('.zoom-controls');
      const timeline = rect('.timeline-panel');
      const canvas = rect('#canvas-wrapper');
      return { zoomAboveTimeline: zoom.bottom <= timeline.top, zoomOnScreen: zoom.left >= 0 && zoom.right <= innerWidth, canvasClear: canvas.bottom <= timeline.top };
    });
    expect(await layout()).toEqual({ zoomAboveTimeline: true, zoomOnScreen: true, canvasClear: true });
    await page.evaluate(() => window.app.setTool('truck'));
    expect(await layout()).toEqual({ zoomAboveTimeline: true, zoomOnScreen: true, canvasClear: true });
  });
}

test('the header says Download and shows how much browser storage is used', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Download$/ })).toBeVisible();
  await page.evaluate(() => window.app.saveStorage());
  await expect(page.locator('.storage-label')).toHaveText(/^Storage \d+%$/);
});
