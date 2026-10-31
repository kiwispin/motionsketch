import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

async function seedFrames(page, count = 10, strokes = [{ x: 120, y: 120 }]) {
  await page.evaluate(({ count: frameCount, strokes: points }) => {
    const app = window.app;
    app.frames = Array.from({ length: frameCount }, () => ({ strokes: [], paperStrokes: [], hold: 1 }));
    app.frames[2].strokes = points.map(({ x, y }, index) => ({
      type: 'brush', brushType: 'brush', color: index ? '#0000ff' : '#000000', size: 14, opacity: 1,
      points: [{ x, y, p: 0.5 }], fillColor: null, sx: 1, sy: 1, angle: 0
    }));
    app.frameIndex = 2;
    app.motionTracks = [];
    app.truckSelectedTrackId = null;
    app.setTool('select');
    app.renderUI();
    app.renderCanvas();
  }, { count, strokes });
}

async function dragKeyBadge(page, fromFrame, toFrame) {
  const badge = page.locator(`.frame-key-badge[data-frame="${fromFrame}"]`);
  const target = page.locator('#frames-list .frame-card').nth(toFrame);
  await target.scrollIntoViewIfNeeded();
  await badge.scrollIntoViewIfNeeded();
  const from = await badge.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 2 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
}

async function dragSelectedObject(page, dx, dy) {
  const canvas = page.locator('#rendering-canvas');
  const box = await canvas.boundingBox();
  const center = await page.evaluate(() => {
    const bounds = window.app.selectedObject?.bounds;
    return bounds ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, width: window.app.canvasWidth, height: window.app.canvasHeight } : null;
  });
  expect(center).not.toBeNull();
  const scaleX = box.width / center.width;
  const scaleY = box.height / center.height;
  await page.mouse.move(box.x + center.x * scaleX, box.y + center.y * scaleY);
  await page.mouse.down();
  await page.mouse.move(box.x + (center.x + dx) * scaleX, box.y + (center.y + dy) * scaleY);
  await page.mouse.up();
}

test('Truck starts one key, previews outside the span, and adds endpoint/intermediate keys', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page);

  const canvas = page.locator('#rendering-canvas');
  const sourceBox = await canvas.boundingBox();
  await page.mouse.click(sourceBox.x + 120 * sourceBox.width / 600, sourceBox.y + 120 * sourceBox.height / 600);
  await expect.poll(() => page.evaluate(() => Boolean(window.app.selectedObject))).toBe(true);
  await page.locator('#tool-truck').click();

  await expect(page.locator('#truck-panel')).toHaveCount(0);
  // The settings panel shows Motion's settings instead of the brush.
  await expect(page.locator('#motion-settings')).toBeVisible();
  await expect(page.locator('#brush-size')).toBeHidden();
  await expect(page.locator('#layer-ink')).toBeVisible();
  await expect(page.locator('#motion-key-action')).toBeVisible();
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => ({
    frames: window.app.frames.length,
    keys: window.app.motionTracks[0]?.keyframes.map((key) => key.frame),
    tagged: window.app.frames[2].strokes.filter((stroke) => stroke.motionTrackId).length
  }))).toEqual({ frames: 10, keys: [2], tagged: 1 });

  const historyBeforeNavigation = await page.evaluate(() => window.app.history.length);
  await page.locator('.frame-card').nth(9).click();
  await page.waitForFunction(() => window.app.frameIndex === 9 && window.app.selectedObject?.isMotionPreview === true);
  const outsideSpan = await page.evaluate(() => ({
    frames: window.app.frames.length,
    tagged: window.app.frames[9].strokes.filter((stroke) => stroke.motionTrackId).length,
    history: window.app.history.length
  }));
  expect(outsideSpan.frames).toBe(10);
  expect(outsideSpan.tagged).toBe(0);
  expect(outsideSpan.history).toBe(historyBeforeNavigation);
  const previewExport = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = window.app.canvasWidth;
    canvas.height = window.app.canvasHeight;
    const ctx = canvas.getContext('2d');
    window.app.renderFrameToContext(ctx, window.app.frames[9]);
    const pixel = [...ctx.getImageData(120, 120, 1, 1).data];
    window.app.isPlaying = true;
    window.app.renderCanvas();
    const playbackPixel = [...window.app.ctx.getImageData(120, 120, 1, 1).data];
    window.app.isPlaying = false;
    window.app.renderCanvas();
    return { exportPixel: pixel, playbackPixel };
  });
  expect(previewExport.exportPixel[0] + previewExport.exportPixel[1] + previewExport.exportPixel[2]).toBeGreaterThan(700);
  expect(previewExport.playbackPixel[3]).toBe(0);
  await dragSelectedObject(page, 90, 0);
  await expect.poll(() => page.evaluate(() => ({
    keys: window.app.motionTracks[0].keyframes.map((key) => key.frame),
    tagged: window.app.frames[9].strokes.filter((stroke) => stroke.motionTrackId).length
  }))).toEqual({ keys: [2, 9], tagged: 1 });

  await page.locator('.frame-card').nth(5).click();
  await page.waitForFunction(() => window.app.frameIndex === 5 && Boolean(window.app.frames[5].strokes.find((stroke) => stroke.motionTrackId)));
  await expect(page.locator('.frame-key-badge[data-frame="5"]')).toHaveCount(0);
  await dragSelectedObject(page, 0, 60);
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.frame))).toEqual([2, 5, 9]);
  await expect(page.locator('.frame-key-badge')).toHaveCount(3);

  // Straight or Curved sets the whole path; the first key has no path into it.
  await page.locator('#motion-path-curved').click();
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.interpolation))).toEqual(['straight', 'curved', 'curved']);
  await expect(page.locator('.frame-key-badge[data-frame="2"]')).not.toHaveClass(/curved/);
  await expect(page.locator('.frame-key-badge[data-frame="5"]')).toHaveClass(/curved/);
  await expect(page.locator('.frame-key-badge[data-frame="9"]')).toHaveClass(/curved/);
  await page.locator('#motion-path-straight').click();
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.interpolation))).toEqual(['straight', 'straight', 'straight']);
  await expect(page.locator('.frame-key-badge.curved')).toHaveCount(0);
  await page.locator('.frame-card').nth(5).click();

  const frameRemap = await page.evaluate(() => {
    const app = window.app;
    app.addFrame();
    const afterInsert = { frames: app.frames.length, keys: app.motionTracks[0].keyframes.map((key) => key.frame) };
    app.deleteFrame();
    return { afterInsert, afterDelete: { frames: app.frames.length, keys: app.motionTracks[0].keyframes.map((key) => key.frame) } };
  });
  expect(frameRemap).toEqual({ afterInsert: { frames: 11, keys: [2, 5, 10] }, afterDelete: { frames: 10, keys: [2, 5, 9] } });
});

