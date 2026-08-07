import { expect, test } from '@playwright/test';

const rectangle = {
  type: 'rect',
  brushType: 'brush',
  color: '#000000',
  size: 10,
  opacity: 1,
  points: [
    { x: 100, y: 100, p: 0.5 },
    { x: 200, y: 100, p: 0.5 },
    { x: 200, y: 200, p: 0.5 },
    { x: 100, y: 200, p: 0.5 },
    { x: 100, y: 100, p: 0.5 }
  ],
  fillColor: null,
  sx: 1,
  sy: 1,
  angle: 0
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

test('keeps pasted selection and supports all advertised shape shortcuts', async ({ page }) => {
  await page.evaluate((stroke) => {
    window.app.frames[0].strokes.push(structuredClone(stroke));
    const selected = window.app.frames[0].strokes[0];
    window.app.selectedObject = { stroke: selected, layer: 'ink', index: 0 };
    window.app.calcBounds(selected);
    window.app.copySelection();
  }, rectangle);

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
  await expect.poll(() => page.evaluate(() => ({
    count: window.app.frames[0].strokes.length,
    selected: Boolean(window.app.selectedObject)
  }))).toEqual({ count: 2, selected: true });

  for (const [key, tool] of [['r', 'rect'], ['c', 'circle'], ['l', 'line']]) {
    await page.keyboard.press(key);
    await expect.poll(() => page.evaluate(() => window.app.tool)).toBe(tool);
  }
});

test('persists undo and synchronizes restored FPS controls', async ({ page }) => {
  await page.evaluate((stroke) => {
    window.app.saveState();
    window.app.frames[0].strokes.push(structuredClone(stroke));
    window.app.setFps(7);
    window.app.saveStorage();
  }, rectangle);
  await page.waitForTimeout(1_200);

  await page.evaluate(() => window.app.undo());
  await page.waitForTimeout(1_200);
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.frames);

  await expect.poll(() => page.evaluate(() => ({
    strokes: window.app.frames[0].strokes.length,
    fps: window.app.fps,
    display: document.getElementById('fps-disp').innerText,
    slider: document.querySelector('.timeline-controls input[type=range][oninput*="setFps"]').value
  }))).toEqual({ strokes: 0, fps: 7, display: '7 FPS', slider: '7' });
});

test('exposes editing controls to the keyboard and restores focus after dialogs', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Select tool (V)' })).toBeVisible();
  await page.getByRole('button', { name: 'Shapes; show shape options' }).click();
  await expect(page.getByRole('button', { name: 'Rectangle tool (R)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shapes; show shape options' })).toHaveAttribute('aria-expanded', 'true');

  const settings = page.getByRole('button', { name: 'Canvas Settings' });
  await settings.focus();
  await settings.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Project Settings' })).toBeVisible();
  await expect(page.locator('#canvas-width')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Project Settings' })).toBeHidden();
  await expect(settings).toBeFocused();
});

test('bounds extreme canvas settings to a safe exportable size', async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById('canvas-width').value = '999999';
    document.getElementById('canvas-height').value = '999999';
    window.app.applySettings();
  });
  await expect.poll(() => page.evaluate(() => ({
    width: window.app.canvasWidth,
    height: window.app.canvasHeight,
    pixels: window.app.canvasWidth * window.app.canvasHeight
  }))).toEqual({ width: 2000, height: 2000, pixels: 4_000_000 });
});

test('keeps navigation controls separate from undoable artwork', async ({ page }) => {
  await page.getByRole('button', { name: 'Text tool (T)' }).click();
  await page.getByRole('button', { name: 'Background' }).click();
  await expect(page.getByRole('button', { name: 'Background' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('#zoom-disp')).toHaveText('110%');
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.locator('#zoom-disp')).toHaveText('100%');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Fit canvas to workspace' }).click();
  await expect(page.locator('#zoom-disp')).toHaveText('100%');

  await page.evaluate((stroke) => {
    window.app.saveState();
    window.app.frames[0].strokes.push(structuredClone(stroke));
    window.app.renderCanvas();
  }, rectangle);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes.length)).toBe(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes.length)).toBe(1);
});

