import { expect, test } from '@playwright/test';

const dot = (x) => ({ type: 'brush', brushType: 'brush', color: '#000000', size: 30, opacity: 1, points: [{ x, y: 200, p: 0.5 }] });

const seed = (page, count) => page.evaluate((frames) => {
  const app = window.app;
  app.confirmNewAnimation();
  app.frames = frames.map((stroke) => ({ strokes: [stroke], paperStrokes: [], hold: 1 }));
  app.frameIndex = 0;
  app.renderUI();
  app.renderCanvas();
}, Array.from({ length: count }, (_, i) => dot(20 + i * 10)));

// Middle of a frame thumbnail, across, and the middle of the scrub bar, down.
const scrubPoint = async (page, index) => {
  const card = await page.locator('.frame-card').nth(index).boundingBox();
  const bar = await page.locator('#frame-scrub').boundingBox();
  return { x: card.x + card.width / 2, y: bar.y + bar.height / 2 };
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
});

test('dragging along the scrub bar flips through the frames', async ({ page }) => {
  await seed(page, 8);
  const start = await scrubPoint(page, 0);
  const middle = await scrubPoint(page, 3);
  const end = await scrubPoint(page, 6);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y, { steps: 4 });
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(3);
  await expect(page.locator('#frame-position')).toHaveText('Frame 4 of 8');
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();

  expect(await page.evaluate(() => window.app.frameIndex)).toBe(6);
  await expect(page.locator('.frame-playhead')).toHaveText('7');
  await expect(page.locator('#frame-scrub')).toHaveAttribute('aria-valuenow', '7');

  // Clicking a spot on the bar jumps there.
  const back = await scrubPoint(page, 1);
  await page.mouse.click(back.x, back.y);
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(1);

  // Scrubbing changes the view only; it isn't an undo step.
  expect(await page.evaluate(() => window.app.history.length)).toBe(0);
});

test('the playhead sits over the current frame', async ({ page }) => {
  await seed(page, 6);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const playhead = await page.locator('.frame-playhead').boundingBox();
  const card = await page.locator('.frame-card').nth(2).boundingBox();
  expect(Math.abs((playhead.x + playhead.width / 2) - (card.x + card.width / 2))).toBeLessThan(2);
  await expect(page.locator('.frame-playhead')).toHaveText('3');
});

test('holding near the end of the bar scrolls a long animation', async ({ page }) => {
  await seed(page, 40);
  const bar = await page.locator('#frames-list').boundingBox();
  const start = await scrubPoint(page, 0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width - 8, start.y, { steps: 6 });
  const before = await page.evaluate(() => window.app.frameIndex);
  await page.waitForFunction((index) => window.app.frameIndex > index + 3, before);
  await page.mouse.up();
  expect(await page.evaluate(() => window.app.framesList.scrollLeft)).toBeGreaterThan(0);

  // The strip stops scrolling once you let go.
  const stopped = await page.evaluate(() => window.app.framesList.scrollLeft);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.app.framesList.scrollLeft)).toBe(stopped);
});

test('scrubbing stops playback', async ({ page }) => {
  await seed(page, 6);
  await page.evaluate(() => window.app.togglePlay());
  expect(await page.evaluate(() => window.app.isPlaying)).toBe(true);
  const point = await scrubPoint(page, 4);
  await page.mouse.click(point.x, point.y);
  expect(await page.evaluate(() => window.app.isPlaying)).toBe(false);
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(4);
});
