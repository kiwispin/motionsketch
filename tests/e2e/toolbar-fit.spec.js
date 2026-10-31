import { expect, test } from '@playwright/test';

const sizes = [[1600, 900], [1366, 768], [1280, 720], [1100, 760], [960, 800], [960, 700], [901, 650], [900, 800], [900, 700], [820, 1180], [768, 1024], [768, 800], [768, 700], [600, 800], [414, 896], [375, 667]];

for (const [width, height] of sizes) {
  test(`every tool stays inside the toolbar at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);

    const measure = () => page.evaluate(() => {
      const panel = document.querySelector('.tools-panel').getBoundingClientRect();
      const timeline = document.querySelector('.timeline-panel').getBoundingClientRect();
      // Hand is the last tool in the column.
      const last = document.getElementById('tool-hand').getBoundingClientRect();
      return { insidePanel: last.bottom <= panel.bottom + 0.5, clearOfTimeline: last.bottom <= timeline.top, height: Math.round(last.height) };
    });

    const normal = await measure();
    expect(normal.insidePanel).toBe(true);
    expect(normal.clearOfTimeline).toBe(true);
    expect(normal.height).toBeGreaterThanOrEqual(30);

    // The Truck tool opens the motion timeline, which shortens the toolbar.
    await page.evaluate(() => window.app.setTool('truck'));
    const truck = await measure();
    expect(truck.insidePanel).toBe(true);
    expect(truck.clearOfTimeline).toBe(true);
  });
}