test('keeps shared artwork across frames and restores it with undo and redo', async ({ page }) => {
  await page.getByRole('button', { name: 'Background' }).click();
  await expect(page.getByRole('button', { name: 'Background' })).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate((stroke) => {
    window.app.saveState();
    window.app.sharedStrokes.push(structuredClone(stroke));
    window.app.renderCanvas();
    window.app.addFrame();
  }, rectangle);

  await expect.poll(() => page.evaluate(() => ({
    frame: window.app.frameIndex,
    frames: window.app.frames.length,
    shared: window.app.sharedStrokes.length,
    frameStrokes: window.app.frames[1].strokes.length
  }))).toEqual({ frame: 1, frames: 2, shared: 1, frameStrokes: 0 });

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => ({ frames: window.app.frames.length, shared: window.app.sharedStrokes.length })))
    .toEqual({ frames: 1, shared: 0 });

  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => page.evaluate(() => ({ frames: window.app.frames.length, shared: window.app.sharedStrokes.length })))
    .toEqual({ frames: 2, shared: 1 });

  await page.evaluate(() => window.app.saveStorage());
  await page.waitForTimeout(1_200);
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.frames);
  await expect.poll(() => page.evaluate(() => ({ frames: window.app.frames.length, shared: window.app.sharedStrokes.length })))
    .toEqual({ frames: 2, shared: 1 });
});

test('snaps selected-object movement to the grid and undoes cleanly', async ({ page }) => {
  await page.getByRole('button', { name: 'Snap' }).click();
  await expect(page.getByRole('button', { name: 'Snap' })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate((stroke) => {
    const item = structuredClone(stroke);
    window.app.frames[0].strokes = [item];
    window.app.saveState();
    window.app.tool = 'select';
    window.app.selectedObject = { stroke: item, layer: 'ink', index: 0 };
    window.app.calcBounds(item);
    window.app.dragMode = 'move';
    window.app.dragStart = { x: 0, y: 0 };
    window.app.dragOriginalBounds = { ...window.app.selectedObject.bounds };
    window.app.dragOriginalPoints = item.points.map((point) => ({ ...point }));
    window.app.onMove({ x: 14, y: 16 });
  }, rectangle);
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0].points[0])).toMatchObject({ x: 110, y: 120 });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0].points[0])).toMatchObject({ x: 100, y: 100 });
});

test('shows a view-only grid that scales with zoom', async ({ page }) => {
  const grid = page.getByRole('button', { name: 'Grid' });
  await grid.click();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#canvas-wrapper')).toHaveClass(/show-grid/);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await page.locator('#canvas-wrapper').evaluate((el) => getComputedStyle(el).getPropertyValue('--grid-size'))).toBe('11px');
});

test('mirrors freehand brush strokes vertically and keeps the result undoable', async ({ page }) => {
  const symmetry = page.getByRole('button', { name: 'Symmetry' });
  await symmetry.click();
  await expect(symmetry).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => {
    window.app.onDown({ x: 100, y: 120 }, 0.5, false);
    window.app.onMove({ x: 150, y: 180 }, 0.5);
    window.app.onUp();
  });

  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0])).toMatchObject({
    type: 'brush',
    symmetric: true,
    points: [{ x: 100, y: 120 }, { x: 150, y: 180 }]
  });
  await expect.poll(() => page.evaluate(() => window.app.getMirroredStroke(window.app.frames[0].strokes[0]).points))
    .toEqual([{ x: 500, y: 120, p: 0.5 }, { x: 450, y: 180, p: 0.5 }]);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes.length)).toBe(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0]?.symmetric)).toBe(true);
});

