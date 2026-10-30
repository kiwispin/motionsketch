import { expect, test } from '@playwright/test';

const dot = (x, color) => ({ type: 'brush', brushType: 'brush', color, size: 60, opacity: 1, points: [{ x, y: 300, p: 0.5 }] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(([fg, bg]) => {
    const app = window.app;
    app.confirmNewAnimation();
    app.frames = [{ strokes: [fg], paperStrokes: [bg], hold: 1 }];
    app.frameIndex = 0;
    app.renderUI();
    app.renderCanvas();
  }, [dot(150, '#000000'), dot(450, '#ff0000')]);
});

// Colour of the background layer at a point, as [r, g, b].
const background = (page, x) => page.evaluate((px) => [...window.app.bgCtx.getImageData(px, 300, 1, 1).data].slice(0, 3), x);

test('locking the background keeps drawing on the foreground', async ({ page }) => {
  await page.click('#layer-paper');
  await expect(page.locator('#layer-paper')).toHaveAttribute('aria-pressed', 'true');

  // Locking while on the Background moves you to the Foreground.
  await page.click('#bg-lock');
  await expect(page.locator('#bg-lock')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#bg-lock')).toContainText('Locked');
  await expect(page.locator('#layer-ink')).toHaveAttribute('aria-pressed', 'true');

  // The Background can't be picked until it's unlocked, and says why.
  await page.evaluate(() => {
    const app = window.app;
    app.notices = [];
    const show = app.showExportNotice.bind(app);
    app.showExportNotice = (message, isError) => { app.notices.push(message); show(message, isError); };
  });
  await page.click('#layer-paper');
  await expect(page.locator('#layer-ink')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.app.notices)).toEqual(['The background is locked. Unlock it to draw on it.']);

  await page.click('#bg-lock');
  await expect(page.locator('#bg-lock')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#layer-paper');
  await expect(page.locator('#layer-paper')).toHaveAttribute('aria-pressed', 'true');
});

test('hiding the background hides it here but keeps it in the project and export', async ({ page }) => {
  expect(await background(page, 450)).toEqual([255, 0, 0]);

  await page.click('#bg-hide');
  await expect(page.locator('#bg-hide')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#bg-hide')).toContainText('Hidden');
  expect(await background(page, 450)).toEqual([255, 255, 255]);

  const kept = await page.evaluate(() => {
    const app = window.app;
    const canvas = document.createElement('canvas');
    canvas.width = app.canvasWidth;
    canvas.height = app.canvasHeight;
    app.renderFrameToContext(canvas.getContext('2d'), app.frames[0]);
    return {
      paper: app.frames[0].paperStrokes.length,
      exported: [...canvas.getContext('2d').getImageData(450, 300, 1, 1).data].slice(0, 3),
    };
  });
  expect(kept).toEqual({ paper: 1, exported: [255, 0, 0] });

  // Hidden means it can't be drawn on either.
  await page.click('#layer-paper');
  await expect(page.locator('#layer-ink')).toHaveAttribute('aria-pressed', 'true');

  await page.click('#bg-hide');
  await expect(page.locator('#bg-hide')).toHaveAttribute('aria-pressed', 'false');
  expect(await background(page, 450)).toEqual([255, 0, 0]);
});

test('the paint bucket ignores a hidden background', async ({ page }) => {
  // A background ring would normally stop the fill at its edge.
  const result = await page.evaluate(() => {
    const app = window.app;
    const ring = Array.from({ length: 73 }, (_, i) => ({ x: 300 + Math.cos(i / 36 * Math.PI) * 80, y: 200 + Math.sin(i / 36 * Math.PI) * 80, p: 0.5 }));
    app.frames[0].strokes = [];
    app.frames[0].paperStrokes = [{ type: 'brush', brushType: 'brush', color: '#000000', size: 8, opacity: 1, points: ring }];
    const inside = (mask) => mask[200 * app.canvasWidth + 300];
    const outside = (mask) => mask[20 * app.canvasWidth + 20];
    const shown = app.findFillRegion({ x: 300, y: 200 }).mask;
    app.toggleBackgroundHidden();
    const hidden = app.findFillRegion({ x: 300, y: 200 }).mask;
    return { shown: [inside(shown), outside(shown)], hidden: [inside(hidden), outside(hidden)] };
  });
  expect(result.shown).toEqual([1, 0]);
  expect(result.hidden).toEqual([1, 1]);
});
