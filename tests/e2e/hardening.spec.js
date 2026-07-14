import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

test('migrates a version 2 project and persists its normalized document', async ({ page }) => {
  const legacyProject = {
    version: 2,
    width: 800,
    height: 400,
    fps: 9,
    paperStrokes: [{ type: 'brush', brushType: 'brush', color: '#000000', size: 8, points: [{ x: 20, y: 20, p: 0.5 }] }],
    frames: [{ strokes: [], hold: 99 }]
  };

  await page.locator('#file-input').setInputFiles({
    name: 'legacy-v2.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyProject))
  });

  await expect.poll(() => page.evaluate(() => ({
    width: window.app.canvasWidth,
    height: window.app.canvasHeight,
    fps: window.app.fps,
    hold: window.app.frames[0].hold,
    paper: window.app.frames[0].paperStrokes.length
  }))).toEqual({ width: 800, height: 400, fps: 9, hold: 12, paper: 1 });
  await expect(page.locator('#save-indicator')).toContainText('Project upgraded and opened');
});

test('rejects malformed and unsupported project files without replacing the current document', async ({ page }) => {
  await page.evaluate(() => window.app.frames[0].strokes.push({ type: 'brush', brushType: 'brush', color: '#000000', size: 8, points: [{ x: 20, y: 20, p: 0.5 }] }));
  const upload = page.locator('#file-input');

  await upload.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await expect(page.locator('#save-indicator')).toContainText('Invalid project file');
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes.length)).toBe(1);

  await upload.setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 99, frames: [{ strokes: [] }] })) });
  await expect(page.locator('#save-indicator')).toContainText('not supported');
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes.length)).toBe(1);
});

test('has no serious or critical automated accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
  expect(blocking).toEqual([]);
});
