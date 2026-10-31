import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

// Some work that only lives in this browser.
const draw = (page) => page.evaluate(() => {
  const app = window.app;
  app.saveState();
  app.frames[0].strokes.push({ type: 'brush', brushType: 'brush', color: '#e74c3c', size: 40, opacity: 1, points: [{ x: 120, y: 120, p: 0.5 }] });
  app.setProjectName('Bouncing ball');
  app.renderCanvas();
});

const openFileMenu = (page) => page.getByRole('button', { name: 'File', exact: true }).click();

test('the File menu holds New, Open and Save project file, and closes like Export', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'File', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('menuitem')).toHaveText([/New animation/, /Open project file/, /Save project file/, /What’s new/]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#file-menu')).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  // A click outside the menu closes it.
  const canvas = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width - 20, canvas.y + canvas.height - 20);
  await expect(page.locator('#file-menu')).toBeHidden();
});

test('New warns when the animation is not saved as a file, and Save project file first clears it', async ({ page }) => {
  // A fresh, empty animation has nothing to lose.
  await openFileMenu(page);
  await page.getByRole('menuitem', { name: /New animation/ }).click();
  await expect(page.locator('#new-unsaved')).toBeHidden();
  await page.keyboard.press('Escape');

  await draw(page);
  await openFileMenu(page);
  await page.getByRole('menuitem', { name: /New animation/ }).click();
  await expect(page.locator('#new-unsaved')).toBeVisible();
  await expect(page.locator('#new-unsaved-title')).toHaveText('“Bouncing ball” isn’t saved as a file yet.');

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save project file first' }).click()
  ]);
  expect(file.suggestedFilename()).toBe('Bouncing ball.json');
  await expect(page.locator('#new-unsaved')).toBeHidden();
  await expect(page.locator('#new-saved')).toBeVisible();
  await page.keyboard.press('Escape');

  // Any change after saving the file makes it out of date again.
  await draw(page);
  await openFileMenu(page);
  await page.getByRole('menuitem', { name: /New animation/ }).click();
  await expect(page.locator('#new-unsaved')).toBeVisible();
  await expect(page.locator('#new-saved')).toBeHidden();
});

test('the warning survives a reload until the animation is saved as a file', async ({ page }) => {
  await draw(page);
  await expect(page.locator('#save-status-text')).toHaveText('Saved in this browser');
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.frames?.[0]?.strokes.length === 1);
  expect(await page.evaluate(() => window.app.hasUnsavedWork())).toBe(true);

  await openFileMenu(page);
  await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Save project file/ }).click()]);
  await expect(page.locator('#save-status-text')).toHaveText('Saved in this browser');
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.frames?.[0]?.strokes.length === 1);
  expect(await page.evaluate(() => window.app.hasUnsavedWork())).toBe(false);
});

test('saving in the browser shows a calm status by the name', async ({ page }) => {
  await draw(page);
  await expect(page.locator('#save-status-text')).toHaveText('Saving…');
  await expect(page.locator('#save-status-text')).toHaveText('Saved in this browser');
});

test('Project sets the name, canvas size from a preset, and speed in one place', async ({ page }) => {
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Project' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Square 600/ })).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#project-name-input').fill('Rocket launch');
  await dialog.getByRole('button', { name: /^Wide/ }).click();
  await expect(page.locator('#canvas-width')).toHaveValue('1280');
  await expect(page.locator('#canvas-height')).toHaveValue('720');
  await page.locator('#project-fps').fill('8');
  await expect(page.locator('#project-fps-label')).toHaveText('8 frames per second');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  expect(await page.evaluate(() => ({ name: window.app.projectName, width: window.app.canvasWidth, height: window.app.canvasHeight, fps: window.app.fps }))).toEqual({ name: 'Rocket launch', width: 1280, height: 720, fps: 8 });
  await expect(page.locator('#project-name')).toHaveValue('Rocket launch');
  await expect(page.locator('#fps-disp')).toHaveText('8 FPS');

  // Typing a size that matches no preset picks Custom.
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.locator('#canvas-width').fill('900');
  await expect(dialog.getByRole('button', { name: /^Custom/ })).toHaveAttribute('aria-pressed', 'true');
});

test('Cancel leaves the project as it was', async ({ page }) => {
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.locator('#project-name-input').fill('Changed my mind');
  await page.locator('#project-fps').fill('3');
  await page.getByRole('dialog', { name: 'Project' }).getByRole('button', { name: /^Square HD/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.evaluate(() => ({ name: window.app.projectName, width: window.app.canvasWidth, fps: window.app.fps }))).toEqual({ name: 'Untitled', width: 600, fps: 12 });
});

test('in the Project name box, Enter applies and Escape closes', async ({ page }) => {
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.locator('#project-name-input').fill('Typed name');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Project' })).toBeHidden();
  expect(await page.evaluate(() => window.app.projectName)).toBe('Typed name');

  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.locator('#project-name-input').fill('Not this');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Project' })).toBeHidden();
  expect(await page.evaluate(() => window.app.projectName)).toBe('Typed name');
});

test('What’s new is in the File menu, with a dot until it has been read', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'File', exact: true });
  await expect(toggle).toHaveClass(/has-news/);
  await toggle.click();
  await expect(page.locator('#whats-new-item')).toHaveClass(/has-news/);
  await page.getByRole('menuitem', { name: /What’s new/ }).click();

  const dialog = page.getByRole('dialog', { name: 'What’s new in SketchMotion' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('strong')).toHaveText(['A fresh look', 'More room to draw', 'Truck is now Motion', 'A File menu', 'A safer New', 'One place for your project']);
  await expect(page.locator('#whats-new-close')).toBeFocused();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).toBeHidden();
  await expect(toggle).not.toHaveClass(/has-news/);

  // Once read, the dot stays gone.
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.frames);
  await expect(page.getByRole('button', { name: 'File', exact: true })).not.toHaveClass(/has-news/);
});