test('loads and removes a non-exported drawing reference', async ({ page }) => {
  await page.getByRole('button', { name: 'Reference' }).click();
  await page.locator('#reference-file-input').setInputFiles({ name: 'reference.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>') });
  await expect.poll(() => page.evaluate(() => Boolean(window.app.referenceImage?.src))).toBe(true);
  await expect(page.getByRole('button', { name: 'Remove ref.' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove ref.' }).click();
  await expect.poll(() => page.evaluate(() => window.app.referenceImage)).toBeNull();
});

test('aligns a multi-selection and restores it with undo and redo', async ({ page }) => {
  await page.evaluate((stroke) => {
    const first = structuredClone(stroke);
    const second = structuredClone(stroke);
    second.points.forEach((point) => { point.x += 80; point.y += 45; });
    window.app.frames[0].strokes = [first, second];
    const items = window.app.frames[0].strokes.map((item, index) => ({ stroke: item, layer: 'ink', index }));
    window.app.selectedObject = { isGroup: true, items, bounds: window.app.getGroupBounds(items), angle: 0 };
    window.app.groupSelection();
    window.app.renderCanvas();
    window.app.updateGroupToolbar();
  }, rectangle);
  await expect(page.getByTitle('Align top')).toBeVisible();
  await page.getByTitle('Align top').click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0].items.map((item) => item.points[0].y))).toEqual([100, 100]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0].items[1].points[0].y)).toBe(145);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0].items[1].points[0].y)).toBe(100);
});

test('pans an enlarged canvas with the Hand tool and Space-drag without drawing', async ({ page }) => {
  await expect.poll(() => page.evaluate(() => typeof window.app.startPan)).toBe('function');
  const hand = page.getByRole('button', { name: 'Toggle hand tool (H)' });
  await hand.click();
  await expect(hand).toHaveAttribute('aria-pressed', 'true');

  const workspace = page.locator('.workspace');
  await page.evaluate(() => {
    window.app.adjustZoom(2);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const workspace = document.querySelector('.workspace');
    workspace.scrollLeft = 95;
    workspace.scrollTop = 220;
  });
  const beforeHandPan = await workspace.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  const box = await workspace.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => Boolean(window.app.panStart))).toBe(true);
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 55);
  await page.mouse.up();
  const afterHandPan = await workspace.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(afterHandPan.left).toBeLessThan(beforeHandPan.left);
  expect(afterHandPan.top).toBeLessThan(beforeHandPan.top);

  await hand.click();
  await expect(hand).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => {
    const workspace = document.querySelector('.workspace');
    workspace.scrollLeft = 10;
    workspace.scrollTop = 10;
  });
  const beforeSpacePan = await workspace.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  await page.keyboard.down('Space');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2 - 55);
  await page.mouse.up();
  await page.keyboard.up('Space');
  const afterSpacePan = await workspace.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(afterSpacePan.left).toBeGreaterThan(beforeSpacePan.left);
  expect(afterSpacePan.top).toBeGreaterThan(beforeSpacePan.top);
  await expect.poll(() => page.evaluate(() => ({ strokes: window.app.frames[0].strokes.length, playing: window.app.isPlaying })))
    .toEqual({ strokes: 0, playing: false });
});