test('Dragging a key badge to another thumbnail retimes it, keeps its offset, rejects collisions, and undoes once', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page);
  const canvas = page.locator('#rendering-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0]?.keyframes.map((key) => key.frame))).toEqual([2]);
  await page.locator('.frame-card').nth(9).click();
  await page.waitForFunction(() => window.app.selectedObject?.isMotionPreview === true);
  await page.waitForFunction(() => {
    const app = window.app;
    const bounds = app.selectedObject?.bounds;
    if (!bounds) return false;
    const point = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    return app.isInBounds(point, bounds) && app.hitTest(point)?.stroke?.motionTrackId === app.truckSelectedTrackId;
  });
  await dragSelectedObject(page, 80, 0);
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.frame))).toEqual([2, 9]);
  await page.locator('#motion-path-curved').click();
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.find((key) => key.frame === 9)?.interpolation)).toBe('curved');
  const endpointDx = await page.evaluate(() => window.app.motionTracks[0].keyframes.find((key) => key.frame === 9).dx);

  await dragKeyBadge(page, 9, 7);
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.frame))).toEqual([2, 7]);
  await expect.poll(() => page.evaluate(() => ({ dx: window.app.motionTracks[0].keyframes.find((key) => key.frame === 7)?.dx, interpolation: window.app.motionTracks[0].keyframes.find((key) => key.frame === 7)?.interpolation }))).toEqual({ dx: endpointDx, interpolation: 'curved' });
  // The drag doesn't also pick a frame.
  expect(await page.evaluate(() => window.app.frameIndex)).toBe(9);

  // A key can't land on a frame that already has one.
  await dragKeyBadge(page, 7, 2);
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.frame))).toEqual([2, 7]);
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.find((key) => key.frame === 7)?.interpolation)).toBe('curved');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.frame))).toEqual([2, 9]);
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.find((key) => key.frame === 9)?.dx)).toBeCloseTo(endpointDx, 6);
});

