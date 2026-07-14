import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'compact', width: 900, height: 600 },
  { name: 'laptop', width: 1280, height: 720 }
];

for (const viewport of viewports) {
  test(`keeps editing controls usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);

    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, display: getComputedStyle(element).display };
      };
      const props = rect('.props-panel');
      const timeline = rect('.timeline-panel');
      const selectors = window.innerWidth <= 600
        ? ['#layer-ink', '#layer-paper', '#brush-size', '#brush-opacity']
        : ['#layer-ink', '#layer-paper', '#brush-size', '#brush-opacity', '#html-color-picker'];
      const controls = selectors
        .map((selector) => document.querySelector(selector))
        .map((element) => ({
          visible: getComputedStyle(element).display !== 'none',
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height
        }));
      return { props, timeline, controls };
    });

    expect(layout.props.display).not.toBe('none');
    expect(layout.props.bottom).toBeLessThanOrEqual(layout.timeline.top);
    for (const control of layout.controls) {
      expect(control.visible).toBe(true);
      expect(control.width).toBeGreaterThan(0);
      expect(control.height).toBeGreaterThan(0);
    }
  });
}