test('configures onion skin depth and opacity without altering undoable artwork', async ({ page }) => {
  const onion = page.getByRole('button', { name: 'Toggle onion skin' });
  const count = page.locator('#onion-count');
  const opacity = page.locator('#onion-opacity');
  await expect(count).toBeDisabled();
  await expect(opacity).toBeDisabled();

  await onion.click();
  await expect(count).toBeEnabled();
  await count.fill('3');
  await opacity.fill('55');
  await expect.poll(() => page.evaluate(() => ({
    enabled: window.app.isOnion,
    frames: window.app.onionFrames,
    opacity: window.app.onionOpacity,
    strokes: window.app.frames[0].strokes.length
  }))).toEqual({ enabled: true, frames: 3, opacity: 0.55, strokes: 0 });
  await expect(page.locator('#onion-count-disp')).toHaveText('3');
  await expect(page.locator('#onion-opacity-disp')).toHaveText('55%');
  expect(await page.locator('#onion-count-disp').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.locator('#onion-opacity-disp').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await onion.click();
  await expect(count).toBeDisabled();
  await expect(opacity).toBeDisabled();
  await onion.click();
  await expect.poll(() => page.evaluate(() => ({ frames: window.app.onionFrames, opacity: window.app.onionOpacity })))
    .toEqual({ frames: 3, opacity: 0.55 });
});

test('supports undoable frame holds and loop/once playback modes', async ({ page }) => {
  await page.evaluate(() => {
    window.app.addFrame();
    window.app.addFrame();
  });
  const hold = page.locator('#frame-hold');
  await hold.fill('4');
  await expect(page.locator('#frame-hold-disp')).toHaveText('4f');
  await expect.poll(() => page.evaluate(() => window.app.frames[window.app.frameIndex].hold)).toBe(4);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[window.app.frameIndex].hold)).toBe(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[window.app.frameIndex].hold)).toBe(4);

  const loopMode = page.locator('#loop-mode-btn');
  await expect(loopMode).toHaveText('Loop');
  await loopMode.click();
  await expect(loopMode).toHaveText('Once');
  await expect(loopMode).toHaveAttribute('aria-pressed', 'false');
  await loopMode.click();
  await expect(loopMode).toHaveText('Loop');
  await expect(loopMode).toHaveAttribute('aria-pressed', 'true');
});

test('opens brush and shape flyouts without clipping the toolbar', async ({ page }) => {
  const brush = page.getByRole('button', { name: 'Brushes; show brush options' });
  await brush.click();
  await expect(brush).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#brush-wrapper')).toHaveClass(/expanded/);
  await page.getByRole('button', { name: 'Pencil' }).click();
  await expect.poll(() => page.evaluate(() => window.app.brushType)).toBe('pencil');

  const shapes = page.getByRole('button', { name: 'Shapes; show shape options' });
  await shapes.click();
  await expect(shapes).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Rectangle tool (R)' }).click();
  await expect.poll(() => page.evaluate(() => window.app.tool)).toBe('rect');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.tools-panel')).overflowX)).toBe('visible');
});

test('bucket-fills the canvas with a real shape that the eraser can carve into', async ({ page }) => {
  await page.getByRole('button', { name: 'Fill tool (F)' }).click();
  await expect.poll(() => page.evaluate(() => window.app.tool)).toBe('bucket');
  await page.evaluate(() => {
    window.app.setColor('#ff0000');
    window.app.onDown({ x: 10, y: 10 }, 0.5, false);
    window.app.onUp();
  });

  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0])).toMatchObject({
    type: 'rect',
    fillColor: '#ff0000',
    points: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }, { x: 0, y: 0 }]
  });

  await page.getByRole('button', { name: 'Eraser tool (E)' }).click();
  await expect.poll(() => page.evaluate(() => window.app.tool)).toBe('eraser');
  await page.evaluate(() => {
    window.app.onDown({ x: 300, y: 300 }, 0.5, false);
    window.app.onMove({ x: 320, y: 300 }, 0.5);
    window.app.onUp();
  });

  await expect.poll(() => page.evaluate(() => {
    const fill = window.app.frames[0].strokes.find((s) => s.type === 'rect' && s.fillColor);
    return { exists: Boolean(fill), holes: fill ? fill.holes.length : 0 };
  })).toEqual({ exists: true, holes: 2 });
});