test('Truck migrates legacy paths and evaluates per-key incoming modes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page, 6);
  const result = await page.evaluate(() => {
    const app = window.app;
    const baseObject = app.cloneData(app.frames[2].strokes[0]);
    const legacyCurved = app.normalizeMotionTracks([{
      id: 'legacy-curved', startFrame: 0, endFrame: 4, interpolation: 'curved', baseObject,
      keyframes: [{ frame: 0, dx: 0, dy: 0 }, { frame: 4, dx: 40, dy: 20 }]
    }])[0];
    const mixed = {
      id: 'mixed', interpolation: 'straight',
      keyframes: [
        { frame: 0, dx: 0, dy: 0, interpolation: 'straight' },
        { frame: 2, dx: 20, dy: 40, interpolation: 'curved' },
        { frame: 4, dx: 40, dy: 0, interpolation: 'straight' }
      ],
      baseObject
    };
    const atOne = app.getMotionOffset(mixed, 1);
    const atThree = app.getMotionOffset(mixed, 3);
    return {
      migrated: legacyCurved.keyframes.map((key) => key.interpolation),
      twoPointCurved: app.getMotionOffset({ interpolation: 'curved', keyframes: legacyCurved.keyframes }, 2),
      mixedAtOne: atOne,
      mixedAtThree: atThree
    };
  });
  expect(result.migrated).toEqual(['curved', 'curved']);
  expect(result.twoPointCurved).toEqual({ dx: 20, dy: 10 });
  expect(result.mixedAtThree).toEqual({ dx: 30, dy: 20 });
  expect(result.mixedAtOne.dx).toBeLessThan(20);
  expect(result.mixedAtOne.dy).toBeGreaterThan(0);
});

test('Truck curved guides preserve cubic turns between adjacent keys', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page, 10);
  const result = await page.evaluate(() => {
    const app = window.app;
    const baseObject = app.cloneData(app.frames[2].strokes[0]);
    const track = {
      id: 'curve-guide-regression',
      startFrame: 0,
      endFrame: 9,
      baseObject,
      keyframes: [
        { frame: 0, dx: 0, dy: 0, interpolation: 'straight' },
        { frame: 3, dx: 40, dy: 120, interpolation: 'curved' },
        { frame: 4, dx: 70, dy: 150, interpolation: 'curved' },
        { frame: 9, dx: 180, dy: 10, interpolation: 'straight' }
      ]
    };
    app.tool = 'truck';
    app.truckSelectedTrackId = track.id;
    app.motionTracks = [track];

    // Record the guide's paths while drawing on a real canvas.
    const paths = [];
    let path = null;
    const real = document.createElement('canvas').getContext('2d');
    const record = {
      beginPath() { path = []; paths.push(path); real.beginPath(); },
      moveTo(x, y) { path.push(['M', x, y]); real.moveTo(x, y); },
      lineTo(x, y) { path.push(['L', x, y]); real.lineTo(x, y); }
    };
    const ctx = new Proxy(real, {
      get: (target, key) => record[key] || (typeof target[key] === 'function' ? target[key].bind(target) : target[key]),
      set: (target, key, value) => { target[key] = value; return true; }
    });
    app.drawMotionGuide(ctx);

    return {
      exactKeys: [0, 3, 4, 9].map((frame) => app.getMotionOffset(track, frame)),
      fractional: [3.5, 3.75].map((frame) => app.getMotionOffset(track, frame)),
      guideLineSegments: paths[0]?.filter(([kind]) => kind === 'L').length || 0
    };
  });
  expect(result.exactKeys).toEqual([
    { dx: 0, dy: 0 }, { dx: 40, dy: 120 }, { dx: 70, dy: 150 }, { dx: 180, dy: 10 }
  ]);
  expect(result.fractional[0].dy).toBeGreaterThan(150);
  expect(result.fractional[1].dy).toBeGreaterThan(result.fractional[0].dy);
  expect(result.guideLineSegments).toBeGreaterThan(9);
});

test('Truck creates independent tracks for multiple objects and saves them', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page, 6, [{ x: 100, y: 120 }, { x: 220, y: 120 }]);
  const canvas = page.locator('#rendering-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 100 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => window.app.motionTracks.length)).toBe(1);
  const secondBox = await canvas.boundingBox();
  await page.mouse.click(secondBox.x + 220 * secondBox.width / 600, secondBox.y + 120 * secondBox.height / 600);
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => ({
    tracks: window.app.motionTracks.length,
    keys: window.app.motionTracks.map((track) => track.keyframes.map((key) => key.frame)),
    badges: document.querySelectorAll('.frame-key-badge').length
  }))).toEqual({ tracks: 2, keys: [[2], [2]], badges: 1 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download/ }).click();
  const download = await downloadPromise;
  const saved = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(saved.motionTracks).toHaveLength(2);
  expect(saved.frames).toHaveLength(6);
  await page.evaluate((data) => window.app.importProjectData(data), saved);
  await expect.poll(() => page.evaluate(() => window.app.motionTracks.length)).toBe(2);
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.motionTracks?.length === 2);
});

