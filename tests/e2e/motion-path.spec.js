import { expect, test } from '@playwright/test';

// One ball on frame 1, moved with Motion: it drops to a bounce on frame 4
// and rises to frame 8, on a curved path.
const open = async (page, keys = [[3, 175, 330], [7, 410, 150]]) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  await page.evaluate((keys) => {
    const app = window.app;
    app.confirmNewAnimation();
    const ball = { type: 'brush', brushType: 'brush', color: '#e74c3c', size: 54, opacity: 1, points: [{ x: 80, y: 150, p: 0.5 }] };
    app.frames = Array.from({ length: 8 }, (_, index) => ({ strokes: index === 0 ? [ball] : [], paperStrokes: [], hold: 1 }));
    app.frameIndex = 0;
    app.renderUI();
    app.setTool('truck');
    app.selectedObject = { stroke: ball, layer: 'ink', index: 0 };
    app.calcBounds(ball);
    app.startMotion();
    const track = app.motionTracks[0];
    keys.forEach(([frame, dx, dy]) => app.setMotionTrackKeyframe(track, frame, { dx, dy }, false));
    track.keyframes.forEach((key, index) => { if (index > 0) key.interpolation = 'curved'; });
    app.applyMotionTrack(track);
    app.selectFrame(1);
    app.handleResize();
    app.renderCanvas();
  }, keys);
};

// Where a frame's point on the path is, on screen.
const pathPoint = (page, frame) => page.evaluate((frame) => {
  const app = window.app;
  const point = app.getPathPoint(app.getPathTrack(), frame);
  const rect = app.canvas.getBoundingClientRect();
  const scale = app.canvasWidth / rect.width;
  return { x: rect.left + point.x / scale, y: rect.top + point.y / scale, scale };
}, frame);

const keyOn = (page, frame) => page.evaluate((frame) => {
  const key = window.app.motionTracks[0].keyframes.find((candidate) => candidate.frame === frame);
  return key ? { dx: key.dx, dy: key.dy, interpolation: key.interpolation } : null;
}, frame);

test('Motion shows its own settings, and Straight or Curved changes the whole path', async ({ page }) => {
  await open(page);
  await expect(page.locator('#motion-settings')).toBeVisible();
  await expect(page.locator('#inspector-title')).toBeHidden();
  await expect(page.locator('.motion-key-chip')).toHaveText(['Frame 1', 'Frame 4', 'Frame 8']);
  await expect(page.locator('#motion-path-curved')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#motion-key-action')).toHaveText('Add key on this frame');

  await page.locator('#motion-path-straight').click();
  await expect(page.locator('#motion-path-straight')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.app.motionTracks[0].keyframes.slice(1).map((key) => key.interpolation))).toEqual(['straight', 'straight']);
  await page.evaluate(() => window.app.undo());
  expect((await keyOn(page, 7)).interpolation).toBe('curved');

  // A key goes to its frame and keeps the artwork selected.
  await page.locator('.motion-key-chip', { hasText: 'Frame 4' }).click();
  expect(await page.evaluate(() => [window.app.frameIndex, Boolean(window.app.truckSelectedTrackId)])).toEqual([3, true]);
  await expect(page.locator('.motion-key-chip.active')).toHaveText('Frame 4');
  await expect(page.locator('#motion-key-action')).toHaveText('Remove key on this frame');
});

test('dragging a key on the canvas reshapes the path without leaving the frame', async ({ page }) => {
  await open(page);
  const before = await keyOn(page, 7);
  const key = await pathPoint(page, 7);
  await page.mouse.move(key.x, key.y);
  expect(await page.evaluate(() => window.app.canvas.style.cursor)).toBe('grab');
  await page.mouse.down();
  await page.mouse.move(key.x - 20, key.y + 15);
  await page.mouse.move(key.x - 40, key.y + 30);
  await page.mouse.up();

  const after = await keyOn(page, 7);
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(1);
  expect(after.dx).toBeCloseTo(before.dx - 40 * key.scale, 0);
  expect(after.dy).toBeCloseTo(before.dy + 30 * key.scale, 0);
  // The artwork on frame 8 follows the key.
  const ballOnFrame8 = await page.evaluate(() => ({ ...window.app.frames[7].strokes[0].points[0] }));
  expect(ballOnFrame8.x).toBeCloseTo(80 + after.dx, 3);

  // One drag is one undo step.
  await page.evaluate(() => window.app.undo());
  expect(await keyOn(page, 7)).toEqual(before);
});

test('clicking a frame dot or a key goes to that frame', async ({ page }) => {
  await open(page);
  const dot = await pathPoint(page, 2);
  await page.mouse.click(dot.x, dot.y);
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(2);

  const key = await pathPoint(page, 7);
  await page.mouse.click(key.x, key.y);
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(7);
  expect(await keyOn(page, 7)).toEqual({ dx: 410, dy: 150, interpolation: 'curved' });
});

test('the artwork still drags when the path sits under it', async ({ page }) => {
  // A path that comes back to where it started: frame 4's dot is under frame 2's ball.
  await open(page, [[3, 60, 0], [7, 0, 0]]);
  await page.evaluate(() => window.app.selectFrame(5));
  const ball = await pathPoint(page, 5);
  await page.mouse.move(ball.x, ball.y);
  await page.mouse.down();
  await page.mouse.move(ball.x + 15, ball.y + 20);
  await page.mouse.move(ball.x + 30, ball.y + 40);
  await page.mouse.up();
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(5);
  expect(await keyOn(page, 5)).not.toBeNull();
});

test('on a key, the bar under the artwork removes it', async ({ page }) => {
  await open(page);
  await expect(page.locator('#motion-key-bar')).toBeHidden();
  await page.evaluate(() => window.app.selectFrame(3));
  await expect(page.locator('#motion-key-bar')).toBeVisible();
  await expect(page.locator('#motion-key-bar-label')).toHaveText('Key on frame 4');
  await page.locator('#motion-key-bar').getByRole('button', { name: 'Remove' }).click();
  expect(await keyOn(page, 3)).toBeNull();
  await expect(page.locator('#motion-key-bar')).toBeHidden();
  await expect(page.locator('.motion-key-chip')).toHaveText(['Frame 1', 'Frame 8']);
});

test('picking Motion shows a short hint, which goes on the first press', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.app.setTool('select'));
  await expect(page.locator('#motion-hint')).toBeHidden();
  await page.locator('#tool-truck').click();
  await expect(page.locator('#motion-hint')).toBeVisible();
  const box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + box.width - 20, box.y + box.height - 20);
  await expect(page.locator('#motion-hint')).toBeHidden();
});

test('keys show on the thumbnails only while Motion is on, and clicking one goes to its frame', async ({ page }) => {
  await open(page);
  await expect(page.locator('.frame-key-badge')).toHaveCount(3);
  await page.locator('.frame-key-badge[data-frame="7"]').click();
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(7);
  await page.evaluate(() => window.app.setTool('brush'));
  await expect(page.locator('.frame-key-badge')).toHaveCount(0);
});