test('eraser splits the outline of an unfilled shape it crosses', async ({ page }) => {
  await page.evaluate((stroke) => {
    window.app.frames[0].strokes.push(structuredClone(stroke));
    window.app.tool = 'eraser';
    window.app.brushSize = 30;
    // Cross the top edge of the rect at y=100 from outside to inside
    window.app.onDown({ x: 150, y: 85 }, 0.5, false);
    window.app.onMove({ x: 150, y: 115 }, 0.5);
    window.app.onUp();
  }, rectangle);

  const result = await page.evaluate(() => ({
    count: window.app.frames[0].strokes.length,
    points: window.app.frames[0].strokes.map((s) => (s.points || []).length)
  }));
  expect(result.count).toBe(1);
  expect(result.points[0]).toBeLessThan(5);
});

test('eraser cuts through the border of a filled shape it crosses', async ({ page }) => {
  await page.evaluate(() => {
    window.app.setTool('rect');
    window.app.setColor('#ff0000');
    window.app.onDown({ x: 100, y: 100 }, 0.5, false);
    window.app.onMove({ x: 500, y: 500 }, 0.5);
    window.app.onUp();
    const s = window.app.frames[0].strokes[0];
    s.fillColor = '#ff0000';
    window.app.renderCanvas();
  });

  await page.evaluate(() => {
    window.app.setTool('eraser');
    window.app.brushSize = 40;
    // Cross the LEFT border (x=100) from outside to inside at y=300
    window.app.onDown({ x: 80, y: 300 }, 0.5, false);
    window.app.onMove({ x: 120, y: 300 }, 0.5);
    window.app.onUp();
  });

  const data = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = window.app.canvasWidth;
    c.height = window.app.canvasHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(window.app.bgCanvas, 0, 0);
    ctx.drawImage(window.app.canvas, 0, 0);
    const image = ctx.getImageData(0, 0, c.width, c.height);
    const isRed = (x, y) => {
      const i = (y * c.width + x) * 4;
      return image.data[i] > 200 && image.data[i + 1] < 100 && image.data[i + 2] < 100;
    };
    let borderRedCount = 0;
    for (let y = 288; y <= 312; y++) {
      if (isRed(100, y)) borderRedCount++;
    }
    return {
      borderRedCount,
      interiorIsWhite: !isRed(90, 300),
      strokes: window.app.frames[0].strokes.map((s) => ({
        type: s.type, fillColor: s.fillColor, holes: (s.holes || []).length
      }))
    };
  });
  expect(data.interiorIsWhite).toBe(true);
  expect(data.borderRedCount).toBe(0);
  expect(data.strokes[0].holes).toBeGreaterThan(0);
});

test('onion skin keeps the previous ball at full size', async ({ page }) => {
  await page.evaluate(() => {
    window.app.brushSize = 100;
    window.app.setTool('brush');
    window.app.onDown({ x: 150, y: 150 }, 0.5, false);
    window.app.onUp();
    window.app.duplicateFrame();
    window.app.frameIndex = 1;
    const ball = window.app.frames[1].strokes[0];
    ball.points = [{ x: 350, y: 350, p: 0.5 }];
    window.app.isOnion = true;
    window.app.onionFrames = 1;
    window.app.onionOpacity = 0.5;
    window.app.renderCanvas();
  });

  const data = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = window.app.canvasWidth;
    c.height = window.app.canvasHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(window.app.canvas, 0, 0);
    const image = ctx.getImageData(0, 0, c.width, c.height);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 50; y <= 250; y++) {
      for (let x = 50; x <= 250; x++) {
        const i = (y * c.width + x) * 4;
        if (image.data[i + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      onionDiameter: Math.round(Math.hypot(maxX - minX, maxY - minY)),
      strokeSize: window.app.frames[0].strokes[0].size
    };
  });
  expect(data.strokeSize).toBe(100);
  expect(data.onionDiameter).toBeGreaterThan(80);
});