test('Truck frame and object paste stay independent of later source retiming', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page, 6);
  const canvas = page.locator('#rendering-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  const result = await page.evaluate(() => {
    const app = window.app;
    const track = app.motionTracks[0];
    app.frameClipboard = { frames: [app.cloneData(app.frames[2]), app.cloneData(app.frames[3])] };
    app.pasteSelectedFrames();
    const pastedFrameHasIndependentArt = app.frames[3].strokes.some((stroke) => !stroke.motionTrackId);
    app.frameIndex = 2;
    app.selectMotionTrack(track.id);
    app.copySelection();
    app.frameIndex = 5;
    app.renderUI();
    app.pasteSelection();
    app.setMotionTrackKeyframe(track, 5, { dx: 240, dy: 0 });
    return {
      frames: app.frames.length,
      trackEnd: track.endFrame,
      excluded: [...track.excludedFrames],
      pastedFrameHasIndependentArt,
      independentObjectCount: app.frames[5].strokes.filter((stroke) => !stroke.motionTrackId).length
    };
  });
  expect(result.frames).toBe(8);
  expect(result.trackEnd).toBe(5);
  expect(result.excluded).toContain(3);
  expect(result.pastedFrameHasIndependentArt).toBe(true);
  expect(result.independentObjectCount).toBeGreaterThan(0);
});

test('Truck toolbar keeps brush and shape flyouts clickable while scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await page.locator('#tool-truck').click();
  const before = await page.evaluate(() => ({ history: window.app.history.length, frames: window.app.frames.length }));

  const assertOptionHit = async (selector) => {
    await expect.poll(() => page.locator(selector).evaluate((option) => {
      const bounds = option.getBoundingClientRect();
      const element = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return { id: element?.closest('button')?.id || null, visible: bounds.width > 0 && bounds.height > 0 };
    }), { timeout: 2000 }).toEqual({ id: selector.slice(1), visible: true });
  };

  await page.locator('#tool-brush-anchor').click();
  await expect(page.locator('#brush-wrapper')).toHaveClass(/expanded/);
  await assertOptionHit('#tool-pencil');
  await page.locator('#tool-pencil').click();
  await expect.poll(() => page.evaluate(() => ({ tool: window.app.tool, brush: window.app.brushType }))).toEqual({ tool: 'brush', brush: 'pencil' });

  await page.locator('#tool-truck').click();
  const shapeWrapper = page.locator('#shape-wrapper');
  await shapeWrapper.scrollIntoViewIfNeeded();
  await page.locator('#tool-shape-anchor').click();
  await expect(page.locator('#shape-wrapper')).toHaveClass(/expanded/);
  await assertOptionHit('#tool-rect');
  await page.locator('#tool-rect').click();
  await expect.poll(() => page.evaluate(() => window.app.tool)).toBe('rect');
  await expect.poll(() => page.evaluate(() => ({ history: window.app.history.length, frames: window.app.frames.length }))).toEqual(before);
});

test('Truck removes intermediate and endpoint keys, preserves span, and undo restores a sole key', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page);
  const canvas = page.locator('#rendering-canvas');
  let box = await canvas.boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  await expect(page.locator('#motion-key-action')).toBeEnabled();

  await page.locator('.frame-card').nth(3).click();
  await page.waitForFunction(() => window.app.selectedObject?.isMotionPreview === true);
  await expect(page.locator('#motion-key-action')).toBeEnabled();
  await expect(page.locator('#motion-key-action')).toHaveAttribute('aria-label', 'Add key on this frame');

  await page.locator('.frame-card').nth(5).click();
  await page.waitForFunction(() => window.app.selectedObject?.isMotionPreview === true);
  await dragSelectedObject(page, 70, 0);
  await page.locator('.frame-card').nth(4).click();
  await page.waitForFunction(() => Boolean(window.app.frames[4].strokes.find((stroke) => stroke.motionTrackId)));
  await dragSelectedObject(page, 0, 35);
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.frame))).toEqual([2, 4, 5]);
  await expect(page.locator('.motion-key-chip')).toHaveText(['Frame 3', 'Frame 5', 'Frame 6']);
  await page.locator('.motion-key-chip', { hasText: 'Frame 3' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frameIndex)).toBe(2);
  await page.locator('.motion-key-chip', { hasText: 'Frame 5' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frameIndex)).toBe(4);

  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => ({
    keys: window.app.motionTracks[0].keyframes.map((key) => key.frame),
    start: window.app.motionTracks[0].startFrame,
    end: window.app.motionTracks[0].endFrame,
    frames: window.app.frames.length,
    currentTagged: window.app.frames[4].strokes.some((stroke) => stroke.motionTrackId)
  }))).toEqual({ keys: [2, 5], start: 2, end: 5, frames: 10, currentTagged: true });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.motionTracks[0].keyframes.map((key) => key.frame))).toEqual([2, 4, 5]);

  await page.locator('.frame-card').nth(5).click();
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => ({
    keys: window.app.motionTracks[0].keyframes.map((key) => key.frame),
    start: window.app.motionTracks[0].startFrame,
    end: window.app.motionTracks[0].endFrame,
    tagged: window.app.frames[5].strokes.some((stroke) => stroke.motionTrackId)
  }))).toEqual({ keys: [2, 4], start: 2, end: 5, tagged: true });

  await page.reload();
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page);
  box = await canvas.boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  const expectedFrame = await page.evaluate(() => {
    const frame = window.app.cloneData(window.app.frames[2]);
    frame.strokes.forEach((stroke) => window.app.stripMotionMetadata(stroke));
    return frame;
  });
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => ({
    tracks: window.app.motionTracks.length,
    tagged: window.app.frames[2].strokes.some((stroke) => stroke.motionTrackId),
    frameIndex: window.app.frameIndex,
    frame: window.app.cloneData(window.app.frames[2])
  }))).toEqual({ tracks: 0, tagged: false, frameIndex: 2, frame: expectedFrame });
  await expect(page.locator('#motion-key-action')).toBeEnabled();
  await expect(page.locator('#motion-key-action')).toHaveAttribute('aria-label', 'Add key on this frame');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => ({ tracks: window.app.motionTracks.length, keys: window.app.motionTracks[0]?.keyframes.map((key) => key.frame) }))).toEqual({ tracks: 1, keys: [2] });
});

