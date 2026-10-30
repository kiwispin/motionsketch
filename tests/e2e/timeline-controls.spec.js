import { expect, test } from '@playwright/test';

const widths = [1600, 1366, 1200, 1100, 1024, 960, 920, 901, 900, 820, 768, 600, 414, 375];

for (const width of widths) {
  test(`timeline controls stay reachable at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);

    const layout = await page.evaluate(() => {
      const box = (element) => element.getBoundingClientRect();
      const panel = box(document.querySelector('.timeline-panel'));
      const play = box(document.getElementById('play-btn'));
      const zoomIn = box(document.querySelector('.zoom-controls .zoom-btn:last-child'));
      const add = box(document.getElementById('timeline-add'));
      const controls = document.querySelector('.timeline-controls');
      controls.scrollLeft = controls.scrollWidth;
      const paste = box(document.getElementById('timeline-paste'));
      return {
        playInside: play.left >= panel.left && play.right <= panel.right,
        playWidth: Math.round(play.width),
        overlap: zoomIn.right > add.left + 0.5,
        pasteReachable: paste.right <= panel.right + 0.5 && paste.left >= panel.left
      };
    });

    expect(layout.playInside).toBe(true);
    expect(layout.playWidth).toBe(32);
    expect(layout.overlap).toBe(false);
    expect(layout.pasteReachable).toBe(true);
  });
}
