import { expect, test } from '@playwright/test';

// Every header and timeline control stays inside its panel; labels fold into
// icons as the window narrows.
const offEdge = (page) => page.evaluate(() => {
  const out = (selector, panel) => {
    const box = document.querySelector(panel).getBoundingClientRect();
    return [...document.querySelectorAll(selector)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && (r.right > box.right + 1 || r.left < box.left - 1);
    }).map((el) => el.id || el.getAttribute('aria-label'));
  };
  return [
    ...out('.timeline-controls button, .timeline-controls input', '.timeline-panel'),
    ...out('.app-header button, .app-header input', '.app-header')
  ];
});

for (const [width, height] of [[1280, 720], [1100, 760], [1024, 768], [960, 700], [901, 650], [900, 800]]) {
  test(`nothing in the header or timeline is cut off at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);
    await page.evaluate(() => document.fonts.ready);
    expect(await offEdge(page)).toEqual([]);
  });
}

test('folded buttons keep their names', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 700 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  for (const name of ['Add', 'Duplicate', 'Delete', 'Copy']) {
    await expect(page.locator('.frame-actions').getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Toggle onion skin' })).toBeVisible();
});

test.describe('on a touchscreen', () => {
  test.use({ hasTouch: true });

  test('header and timeline buttons are finger-sized', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Only Chromium reports a coarse pointer for touch emulation');
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);
    const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.app-header .btn-ghost, .timeline-controls .btn-ghost, .zoom-btn')]
      .filter((el) => el.offsetParent && !el.closest('.hold-stepper'))
      .map((el) => el.getBoundingClientRect().height)));
    expect(smallest).toBeGreaterThanOrEqual(44);
  });
});