test('Truck shows only the selected track and starts a new track for a clicked untracked object', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await page.locator('#brush-size').fill('40');
  const drawDot = async (x, y) => {
    const box = await page.locator('#rendering-canvas').boundingBox();
    await page.mouse.move(box.x + x * box.width / 600, box.y + y * box.height / 600);
    await page.mouse.down();
    await page.mouse.up();
  };
  await drawDot(100, 120);
  await drawDot(220, 120);
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes.length)).toBe(2);

  await page.locator('#tool-select').click();
  let box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 100 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => ({ tracks: window.app.motionTracks.length, badges: document.querySelectorAll('.frame-key-badge').length }))).toEqual({ tracks: 1, badges: 1 });

  box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 220 * box.width / 600, box.y + 120 * box.height / 600);
  await expect.poll(() => page.evaluate(() => ({ selectedTrack: window.app.getMotionTrackForSelection()?.id || null, badges: document.querySelectorAll('.frame-key-badge').length }))).toEqual({ selectedTrack: null, badges: 0 });
  await expect(page.locator('#motion-key-action')).toBeEnabled();
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate(() => ({ tracks: window.app.motionTracks.length, keys: window.app.motionTracks.map((track) => track.keyframes.map((key) => key.frame)), badges: document.querySelectorAll('.frame-key-badge').length }))).toEqual({ tracks: 2, keys: [[0], [0]], badges: 1 });

  box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 100 * box.width / 600, box.y + 120 * box.height / 600);
  await expect.poll(() => page.evaluate(() => ({ selectedTrack: window.app.getMotionTrackForSelection()?.id, badges: document.querySelectorAll('.frame-key-badge').length }))).toMatchObject({ badges: 1 });
  const firstTrackId = await page.evaluate(() => window.app.getMotionTrackForSelection().id);
  await page.locator('#motion-key-action').click();
  await expect.poll(() => page.evaluate((id) => ({ tracks: window.app.motionTracks.length, otherStillPresent: window.app.motionTracks.some((track) => track.id !== id), firstTagged: window.app.frames[0].strokes.some((stroke) => stroke.motionTrackId === id), frameCount: window.app.frames.length }), firstTrackId)).toEqual({ tracks: 1, otherStillPresent: true, firstTagged: false, frameCount: 1 });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate((id) => ({ tracks: window.app.motionTracks.length, restored: window.app.motionTracks.some((track) => track.id === id), frameCount: window.app.frames.length }), firstTrackId)).toEqual({ tracks: 2, restored: true, frameCount: 1 });

  box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 500 * box.width / 600, box.y + 500 * box.height / 600);
  await expect(page.locator('#motion-empty')).toHaveText('Click an object on the canvas to animate it.');
  await expect(page.locator('#motion-key-action')).toBeHidden();
  await expect(page.locator('.frame-key-badge')).toHaveCount(0);
});

