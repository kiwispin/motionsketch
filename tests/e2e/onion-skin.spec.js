import { expect, test } from '@playwright/test';

const dot = (x) => ({ type: 'brush', brushType: 'brush', color: '#000000', size: 60, opacity: 1, points: [{ x, y: 300, p: 0.5 }] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate((strokes) => {
    const app = window.app;
    app.confirmNewAnimation();
    app.frames = strokes.map((stroke) => ({ strokes: [stroke], paperStrokes: [], hold: 1 }));
    app.frameIndex = 1;
    app.renderUI();
    app.renderCanvas();
  }, [dot(150), dot(300), dot(450)]);
});

// Colour of the drawing layer at a point, as [r, g, b, alpha].
const sample = (page, x) => page.evaluate((px) => [...window.app.ctx.getImageData(px, 300, 1, 1).data], x);

test('onion skin shows earlier frames in blue and later frames in green', async ({ page }) => {
  await page.evaluate(() => {
    const app = window.app;
    app.toggleOnion();
    app.setOnionAfter(1);
  });
  const before = await sample(page, 150);
  const after = await sample(page, 450);
  const current = await sample(page, 300);
  // Earlier frame: blue dominant. Later frame: green dominant. Both faint.
  expect(before[2]).toBeGreaterThan(before[0]);
  expect(before[2]).toBeGreaterThan(before[1]);
  expect(before[3]).toBeGreaterThan(0);
  expect(before[3]).toBeLessThan(255);
  expect(after[1]).toBeGreaterThan(after[0]);
  expect(after[1]).toBeGreaterThan(after[2]);
  expect(after[3]).toBeGreaterThan(0);
  expect(after[3]).toBeLessThan(255);
  expect(current).toEqual([0, 0, 0, 255]);

  // With tint off, the other frames show in their own colours, faintly.
  await page.evaluate(() => window.app.setOnionTint(false));
  const plain = await sample(page, 450);
  expect(plain.slice(0, 3)).toEqual([0, 0, 0]);
  expect(plain[3]).toBeGreaterThan(0);
  expect(plain[3]).toBeLessThan(255);

  // After = 0 hides the later frame again.
  await page.evaluate(() => window.app.setOnionAfter(0));
  expect((await sample(page, 450))[3]).toBe(0);
});

test('undo keeps the last 100 steps', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window.app;
    for (let i = 0; i < 130; i++) {
      app.saveState();
      app.frames[1].strokes.push({ type: 'brush', brushType: 'brush', color: '#ff0000', size: 4, opacity: 1, points: [{ x: i, y: 10, p: 0.5 }] });
    }
    const steps = app.history.length;
    let undone = 0;
    while (app.undo()) undone++;
    return { steps, undone, strokesLeft: app.frames[1].strokes.length };
  });
  expect(result.steps).toBe(101);
  expect(result.undone).toBe(101);
  // 130 additions, 101 undone: 1 original stroke plus the 29 oldest additions remain.
  expect(result.strokesLeft).toBe(30);
});
