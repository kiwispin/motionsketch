import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => {
    const app = window.app;
    app.confirmNewAnimation();
    const dot = (x) => ({ type: 'brush', brushType: 'brush', color: '#e74c3c', size: 40, opacity: 1, points: [{ x, y: 300, p: 0.5 }] });
    app.frames = [100, 200, 300].map((x) => ({ strokes: [dot(x)], paperStrokes: [], hold: 1 }));
    app.frameIndex = 1;
    app.renderUI();
    app.renderCanvas();
  });
});

test('onion skin lives in the timeline, next to the frames', async ({ page }) => {
  const onion = page.getByRole('button', { name: 'Toggle onion skin' });
  await expect(onion).toBeVisible();
  await expect(onion).toHaveText('Onion skin');
  expect(await onion.evaluate((button) => Boolean(button.closest('.timeline-panel')))).toBe(true);
  await expect(page.locator('.tools-panel #onion-btn')).toHaveCount(0);
  await onion.click();
  await expect(onion).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#onion-settings')).toBeVisible();
});

test('Hold is a stepper from ×1 to ×12, and held frames say so on the thumbnail', async ({ page }) => {
  const less = page.getByRole('button', { name: 'Hold this frame for less time' });
  const more = page.getByRole('button', { name: 'Hold this frame for longer' });
  await expect(page.locator('#frame-hold-disp')).toHaveText('×1');
  await expect(less).toBeDisabled();
  await more.click();
  await more.click();
  await expect(page.locator('#frame-hold-disp')).toHaveText('×3');
  await expect(page.locator('.frame-card').nth(1).locator('.frame-hold-badge')).toHaveText('×3');
  await expect(page.locator('.frame-card').nth(0).locator('.frame-hold-badge')).toHaveCount(0);

  await page.evaluate(() => window.app.setFrameHold(12));
  await expect(more).toBeDisabled();
  await less.click();
  await expect(page.locator('#frame-hold-disp')).toHaveText('×11');

  // Back to ×1 removes the badge.
  await page.evaluate(() => window.app.setFrameHold(1));
  await expect(page.locator('.frame-hold-badge')).toHaveCount(0);
});

test('Speed has a word label and reads in fps', async ({ page }) => {
  await expect(page.locator('.timeline-fps .timeline-label')).toHaveText('Speed');
  await expect(page.locator('#fps-disp')).toHaveText('12 fps');
});

test('thumbnails are shaped like the canvas', async ({ page }) => {
  const cardSize = () => page.locator('.frame-card').first().evaluate((card) => {
    const box = card.getBoundingClientRect();
    return { width: Math.round(box.width), height: Math.round(box.height) };
  });
  expect(await cardSize()).toEqual({ width: 96, height: 72 });
  await page.evaluate(() => { window.app.resizeCanvas(1280, 720); window.app.renderUI(); });
  expect(await cardSize()).toEqual({ width: 128, height: 72 });
});

test('arrow keys on a slider move the slider, not the frame', async ({ page }) => {
  await page.locator('#brush-size').focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => ({ frame: window.app.frameIndex, size: window.app.brushSize }))).toEqual({ frame: 1, size: 11 });
});

test('Backspace on the canvas never deletes a frame; Delete in the timeline does', async ({ page }) => {
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.app.frames.length)).toBe(3);

  await page.locator('.frame-card').nth(1).click();
  await page.keyboard.press('Delete');
  await expect.poll(() => page.evaluate(() => window.app.frames.length)).toBe(2);
});
