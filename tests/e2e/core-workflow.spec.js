import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

test('creates and edits a simple two-frame animation', async ({ page }) => {
  const canvas = await page.locator('#rendering-canvas').boundingBox();
  expect(canvas).not.toBeNull();

  const point = (x, y) => ({
    x: canvas.x + (canvas.width * x) / 600,
    y: canvas.y + (canvas.height * y) / 600
  });

  const start = point(100, 100);
  const end = point(250, 220);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();

  await page.locator('#tool-text').click();
  const textPoint = point(180, 300);
  await page.mouse.click(textPoint.x, textPoint.y);
  await page.locator('#text-input-value').fill('Hello SketchMotion');
  await page.locator('#text-modal-submit').click();

  await page.locator('.frame-copy-btn').click();
  await page.locator('#onion-btn').click();

  await expect.poll(() => page.evaluate(() => ({
    frames: window.app.frames.length,
    strokes: window.app.frames[0].strokes.map((stroke) => stroke.type),
    onion: window.app.isOnion
  }))).toEqual({
    frames: 2,
    strokes: ['brush', 'text'],
    onion: true
  });
});

test('creates and edits sized bold text with undo and redo', async ({ page }) => {
  await page.locator('#tool-text').click();
  const canvas = await page.locator('#rendering-canvas').boundingBox();
  await page.mouse.click(canvas.x + 180, canvas.y + 180);
  await page.locator('#text-input-value').fill('Bold title');
  await page.locator('#text-size').fill('64');
  await page.locator('#text-bold').check();
  await page.locator('#text-modal-submit').click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0])).toMatchObject({ type: 'text', text: 'Bold title', size: 64, bold: true });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes.length)).toBe(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frames[0].strokes[0].bold)).toBe(true);
});

test('opens and closes the consolidated export menu', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const toggle = page.getByRole('button', { name: /Export/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => {
    const menu = document.getElementById('export-menu');
    const item = menu.querySelector('[role="menuitem"]');
    const bounds = item.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest('#export-menu') === menu;
  })).toBe(true);
  await page.getByRole('menuitem', { name: 'Current frame PNG' }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
});

test('downloads a PNG frame and an editable project file', async ({ page }, testInfo) => {
  const exportMenu = page.getByRole('button', { name: /Export/ });
  const chooseExport = async (name) => {
    await exportMenu.click();
    await expect(exportMenu).toHaveAttribute('aria-expanded', 'true');
    return page.getByRole('menuitem', { name }).click();
  };

  const [png] = await Promise.all([
    page.waitForEvent('download'),
    chooseExport('Current frame PNG')
  ]);
  expect(png.suggestedFilename()).toBe('Untitled-frame-001.png');

  const [transparentPng] = await Promise.all([
    page.waitForEvent('download'),
    chooseExport('Transparent PNG')
  ]);
  expect(transparentPng.suggestedFilename()).toBe('Untitled-frame-001-transparent.png');

  const [svg] = await Promise.all([
    page.waitForEvent('download'),
    chooseExport('SVG artwork')
  ]);
  expect(svg.suggestedFilename()).toBe('Untitled-frame-001.svg');

  const [pngSequence] = await Promise.all([
    page.waitForEvent('download'),
    chooseExport('PNG frames ZIP')
  ]);
  expect(pngSequence.suggestedFilename()).toBe('Untitled-png-sequence.zip');

  if (testInfo.project.name !== 'webkit') {
    const [webm] = await Promise.all([
      page.waitForEvent('download'),
      chooseExport('Video (WebM)')
    ]);
    expect(webm.suggestedFilename()).toBe('Untitled.webm');
  }

  const [project] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Save$/ }).click()
  ]);
  expect(project.suggestedFilename()).toBe('Untitled.json');
});

test('prefers VP8, then VP9, then browser-default WebM', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'webkit', 'WebKit does not expose canvas captureStream in this test environment');

  const supportedMimeType = async (supported) => page.evaluate((supportedTypes) => {
    const originalRecorder = window.MediaRecorder;
    const FakeMediaRecorder = function FakeMediaRecorder() {};
    FakeMediaRecorder.isTypeSupported = (type) => supportedTypes.includes(type);
    window.MediaRecorder = FakeMediaRecorder;
    const result = window.app.getVideoSupport();
    window.MediaRecorder = originalRecorder;
    return result.mimeType;
  }, supported);

  expect(await supportedMimeType(['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']))
    .toBe('video/webm;codecs=vp8');
  expect(await supportedMimeType(['video/webm;codecs=vp9', 'video/webm']))
    .toBe('video/webm;codecs=vp9');
  expect(await supportedMimeType(['video/webm']))
    .toBe('video/webm');
});

