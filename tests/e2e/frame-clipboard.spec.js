import { expect, test } from '@playwright/test';

const seedFrames = async (page, count = 5) => {
  await page.evaluate((frameCount) => {
    window.app.frames = Array.from({ length: frameCount }, (_, index) => ({
      strokes: [{
        type: 'text',
        text: `ink-${index}`,
        x: 30 + index,
        y: 80 + index,
        width: 48,
        height: 24,
        sx: 1,
        sy: 1,
        color: '#000000',
        size: 24,
        bold: false,
        opacity: 1,
        angle: 0,
        points: []
      }],
      paperStrokes: [{
        type: 'text',
        text: `paper-${index}`,
        x: 120 + index,
        y: 160 + index,
        width: 48,
        height: 24,
        sx: 1,
        sy: 1,
        color: '#ff0000',
        size: 24,
        bold: false,
        opacity: 1,
        angle: 0,
        points: []
      }],
      frameBgColor: `#${String(index + 1).repeat(6)}`,
      hold: index + 1
    }));
    window.app.frameIndex = 0;
    window.app.sharedStrokes = [{ type: 'text', text: 'shared', x: 10, y: 20, width: 50, height: 24, sx: 1, sy: 1, color: '#000000', size: 24, bold: false, opacity: 1, angle: 0, points: [] }];
    window.app.fps = 17;
    window.app.clearFrameSelection(false);
    window.app.renderUI();
    window.app.renderCanvas();
  }, count);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

test('supports range and modifier frame selection with separate active highlighting', async ({ page }) => {
  await seedFrames(page);
  const cards = page.locator('.frame-card');

  await cards.nth(1).click();
  await cards.nth(3).click({ modifiers: ['Shift'] });
  await expect.poll(() => page.evaluate(() => ({
    selected: window.app.getSelectedFrameIndices(),
    active: window.app.frameIndex
  }))).toEqual({ selected: [1, 2, 3], active: 3 });
  await expect(cards.nth(2)).toHaveClass(/frame-selected/);
  await expect(cards.nth(3)).toHaveClass(/active/);

  await cards.nth(0).click({ modifiers: ['Meta'] });
  await cards.nth(2).click({ modifiers: ['Meta'] });
  await expect.poll(() => page.evaluate(() => ({
    selected: window.app.getSelectedFrameIndices(),
    active: window.app.frameIndex
  }))).toEqual({ selected: [0, 1, 3], active: 2 });
  await expect(cards.nth(2)).toHaveClass(/active/);
  await expect(cards.nth(3)).toHaveClass(/frame-selected/);
});

test('routes timeline C/V to ordered deep frame copies and one undo step', async ({ page }) => {
  await seedFrames(page, 4);
  const cards = page.locator('.frame-card');

  await cards.nth(0).click();
  await cards.nth(2).click({ modifiers: ['Meta'] });
  await page.keyboard.press('Control+C');
  await page.evaluate(() => {
    window.app.frames[0].strokes[0].text = 'changed-after-copy';
    window.app.frameIndex = 2;
  });
  await cards.nth(2).focus();
  const historyBeforePaste = await page.evaluate(() => window.app.history.length);
  await page.keyboard.press('Control+V');

  const pasted = await page.evaluate(() => ({
    order: window.app.frames.map((frame) => frame.strokes[0].text),
    paper: window.app.frames.slice(3, 5).map((frame) => frame.paperStrokes[0].text),
    backgrounds: window.app.frames.slice(3, 5).map((frame) => frame.frameBgColor),
    holds: window.app.frames.slice(3, 5).map((frame) => frame.hold),
    fps: window.app.fps,
    shared: window.app.sharedStrokes[0].text,
    historyDelta: window.app.history.length,
    selected: window.app.getSelectedFrameIndices(),
    active: window.app.frameIndex
  }));
  expect(pasted.order).toEqual(['changed-after-copy', 'ink-1', 'ink-2', 'ink-0', 'ink-2', 'ink-3']);
  expect(pasted.paper).toEqual(['paper-0', 'paper-2']);
  expect(pasted.backgrounds).toEqual(['#111111', '#333333']);
  expect(pasted.holds).toEqual([1, 3]);
  expect(pasted.fps).toBe(17);
  expect(pasted.shared).toBe('shared');
  expect(pasted.historyDelta).toBe(historyBeforePaste + 1);
  expect(pasted.selected).toEqual([3, 4]);
  expect(pasted.active).toBe(2);

  await page.evaluate(() => {
    window.app.frames[3].strokes[0].text = 'mutated-paste';
    window.app.frames[3].paperStrokes[0].text = 'mutated-paper';
  });
  await expect.poll(() => page.evaluate(() => ({
    originalInk: window.app.frameClipboard.frames[0].strokes[0].text,
    originalPaper: window.app.frameClipboard.frames[0].paperStrokes[0].text,
    sourceInk: window.app.frames[0].strokes[0].text
  }))).toEqual({ originalInk: 'ink-0', originalPaper: 'paper-0', sourceInk: 'changed-after-copy' });

  await page.keyboard.press('Control+Z');
  await expect.poll(() => page.evaluate(() => ({
    count: window.app.frames.length,
    selected: window.app.getSelectedFrameIndices()
  }))).toEqual({ count: 4, selected: [] });
});

test('keeps canvas artwork clipboard routing when the canvas owns focus', async ({ page }) => {
  await seedFrames(page, 2);
  await page.evaluate(() => {
    window.app.selectedObject = { stroke: window.app.frames[0].strokes[0], layer: 'ink' };
    window.app.timelineSelectionFocused = true;
    window.app.canvas.focus();
  });
  await page.keyboard.press('Control+C');
  await expect.poll(() => page.evaluate(() => ({
    artwork: window.app.clipboard?.text,
    frameClipboard: window.app.frameClipboard
  }))).toEqual({ artwork: 'ink-0', frameClipboard: null });
});

test('does not route C/V away from a text input', async ({ page }) => {
  await seedFrames(page, 2);
  await page.locator('.frame-card').nth(0).click();
  await page.locator('#project-name').focus();
  await page.keyboard.press('Control+C');
  await page.keyboard.press('Control+V');
  await expect.poll(() => page.evaluate(() => ({
    frameClipboard: window.app.frameClipboard,
    projectName: document.getElementById('project-name').value
  }))).toEqual({ frameClipboard: null, projectName: 'Untitled' });
});