test('Motion keeps the selected ball\'s keys across frame navigation and endpoint movement', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await page.locator('#brush-size').fill('40');
  const drawDot = async (x, y) => {
    const box = await page.locator('#rendering-canvas').boundingBox();
    await page.mouse.move(box.x + x * box.width / 600, box.y + y * box.height / 600);
    await page.mouse.down();
    await page.mouse.up();
  };
  await drawDot(100, 120);
  await drawDot(220, 120);
  await page.locator('#frames-list > .add-frame-btn').click();
  await expect.poll(() => page.evaluate(() => window.app.frames.length)).toBe(2);
  await page.locator('.frame-card').nth(0).click();

  let box = await page.locator('#rendering-canvas').boundingBox();
  await page.locator('#tool-select').click();
  await page.mouse.click(box.x + 100 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 220 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#motion-key-action').click();
  const selectedSecondId = await page.evaluate(() => window.app.getMotionTrackForSelection().id);

  await page.locator('.frame-card').nth(1).click();
  await page.waitForFunction(() => window.app.selectedObject?.isMotionPreview === true);
  await expect.poll(() => page.evaluate((id) => ({
    badges: [...document.querySelectorAll('.frame-key-badge')].map((badge) => Number(badge.dataset.frame)),
    selectedId: window.app.getMotionTrackForSelection()?.id || null
  }), selectedSecondId)).toEqual({ badges: [0], selectedId: selectedSecondId });

  await dragSelectedObject(page, 70, 0);
  await expect.poll(() => page.evaluate((id) => ({
    keys: window.app.getMotionTrack(id)?.keyframes.map((key) => key.frame),
    badges: [...document.querySelectorAll('.frame-key-badge')].map((badge) => Number(badge.dataset.frame))
  }), selectedSecondId)).toEqual({ keys: [0, 1], badges: [0, 1] });

  await page.locator('.frame-card').nth(0).click();
  box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 100 * box.width / 600, box.y + 120 * box.height / 600);
  const firstTrackId = await page.evaluate(() => window.app.getMotionTrackForSelection().id);
  expect(firstTrackId).not.toBe(selectedSecondId);
  await expect.poll(() => page.evaluate((id) => window.app.getMotionTrack(id)?.keyframes.map((key) => key.frame), firstTrackId)).toEqual([0]);
  await page.mouse.click(box.x + 220 * box.width / 600, box.y + 120 * box.height / 600);
  await expect.poll(() => page.evaluate((id) => window.app.getMotionTrackForSelection()?.id, selectedSecondId)).toBe(selectedSecondId);
  await expect.poll(() => page.evaluate((id) => window.app.getMotionTrack(id)?.keyframes.map((key) => key.frame), selectedSecondId)).toEqual([0, 1]);
});

test('Truck frame duplication keeps animated artwork, selection, and movement position', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page, 8);

  const canvas = page.locator('#rendering-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();

  const before = await page.evaluate(() => {
    const app = window.app;
    const track = app.motionTracks[0];
    app.framesList.scrollLeft = Math.min(160, app.framesList.scrollWidth - app.framesList.clientWidth);
    app.framesList.dispatchEvent(new Event('scroll'));
    return {
      trackId: track.id,
      scrollLeft: app.framesList.scrollLeft,
      frameIndex: app.frameIndex,
      endFrame: track.endFrame
    };
  });

  await page.locator('#frames-list .frame-card').nth(2).locator('.frame-copy-btn').click();
  await expect.poll(() => page.evaluate(() => {
    const app = window.app;
    const track = app.motionTracks[0];
    return {
      frames: app.frames.length,
      frameIndex: app.frameIndex,
      endFrame: track?.endFrame,
      keys: track?.keyframes.map((key) => key.frame),
      currentTagged: app.frames[3]?.strokes.some((stroke) => stroke.motionTrackId === track?.id),
      selectedTrack: app.getMotionTrackForSelection()?.id || null,
      badges: [...document.querySelectorAll('.frame-key-badge')].map((badge) => Number(badge.dataset.frame)),
      frameScroll: app.framesList.scrollLeft
    };
  })).toEqual({
    frames: 9,
    frameIndex: 3,
    endFrame: 3,
    keys: [2],
    currentTagged: true,
    selectedTrack: before.trackId,
    badges: [2],
    frameScroll: before.scrollLeft
  });
});

test('Duplicating the last frame reveals the Add Frame control', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page, 12);

  // Frame badges appear on hover for frames other than the current one.
  const lastCard = page.locator('#frames-list .frame-card').last();
  await lastCard.hover();
  await lastCard.locator('.frame-copy-btn').click();
  const feedback = await page.evaluate(() => ({
    addPulsing: document.querySelector('#frames-list .add-frame-btn')?.classList.contains('frame-added-pulse') || false,
    addedFramePulsing: document.querySelector('#frames-list .frame-card:last-of-type')?.classList.contains('frame-added') || false
  }));
  expect(feedback.addPulsing).toBe(true);
  expect(feedback.addedFramePulsing).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const frames = window.app.framesList;
    return Math.round(frames.scrollLeft) >= Math.round(Math.max(0, frames.scrollWidth - frames.clientWidth));
  })).toBe(true);
  const metrics = await page.evaluate(() => {
    const frames = window.app.framesList;
    const addFrame = frames.querySelector('.add-frame-btn');
    const framesRect = frames.getBoundingClientRect();
    const addRect = addFrame?.getBoundingClientRect();
    return {
      frameIndex: window.app.frameIndex,
      frameCount: window.app.frames.length,
      scrollLeft: frames.scrollLeft,
      maxScroll: Math.max(0, frames.scrollWidth - frames.clientWidth),
      addVisible: Boolean(addRect && addRect.left >= framesRect.left && addRect.right <= framesRect.right)
    };
  });

  expect(metrics.frameCount).toBe(13);
  expect(metrics.frameIndex).toBe(12);
  expect(metrics.scrollLeft).toBe(metrics.maxScroll);
  expect(metrics.addVisible).toBe(true);
});