test('exports GIFs up to 150 frames without a warning', async ({ page }) => {
  await page.evaluate(() => {
    window.app.frames = Array.from({ length: 150 }, () => ({ strokes: [], paperStrokes: [], hold: 1 }));
    window.app.exportGIF = () => { window.__exportChoice = 'gif'; };
    window.app.runExport('gif');
  });

  await expect(page.locator('#gif-warning-modal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__exportChoice)).toBe('gif');
});

test('warns for long GIFs, preserves the project, and routes each choice', async ({ page }) => {
  await page.evaluate(() => {
    window.app.frames = Array.from({ length: 151 }, (_, index) => ({
      strokes: [{ type: 'text', text: `Frame ${index}`, x: 10, y: 20, size: 20, color: '#000000' }],
      paperStrokes: [],
      hold: (index % 3) + 1
    }));
    window.app.frameIndex = 37;
    window.app.fps = 17;
    window.app.loopMode = 'once';
    window.app.isOnion = true;
    window.app.projectName = 'Long animation';
    window.app.history = ['history-entry'];
    window.app.redoStack = ['redo-entry'];
    window.app.getVideoSupport = () => ({ available: true, codecMimeType: 'video/webm;codecs=vp8', fallbackMimeType: 'video/webm', mimeType: 'video/webm;codecs=vp8' });
    window.app.exportWebM = () => { window.__exportChoice = 'webm'; };
    window.app.exportGIF = () => { window.__exportChoice = 'gif'; };
    window.app.runExport('gif');
  });

  await expect(page.locator('#gif-warning-modal')).toBeVisible();
  await expect(page.locator('#gif-warning-description')).toContainText('This animation has 151 frames');
  await expect(page.locator('#gif-warning-description')).toContainText('Google Classroom');

  const before = await page.evaluate(() => ({
    frames: structuredClone(window.app.frames),
    frameIndex: window.app.frameIndex,
    fps: window.app.fps,
    loopMode: window.app.loopMode,
    isOnion: window.app.isOnion,
    projectName: window.app.projectName,
    history: [...window.app.history],
    redoStack: [...window.app.redoStack]
  }));

  await page.locator('#gif-warning-video').click();
  await expect.poll(() => page.evaluate(() => window.__exportChoice)).toBe('webm');
  await expect(page.locator('#gif-warning-modal')).toBeHidden();
  expect(await page.evaluate(() => ({
    frames: structuredClone(window.app.frames),
    frameIndex: window.app.frameIndex,
    fps: window.app.fps,
    loopMode: window.app.loopMode,
    isOnion: window.app.isOnion,
    projectName: window.app.projectName,
    history: [...window.app.history],
    redoStack: [...window.app.redoStack]
  }))).toEqual(before);

  await page.evaluate(() => window.app.runExport('gif'));
  await expect(page.locator('#gif-warning-modal')).toBeVisible();
  await page.locator('#gif-warning-gif').click();
  await expect.poll(() => page.evaluate(() => window.__exportChoice)).toBe('gif');
  await expect(page.locator('#gif-warning-modal')).toBeHidden();

  await page.evaluate(() => window.app.runExport('gif'));
  await expect(page.locator('#gif-warning-modal')).toBeVisible();
  await page.locator('#gif-warning-cancel').click();
  await expect(page.locator('#gif-warning-modal')).toBeHidden();
});

test('keeps GIF export available when VP8 and VP9 are unsupported', async ({ page }) => {
  await page.evaluate(() => {
    window.app.frames = Array.from({ length: 151 }, () => ({ strokes: [], paperStrokes: [], hold: 1 }));
    window.app.getVideoSupport = () => ({ available: true, codecMimeType: null, fallbackMimeType: 'video/webm', mimeType: 'video/webm' });
    window.app.exportGIF = () => { window.__exportChoice = 'gif'; };
    window.app.runExport('gif');
  });

  await expect(page.locator('#gif-warning-modal')).toBeVisible();
  await expect(page.locator('#gif-warning-video')).toBeHidden();
  await expect(page.locator('#gif-warning-video-unavailable')).toContainText('Video export is unsupported in this browser');
  await page.locator('#gif-warning-gif').click();
  await expect.poll(() => page.evaluate(() => window.__exportChoice)).toBe('gif');
});

test('paces WebM frames and flushes recorder data before stopping', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Recorder timing is covered with a deterministic Chromium fake');

  const result = await page.evaluate(async () => {
    const originalRecorder = window.MediaRecorder;
    const originalCaptureStream = HTMLCanvasElement.prototype.captureStream;
    const calls = [];
    const frameTimes = [];
    const track = {
      requestFrame: () => frameTimes.push(performance.now()),
      stop: () => calls.push('track.stop')
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track]
    };
    HTMLCanvasElement.prototype.captureStream = () => stream;

    class FakeMediaRecorder {
      static isTypeSupported(type) {
        return type === 'video/webm;codecs=vp8';
      }

      constructor() {
        this.mimeType = 'video/webm;codecs=vp8';
        this.state = 'inactive';
        this.listeners = new Map();
      }

      addEventListener(type, listener, options = {}) {
        const listeners = this.listeners.get(type) || [];
        listeners.push({ listener, once: options.once === true });
        this.listeners.set(type, listeners);
      }

      dispatch(type, event = {}) {
        const listeners = this.listeners.get(type) || [];
        this.listeners.set(type, listeners.filter(({ once }) => !once));
        listeners.forEach(({ listener }) => listener(event));
      }

      start() {
        calls.push('start');
        this.state = 'recording';
      }

      requestData() {
        calls.push('requestData');
        this.dispatch('dataavailable', { data: new Blob(['flush']) });
      }

      stop() {
        calls.push('stop');
        this.state = 'inactive';
        this.dispatch('dataavailable', { data: new Blob(['final']) });
        this.dispatch('stop');
      }
    }

    window.MediaRecorder = FakeMediaRecorder;
    window.app.frames = [
      { strokes: [], paperStrokes: [], hold: 1 },
      { strokes: [], paperStrokes: [], hold: 1 }
    ];
    window.app.fps = 30;
    window.app.setExportProgress = () => {};
    window.app.showExportNotice = () => {};
    const started = performance.now();
    try {
      await window.app.exportWebM();
      return {
        elapsed: performance.now() - started,
        frameCount: frameTimes.length,
        minimumFrameInterval: frameTimes.length > 1 ? frameTimes[1] - frameTimes[0] : 0,
        calls
      };
    } finally {
      window.MediaRecorder = originalRecorder;
      HTMLCanvasElement.prototype.captureStream = originalCaptureStream;
    }
  });

  expect(result.frameCount).toBe(2);
  expect(result.minimumFrameInterval).toBeGreaterThanOrEqual(25);
  expect(result.calls.indexOf('requestData')).toBeGreaterThan(-1);
  expect(result.calls.indexOf('requestData')).toBeLessThan(result.calls.indexOf('stop'));
  expect(result.calls.at(-1)).toBe('track.stop');
});

