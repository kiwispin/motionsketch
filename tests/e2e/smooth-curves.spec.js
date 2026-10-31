import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => {
    window.app.confirmNewAnimation();
    window.app.setTool('brush');
  });
});

test('a fast brush stroke keeps every mouse position the browser bundled together', async ({ page }) => {
  const box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  const points = await page.evaluate(({ x, y }) => {
    // One move event carrying eleven positions along a curve, as a browser
    // sends them when the mouse moves quickly.
    const at = (i) => ({ clientX: x + 100 + i * 20, clientY: y + 100 + Math.sin(i / 3) * 80, pointerType: 'mouse', buttons: 1, pressure: 0.5 });
    const bundled = Array.from({ length: 11 }, (_, i) => new PointerEvent('pointermove', at(i)));
    const event = new PointerEvent('pointermove', at(10));
    event.getCoalescedEvents = () => bundled;
    window.dispatchEvent(event);
    return window.app.currentStroke.points.length;
  }, box);
  await page.mouse.up();
  expect(points).toBeGreaterThanOrEqual(11);
});

test('freehand strokes curve between points; shapes keep sharp corners', async ({ page }) => {
  const inkAt = (x, y) => page.evaluate(([px, py]) => window.app.canvas.getContext('2d').getImageData(px, py, 1, 1).data[3], [x, y]);
  const draw = (stroke) => page.evaluate((s) => {
    const app = window.app;
    app.frames[app.frameIndex].strokes = [{ color: '#000000', size: 6, opacity: 1, fillColor: null, sx: 1, sy: 1, angle: 0, ...s }];
    app.renderCanvas();
  }, stroke);
  const points = [[100, 300], [300, 100], [500, 300]].map(([x, y]) => ({ x, y, p: 0.5 }));

  // A three-point brush stroke bends round its middle point instead of
  // making a sharp corner on it.
  await draw({ type: 'brush', brushType: 'brush', points });
  expect(await inkAt(300, 100)).toBe(0);
  expect(await inkAt(275, 175)).toBeGreaterThan(0);

  // The same points as a straight line shape keep the corner.
  await draw({ type: 'line', brushType: 'brush', points });
  expect(await inkAt(300, 102)).toBeGreaterThan(0);
});