test('Motion keys sit on their thumbnails across the full scroll range', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page, 40);

  const canvas = page.locator('#rendering-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  await page.evaluate(() => {
    const app = window.app;
    app.setMotionTrackKeyframe(app.motionTracks[0], 39, { dx: 60, dy: 0 });
    app.renderMotionTracks();
    app.framesList.scrollLeft = app.framesList.scrollWidth;
  });

  const inside = await page.evaluate(() => [2, 39].map((frame) => {
    const card = window.app.framesList.querySelectorAll('.frame-card')[frame].getBoundingClientRect();
    const badge = document.querySelector(`.frame-key-badge[data-frame="${frame}"]`)?.getBoundingClientRect();
    return Boolean(badge) && badge.left >= card.left && badge.right <= card.right && badge.top >= card.top && badge.bottom <= card.bottom;
  }));
  expect(inside).toEqual([true, true]);
  await expect(page.locator('.frame-key-badge[data-frame="39"]')).toBeInViewport();
});

test('Truck creates a single lazy key on drag, ignores clicks, and undoes to the original ball', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await page.locator('#brush-size').fill('40');
  const drawDot = async (x, y) => {
    const box = await page.locator('#rendering-canvas').boundingBox();
    await page.mouse.move(box.x + x * box.width / 600, box.y + y * box.height / 600);
    await page.mouse.down();
    await page.mouse.up();
  };
  await drawDot(120, 120);
  const drawnAt = await page.evaluate(() => ({ ...window.app.frames[0].strokes[0].points[0] }));
  await page.locator('#tool-select').click();
  let box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  const before = await page.evaluate(() => ({ history: window.app.history.length, tracks: window.app.motionTracks.length }));

  box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await expect.poll(() => page.evaluate((beforeHistory) => ({
    tracks: window.app.motionTracks.length,
    history: window.app.history.length
  }), before.history)).toEqual({ tracks: 0, history: before.history });

  await dragSelectedObject(page, 80, 30);
  await expect.poll(() => page.evaluate((beforeHistory) => {
    const track = window.app.motionTracks[0];
    const point = window.app.frames[0].strokes.find((stroke) => stroke.motionTrackId)?.points[0];
    return window.app.motionTracks.length === 1 && track?.keyframes.length === 1 && track.keyframes[0].frame === 0 &&
      track.startFrame === 0 && track.endFrame === 0 && Math.abs(point?.x - 200) < 12 && Math.abs(point?.y - 150) < 12 &&
      window.app.history.length === beforeHistory + 1;
  }, before.history)).toBe(true);

  box = await page.locator('#rendering-canvas').boundingBox();
  const afterDrag = await page.evaluate(() => ({
    history: window.app.history.length,
    keys: window.app.motionTracks[0].keyframes.map((key) => ({ ...key }))
  }));
  await page.mouse.click(box.x + 200 * box.width / 600, box.y + 150 * box.height / 600);
  await expect.poll(() => page.evaluate(() => ({
    history: window.app.history.length,
    keys: window.app.motionTracks[0].keyframes.map((key) => ({ ...key }))
  }))).toEqual(afterDrag);

  // Undo puts the ball back exactly where it was drawn.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => ({
    tracks: window.app.motionTracks.length,
    points: window.app.frames[0].strokes.map((stroke) => stroke.points[0]),
    history: window.app.history.length
  }))).toEqual({ tracks: before.tracks, points: [drawnAt], history: before.history });
});