test('navigates timeline frames forwards and backwards without crossing boundaries', async ({ page }) => {
  await page.evaluate(() => {
    window.app.addFrame();
    window.app.addFrame();
  });
  await expect.poll(() => page.evaluate(() => ({ frames: window.app.frames.length, index: window.app.frameIndex })))
    .toEqual({ frames: 3, index: 2 });
  await expect(page.locator('#frame-position')).toHaveText('Frame 3 of 3');
  await expect(page.getByRole('button', { name: 'Next frame' })).toBeDisabled();

  await page.getByRole('button', { name: 'Previous frame' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frameIndex)).toBe(1);
  await expect(page.locator('#frame-position')).toHaveText('Frame 2 of 3');
  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frameIndex)).toBe(2);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.app.frameIndex)).toBe(1);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.app.frameIndex)).toBe(0);
  await expect(page.getByRole('button', { name: 'Previous frame' })).toBeDisabled();

  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect.poll(() => page.evaluate(() => window.app.frameIndex)).toBe(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.app.frameIndex)).toBe(2);
});

test('starts blank, square, and wide animations from the simple New chooser', async ({ page }) => {
  const newButton = page.getByRole('button', { name: 'New' });
  await newButton.click();
  await expect(page.getByRole('dialog', { name: 'Start a new animation' })).toBeVisible();
  await page.getByRole('button', { name: /Square loop/ }).click();
  await expect.poll(() => page.evaluate(() => ({ width: window.app.canvasWidth, height: window.app.canvasHeight, frames: window.app.frames.length })))
    .toEqual({ width: 1080, height: 1080, frames: 1 });

  await newButton.click();
  await page.getByRole('button', { name: /Wide animation/ }).click();
  await expect.poll(() => page.evaluate(() => ({ width: window.app.canvasWidth, height: window.app.canvasHeight })))
    .toEqual({ width: 1280, height: 720 });

  await newButton.click();
  await page.getByRole('button', { name: /Blank canvas/ }).click();
  await expect.poll(() => page.evaluate(() => ({ width: window.app.canvasWidth, height: window.app.canvasHeight })))
    .toEqual({ width: 600, height: 600 });
});

test('exports an animated GIF without external runtime requests', async ({ page }) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(page.url()).origin) {
      externalRequests.push(request.url());
    }
  });

  await page.evaluate(() => {
    window.app.resizeCanvas(120, 120);
    window.app.frames = [
      { strokes: [], paperStrokes: [], frameBgColor: '#ffffff' },
      { strokes: [], paperStrokes: [], frameBgColor: '#000000' }
    ];
    window.app.frameIndex = 0;
    window.app.renderUI();
    window.app.renderCanvas();
  });

  const [gif] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export/ }).click().then(() => page.getByRole('menuitem', { name: 'GIF animation' }).click())
  ]);
  expect(gif.suggestedFilename()).toBe('Untitled.gif');
  expect(externalRequests).toEqual([]);
});

test('publishes installable offline metadata when served from the web', async ({ page }) => {
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /\/motionsketch\/manifest\.webmanifest$/);
  expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(true);
  const worker = await page.request.get('/motionsketch/sw.js');
  expect(worker.ok()).toBe(true);
  expect(await worker.text()).toContain("const CACHE_NAME = 'sketchmotion-v1'");
});
