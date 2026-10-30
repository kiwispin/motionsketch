import { expect, test } from '@playwright/test';

const open = async (page, width = 1366, height = 768) => {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => document.fonts.ready);
};

const layout = (page) => page.evaluate(() => {
  const box = (selector) => document.querySelector(selector).getBoundingClientRect();
  const canvas = box('.canvas-wrapper');
  const timeline = box('.timeline-panel');
  return {
    canvasHeight: Math.round(canvas.height),
    canvasBottom: canvas.bottom,
    timelineTop: timeline.top,
    toolsBottom: box('.tools-panel').bottom,
    propsVisible: Boolean(document.querySelector('.props-panel').offsetParent),
    stripVisible: Boolean(document.querySelector('.timeline-frames-row').offsetParent),
    hidden: window.app.panelsHidden,
  };
});

test('on a school laptop the canvas gets the room and stays clear of the timeline', async ({ page }) => {
  await open(page);
  const state = await layout(page);
  expect(state.canvasHeight).toBeGreaterThanOrEqual(450);
  expect(state.canvasBottom).toBeLessThanOrEqual(state.timelineTop);
  expect(state.toolsBottom).toBeLessThanOrEqual(state.timelineTop);
});

test('Hide panels tucks away the settings and frame strip, and Show panels brings them back', async ({ page }) => {
  await open(page);
  const before = await layout(page);

  // The paper animates to its new size.
  await page.locator('#panels-toggle').click();
  expect(await layout(page)).toMatchObject({ hidden: true, propsVisible: false, stripVisible: false });
  await expect.poll(async () => (await layout(page)).canvasHeight).toBeGreaterThan(before.canvasHeight + 100);
  await expect(page.locator('#play-btn')).toBeVisible();
  await expect(page.locator('#timeline-add')).toBeVisible();

  await page.locator('#panels-show').click();
  expect(await layout(page)).toMatchObject({ hidden: false, propsVisible: true, stripVisible: true });
  await expect.poll(async () => (await layout(page)).canvasHeight).toBe(before.canvasHeight);
});

test('Tab hides and shows the panels while drawing, but still moves focus between buttons', async ({ page }) => {
  await open(page);
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('Tab');
  expect((await layout(page)).hidden).toBe(true);
  await page.keyboard.press('Tab');
  expect((await layout(page)).hidden).toBe(false);

  // On a button, Tab moves focus as usual.
  await page.locator('#play-btn').focus();
  await page.keyboard.press('Tab');
  expect((await layout(page)).hidden).toBe(false);
  expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('play-btn');
});

test('Escape and the Truck tool bring hidden panels back', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.app.setPanelsHidden(true));
  await page.keyboard.press('Escape');
  expect((await layout(page)).hidden).toBe(false);

  await page.evaluate(() => window.app.setPanelsHidden(true));
  await page.evaluate(() => window.app.setTool('truck'));
  expect(await layout(page)).toMatchObject({ hidden: false, propsVisible: true });
});

test('phones keep their own layout, with no Hide panels', async ({ page }) => {
  await open(page, 390, 844);
  await expect(page.locator('#panels-toggle')).toBeHidden();
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('Tab');
  expect((await layout(page)).hidden).toBe(false);
});
