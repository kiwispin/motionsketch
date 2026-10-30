import { expect, test } from '@playwright/test';

const text = (label, x, y) => ({ type: 'text', text: label, x, y, width: 48, height: 24, sx: 1, sy: 1, color: '#000000', size: 24, bold: false, opacity: 1, angle: 0, points: [] });

const backgroundTexts = (page) => page.evaluate(() => window.app.frames.map((frame) => frame.paperStrokes.map((stroke) => stroke.text)));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

test('copies an older shared background into every frame beneath its own background', async ({ page }) => {
  const project = {
    version: 7,
    width: 600,
    height: 600,
    sharedStrokes: [text('shared', 10, 20)],
    frames: [
      { strokes: [], paperStrokes: [text('own-0', 100, 100)], hold: 1 },
      { strokes: [], paperStrokes: [], hold: 1 }
    ]
  };
  await page.locator('#file-input').setInputFiles({
    name: 'shared-background.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project))
  });

  await expect.poll(() => backgroundTexts(page)).toEqual([['shared', 'own-0'], ['shared']]);

  // Each frame's copy is independent once migrated.
  await page.evaluate(() => { window.app.frames[1].paperStrokes[0].text = 'changed'; });
  expect(await backgroundTexts(page)).toEqual([['shared', 'own-0'], ['changed']]);
});

test('Background edits change only the current frame', async ({ page }) => {
  await page.evaluate((strokes) => {
    window.app.frames = [
      { strokes: [], paperStrokes: [strokes[0]], hold: 1 },
      { strokes: [], paperStrokes: [strokes[1]], hold: 1 }
    ];
    window.app.frameIndex = 1;
    window.app.renderUI();
    window.app.renderCanvas();
  }, [text('bg-0', 50, 50), text('bg-1', 50, 50)]);

  await page.getByRole('button', { name: 'Background', exact: true }).click();
  await page.locator('#rendering-canvas').focus();
  await page.keyboard.press('ControlOrMeta+a');
  expect(await page.evaluate(() => window.app.selectedObject?.stroke?.text)).toBe('bg-1');
  await page.keyboard.press('Delete');

  expect(await backgroundTexts(page)).toEqual([['bg-0'], []]);

  // Duplicate keeps a frame's background.
  await page.evaluate(() => { window.app.frameIndex = 0; window.app.duplicateFrame(); });
  expect(await backgroundTexts(page)).toEqual([['bg-0'], ['bg-0'], []]);
});
