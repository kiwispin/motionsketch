import { expect, test } from '@playwright/test';

const widths = [1600, 1366, 1280, 1200, 1100, 1024, 960, 901, 900, 768, 600, 414, 375];

for (const width of widths) {
  test(`header buttons and export menu stay usable at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);

    const layout = await page.evaluate(() => {
      const header = document.querySelector('.app-header').getBoundingClientRect();
      const actions = document.querySelector('.top-actions');
      const buttons = [...actions.querySelectorAll(':scope > button, :scope > div > button')];
      const squashed = [];
      const unreachable = [];
      buttons.forEach((button) => {
        const name = button.getAttribute('aria-label') || button.textContent.trim();
        if (button.getBoundingClientRect().height > 46 || button.scrollWidth > button.clientWidth + 1) squashed.push(name);
        button.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        const box = button.getBoundingClientRect();
        if (box.left < header.left - 0.5 || box.right > header.right + 0.5) unreachable.push(name);
      });
      actions.scrollLeft = actions.scrollWidth;
      window.app.setExportMenuOpen(true);
      const items = [...document.querySelectorAll('#export-menu .export-menu-item')];
      const hidden = items.filter((item) => {
        const box = item.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return !(hit === item || item.contains(hit));
      }).map((item) => item.textContent.trim());
      window.app.setExportMenuOpen(false);
      return { squashed, unreachable, hiddenMenuItems: hidden };
    });

    expect(layout.squashed).toEqual([]);
    expect(layout.unreachable).toEqual([]);
    expect(layout.hiddenMenuItems).toEqual([]);
  });
}