test('Truck drag updates an existing key and adds a new-frame key without changing another ball', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await page.locator('#brush-size').fill('40');
  const drawDot = async (x, y) => {
    const box = await page.locator('#rendering-canvas').boundingBox();
    await page.mouse.move(box.x + x * box.width / 600, box.y + y * box.height / 600);
    await page.mouse.down();
    await page.mouse.up();
  };
  await drawDot(100, 120);
  await drawDot(220, 120);
  await page.locator('#tool-select').click();
  let box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 100 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  box = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(box.x + 220 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#motion-key-action').click();
  const ids = await page.evaluate(() => window.app.motionTracks.map((track) => track.id));

  await dragSelectedObject(page, 40, 0);
  await expect.poll(() => page.evaluate(([firstId, secondId]) => {
    const first = window.app.getMotionTrack(firstId).keyframes;
    const second = window.app.getMotionTrack(secondId).keyframes;
    return first.length === 1 && first[0].frame === 0 && first[0].dx === 0 && first[0].dy === 0 &&
      second.length === 1 && second[0].frame === 0 && (Math.abs(second[0].dx) > 1 || Math.abs(second[0].dy) > 1);
  }, ids)).toBe(true);

  await dragSelectedObject(page, -40, 0);
  await expect.poll(() => page.evaluate((secondId) => {
    const key = window.app.getMotionTrack(secondId).keyframes[0];
    return Math.abs(key.dx) < 15 && Math.abs(key.dy) < 15;
  }, ids[1])).toBe(true);

  await page.evaluate(() => window.app.addFrame());
  await page.locator('.frame-card').nth(0).click();
  await page.locator('.frame-card').nth(1).click();
  await page.waitForFunction(() => window.app.selectedObject?.isMotionPreview === true);
  await dragSelectedObject(page, 30, 20);
  await expect.poll(() => page.evaluate(([firstId, secondId]) => {
    const first = window.app.getMotionTrack(firstId).keyframes;
    const second = window.app.getMotionTrack(secondId).keyframes;
    return first.length === 1 && first[0].frame === 0 && first[0].dx === 0 && first[0].dy === 0 &&
      second.length === 2 && second[0].frame === 0 && second[1].frame === 1 &&
      (Math.abs(second[1].dx - second[0].dx) > 1 || Math.abs(second[1].dy - second[0].dy) > 1);
  }, ids)).toBe(true);
});

test('Select edits and groups animated artwork without a Truck warning', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
  await seedFrames(page, 4, [{ x: 120, y: 120 }, { x: 220, y: 120 }]);
  await page.evaluate(() => {
    window.app.frames[2].strokes.forEach((stroke) => { stroke.size = 40; });
    window.app.renderCanvas();
  });
  await page.evaluate(() => {
    const app = window.app;
    const original = app.onMove.bind(app);
    app.onMove = (pos, pressure) => {
      if (app.tool === 'select' && app.dragMode) console.log('select move', pos, app.dragStart, app.getMoveDelta(pos), app.dragMode);
      return original(pos, pressure);
    };
  });

  const canvas = page.locator('#rendering-canvas');
  let box = await canvas.boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await page.locator('#tool-truck').click();
  await page.locator('#motion-key-action').click();
  const trackId = await page.evaluate(() => window.app.motionTracks[0].id);

  await page.locator('#tool-select').click();
  box = await canvas.boundingBox();
  await page.mouse.click(box.x + 120 * box.width / 600, box.y + 120 * box.height / 600);
  await dragSelectedObject(page, 30, 20);
  await expect.poll(() => page.evaluate((id) => {
    const track = window.app.getMotionTrack(id);
    const stroke = track?.baseObject;
    return Boolean(track && stroke && Math.abs(stroke.points[0].x - 150) < 1 && Math.abs(stroke.points[0].y - 140) < 1);
  }, trackId)).toBe(true);

  box = await canvas.boundingBox();
  await page.keyboard.down('Control');
  await page.mouse.click(box.x + 220 * box.width / 600, box.y + 120 * box.height / 600);
  await page.keyboard.up('Control');
  await expect.poll(() => page.evaluate(() => Boolean(window.app.selectedObject?.isGroup))).toBe(true);
  await page.locator('#btn-group').click();
  await expect.poll(() => page.evaluate(() => ({
    group: window.app.frames[2].strokes.some((stroke) => stroke.type === 'group'),
    tracks: window.app.motionTracks.length
  }))).toEqual({ group: true, tracks: 0 });
  const notice = await page.locator('#save-indicator').textContent();
  expect(notice || '').not.toContain('Use Motion');
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile-breakpoint', width: 600, height: 800 }
]) {
  test(`Truck keeps canvas geometry and artwork stable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await page.waitForFunction(() => window.app && Array.isArray(window.app.frames));
    const canvas = page.locator('#rendering-canvas');
    const initialBox = await canvas.boundingBox();
    await page.mouse.click(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
    await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes.length)).toBe(1);

    const snapshot = () => page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const workspace = document.querySelector('.workspace');
      return {
        canvas: rect('#canvas-wrapper'),
        workspace: rect('.workspace'),
        zoom: window.app.zoom,
        scroll: { left: workspace.scrollLeft, top: workspace.scrollTop },
        artwork: window.app.frames.map((frame) => window.app.cloneData({ strokes: frame.strokes, paperStrokes: frame.paperStrokes }))
      };
    });

    await page.evaluate(() => window.app.setTool('brush'));
    const before = await snapshot();
    await page.locator('#tool-truck').click();
    await expect(page.locator('#motion-settings')).toBeVisible();
    const truck = await snapshot();
    await page.locator('#tool-brush-anchor').click();
    await page.locator('#tool-brush-standard').click();
    await expect(page.locator('#brush-size')).toBeVisible();
    const brush = await snapshot();

    expect(truck).toEqual(before);
    expect(brush).toEqual(before);
  });
}
