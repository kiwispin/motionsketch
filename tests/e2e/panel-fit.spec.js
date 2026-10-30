import { expect, test } from '@playwright/test';

const open = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => document.fonts.ready);
};

const panelState = (page) => page.locator('.props-panel').evaluate((panel) => ({
  over: panel.scrollHeight - panel.clientHeight,
  top: panel.scrollTop,
  above: panel.classList.contains('more-above'),
  below: panel.classList.contains('more-below'),
}));

for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
  test(`settings panel fits without scrolling at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const state = await panelState(page);
    expect(state.over).toBeLessThanOrEqual(0);
    expect(state.above || state.below).toBe(false);
  });
}

test('with onion settings open on a laptop, the panel fades where there is more', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await page.evaluate(() => window.app.toggleOnion());

  // The onion settings come fully into view, and the top fades to show there is more above.
  await expect(page.locator('#onion-settings')).toBeInViewport({ ratio: 1 });
  await expect.poll(() => panelState(page)).toMatchObject({ above: true, below: false });

  // Back at the top, the bottom fades instead.
  await page.locator('.props-panel').evaluate((panel) => { panel.scrollTop = 0; });
  await expect.poll(() => panelState(page)).toMatchObject({ above: false, below: true });
});
