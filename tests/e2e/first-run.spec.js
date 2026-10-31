import { expect, test } from '@playwright/test';

// Draw a short stroke on the paper, in project pixels.
const stroke = async (page, x, y) => {
  const box = await page.locator('#rendering-canvas').boundingBox();
  const at = (px, py) => [box.x + px * box.width / 600, box.y + py * box.height / 600];
  await page.mouse.move(...at(x, y));
  await page.mouse.down();
  await page.mouse.move(...at(x + 30, y + 10), { steps: 4 });
  await page.mouse.move(...at(x + 50, y + 30), { steps: 4 });
  await page.mouse.up();
};

const coachTitle = (page) => page.locator('#guide-coach .guide-title');

test.describe('a first visit', () => {
  // A brand-new browser: no saved project and nothing seen yet.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);
  });

  test('shows the welcome card, and no What’s new dot or save status yet', async ({ page }) => {
    await expect(page.getByRole('dialog', { name: 'Make your first animation' })).toBeVisible();
    await expect(page.locator('#welcome-start')).toBeFocused();
    await expect(page.locator('#welcome-unsaved')).toBeHidden();
    await expect(page.getByRole('button', { name: 'File', exact: true })).not.toHaveClass(/has-news/);
    await expect(page.locator('#save-status')).toBeHidden();
  });

  test('the guide follows the student through draw, add a frame and play', async ({ page }) => {
    await page.locator('#welcome-start').click();
    await expect(page.getByRole('dialog', { name: 'Make your first animation' })).toBeHidden();
    await expect(coachTitle(page)).toHaveText('Draw something');
    await expect(page.locator('#paper-hint')).toBeVisible();

    await stroke(page, 120, 160);
    await expect(coachTitle(page)).toHaveText('Nice. Now add a frame');
    await expect(page.locator('#paper-hint')).toBeHidden();
    await expect(page.locator('#guide-ring')).toBeVisible();

    await page.locator('#frames-list .add-frame-btn').click();
    await expect(coachTitle(page)).toHaveText('Draw it again, a bit further along');
    expect(await page.evaluate(() => window.app.isOnion)).toBe(true);

    await stroke(page, 220, 260);
    await expect(coachTitle(page)).toHaveText('Press Play');
    await page.locator('#play-btn').click();
    await expect(coachTitle(page)).toHaveText('Nice. That’s animation!');
    await page.locator('#play-btn').click();

    await page.locator('#guide-coach').getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#guide-coach')).toBeHidden();

    // It doesn't come back.
    await page.reload();
    await page.waitForFunction(() => window.app && window.app.frames);
    await expect(page.locator('#welcome-modal')).toBeHidden();
  });

  test('Skip guide ends it straight away', async ({ page }) => {
    await page.locator('#welcome-start').click();
    await page.locator('#guide-coach').getByRole('button', { name: 'Skip guide' }).click();
    await expect(page.locator('#guide-coach')).toBeHidden();
    await stroke(page, 120, 160);
    await expect(page.locator('#guide-coach')).toBeHidden();
  });

  test('the sample is a 12-frame bouncing ball moved by one Motion path', async ({ page }) => {
    await page.locator('#welcome-sample').click();
    expect(await page.evaluate(() => ({
      frames: window.app.frames.length,
      tool: window.app.tool,
      tracks: window.app.motionTracks.length,
      keys: window.app.motionTracks[0].keyframes.map((key) => key.frame),
      name: window.app.projectName,
      undo: window.app.history.length,
      unsaved: window.app.hasUnsavedWork()
    }))).toEqual({ frames: 12, tool: 'truck', tracks: 1, keys: [0, 3, 6, 9, 11], name: 'Bouncing ball', undo: 0, unsaved: false });
    await expect(coachTitle(page)).toHaveText('Bouncing ball');
    await page.locator('#guide-coach').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#guide-coach')).toBeHidden();
  });
});

test.describe('a returning student', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForFunction(() => window.app && window.app.frames);
    await page.evaluate(() => window.app.confirmNewAnimation());
  });

  test('gets no welcome card, but can open it from File › Getting started', async ({ page }) => {
    await expect(page.locator('#welcome-modal')).toBeHidden();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /Getting started/ }).click();
    await expect(page.getByRole('dialog', { name: 'Make your first animation' })).toBeVisible();
  });

  test('opening the sample over unsaved work warns first', async ({ page }) => {
    await stroke(page, 120, 160);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /Getting started/ }).click();
    await expect(page.locator('#welcome-unsaved')).toBeVisible();
    // The warning is the student's chance to save; choosing the sample again goes ahead.
    await page.locator('#welcome-sample').click();
    await expect.poll(() => page.evaluate(() => window.app.frames.length)).toBe(12);
  });

  test('? and File › Keyboard shortcuts open the shortcuts', async ({ page }) => {
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await page.locator('#rendering-canvas').focus();
    await page.keyboard.press('Shift+Slash');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Add a frame');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
    await expect(sheet).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('“Draw here” shows on an empty first frame and goes once something is drawn', async ({ page }) => {
    await expect(page.locator('#paper-hint')).toBeVisible();
    await stroke(page, 120, 160);
    await expect(page.locator('#paper-hint')).toBeHidden();
  });
});

test('the coach mark steps aside while a dialog is open', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.startGuide());
  await expect(page.locator('#guide-coach')).toBeVisible();
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('Shift+Slash');
  await expect(page.locator('#guide-coach')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-coach')).toBeVisible();
});
