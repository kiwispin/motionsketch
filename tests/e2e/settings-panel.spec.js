import { expect, test } from '@playwright/test';

const open = async (page, width = 1366, height = 768) => {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => document.fonts.ready);
};

test('sections sit well apart, with a line between, and rows inside stay close', async ({ page }) => {
  await open(page);
  const gaps = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const brush = document.getElementById('inspector-title').parentElement;
    return {
      between: box('#inspector-title').top - box('#bg-color-picker').bottom,
      inside: box('.brush-preview').top - box('#inspector-title').bottom,
      line: getComputedStyle(brush).borderTopWidth
    };
  });
  expect(gaps.line).toBe('1px');
  expect(gaps.between).toBeGreaterThanOrEqual(gaps.inside * 3);
});

test('Background colour is part of Layer, under Lock and Hide', async ({ page }) => {
  await open(page);
  await expect(page.locator('.layer-group #bg-color-picker')).toBeVisible();
  await expect(page.locator('.layer-group > *').last()).toHaveId('bg-color-picker');
});

test('More colours sits under the swatches and shows the colour in use', async ({ page }) => {
  await open(page);
  const button = page.locator('.more-colours');
  await expect(button).toHaveText('More colours');
  expect(await button.evaluate((el) => el.previousElementSibling.id)).toBe('palette-container');

  const chip = () => page.locator('#more-colours-chip').evaluate((el) => el.style.getPropertyValue('--chip'));
  expect(await chip()).toBe('#000000');
  await page.locator('#palette-container .swatch').nth(2).click();
  expect(await chip()).toBe(await page.evaluate(() => window.app.palette[2]));
  // The ring moves to the swatch picked.
  await expect(page.locator('#palette-container .swatch.active')).toHaveCount(1);
  await expect(page.locator('#palette-container .swatch').nth(2)).toHaveClass(/active/);

  // A colour from the picker shows too, even though no swatch has it.
  await page.locator('#html-color-picker').evaluate((input) => { input.value = '#123456'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await chip()).toBe('#123456');
  await expect(page.locator('#palette-container .swatch.active')).toHaveCount(0);
});

test('in a narrow window the colour stays a plain colour box', async ({ page }) => {
  await open(page, 900, 600);
  await expect(page.locator('.more-colours-label')).toBeHidden();
  await expect(page.locator('#more-colours-chip')).toBeHidden();
  const box = await page.locator('.more-colours').boundingBox();
  expect(box.width).toBeGreaterThan(40);
  expect(box.height).toBeGreaterThan(40);
});