test('brush cursor preview reflects the brush opacity setting', async ({ page }) => {
  await page.evaluate(() => {
    window.app.setColor('#ff0000');
    window.app.updateCursorStyle();
  });
  await page.waitForTimeout(300); // let CSS transitions settle
  const full = await page.evaluate(() => {
    const cursor = document.getElementById('brush-cursor');
    return {
      background: getComputedStyle(cursor).backgroundColor,
      border: getComputedStyle(cursor).borderColor,
      opacity: window.app.opacity
    };
  });
  expect(full.opacity).toBe(1);
  expect(full.background).toBe('rgb(255, 0, 0)');

  await page.evaluate(() => {
    window.app.setOpacity(25);
    window.app.updateCursorStyle();
  });
  await page.waitForTimeout(300);
  const faded = await page.evaluate(() => {
    const cursor = document.getElementById('brush-cursor');
    return {
      background: getComputedStyle(cursor).backgroundColor,
      opacity: window.app.opacity
    };
  });
  expect(faded.opacity).toBe(0.25);
  expect(faded.background.startsWith('rgba(255, 0, 0, 0.25)')).toBe(true);
});

test('erasing a single-point ball renders the hole so it can be drawn over', async ({ page }) => {
  await page.evaluate(() => {
    window.app.brushSize = 100;
    window.app.setTool('brush');
    window.app.setColor('#000000');
    window.app.onDown({ x: 300, y: 300 }, 0.5, false);
    window.app.onUp();
    window.app.frames[0].strokes[0].fillColor = '#000000';
    window.app.renderCanvas();
  });

  await page.evaluate(() => {
    window.app.setTool('eraser');
    window.app.brushSize = 40;
    window.app.onDown({ x: 300, y: 300 }, 0.5, false);
    window.app.onMove({ x: 380, y: 300 }, 0.5);
    window.app.onUp();
  });

  const data = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = window.app.canvasWidth;
    c.height = window.app.canvasHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(window.app.bgCanvas, 0, 0);
    ctx.drawImage(window.app.canvas, 0, 0);
    const image = ctx.getImageData(0, 0, c.width, c.height);
    const p = (x, y) => {
      const i = (y * c.width + x) * 4;
      return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
    };
    return {
      holes: window.app.frames[0].strokes[0].holes.length,
      insideErase: p(320, 300),
      ballCenter: p(300, 300)
    };
  });
  expect(data.holes).toBeGreaterThan(0);
  expect(data.insideErase).toEqual([255, 255, 255, 255]);
});

test('layer buttons carry shared/foreground hints', async ({ page }) => {
  await expect(page.locator('#layer-ink')).toHaveAttribute('title', /drawn fresh on each frame/);
  await expect(page.locator('#layer-paper')).toHaveAttribute('title', /shared across all frames/);
  await expect(page.locator('#layer-hint')).toHaveText(/Foreground is per-frame; Background is shared across all frames/);
});

test('project name is editable, persisted, and used for the save filename', async ({ page }) => {
  const nameInput = page.locator('#project-name');
  await expect(nameInput).toHaveValue('Untitled');

  await nameInput.fill('My Beach Scene');
  await nameInput.press('Enter');
  await expect.poll(() => page.evaluate(() => window.app.projectName)).toBe('My Beach Scene');

  await page.waitForTimeout(1500);
  const stored = await page.evaluate(async () => window.app.db.get('currentProject'));
  expect(stored).toContain('My Beach Scene');

  await page.reload();
  await page.waitForFunction(() => window.app && window.app.frames);
  await expect.poll(() => page.evaluate(() => window.app.projectName)).toBe('My Beach Scene');
  await expect(nameInput).toHaveValue('My Beach Scene');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => window.app.saveProject())
  ]);
  expect(download.suggestedFilename()).toBe('My Beach Scene.json');

  await page.evaluate(() => window.app.confirmNewAnimation());
  await expect.poll(() => page.evaluate(() => window.app.projectName)).toBe('Untitled');
  await expect(nameInput).toHaveValue('Untitled');
});
