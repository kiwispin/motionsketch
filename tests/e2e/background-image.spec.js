import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app?.db.db);
  await page.evaluate(() => window.app.confirmNewAnimation());
});

async function imageFile(page, color = '#ff0000', width = 80, height = 40) {
  const dataUrl = await page.evaluate(({ color, width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png');
  }, { color, width, height });
  return { name: 'Background.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

async function choose(page, file) {
  await page.locator('#background-image-input').setInputFiles(file);
  await expect(page.locator('#settings-apply')).toBeEnabled();
  await expect(page.locator('#background-image-name')).toHaveText(file.name);
}

async function install(page, color = '#ff0000') {
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  await choose(page, await imageFile(page, color));
  await page.locator('#settings-apply').click();
}

async function pixel(page, dataUrl, x = 300, y = 300) {
  return page.evaluate(async ({ dataUrl, x, y }) => {
    const image = new Image(); image.src = dataUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(x, y, 1, 1).data];
  }, { dataUrl, x, y });
}

async function download(page, fn) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.evaluate(fn)]);
  return readFile(await file.path());
}

test('stages import, replacement and removal until Apply; Undo/Redo restores pixels and size', async ({ page }) => {
  const before = await page.locator('.tools-panel').boundingBox();
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  await choose(page, await imageFile(page));
  expect(await page.evaluate(() => app.backgroundImage)).toBeNull();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => app.history.length)).toBe(0);
  await install(page);
  const original = await page.evaluate(() => app.backgroundImage.dataUrl);
  expect(await page.evaluate(() => app.getBackgroundImagePlacement())).toEqual({ x: 0, y: 150, width: 600, height: 300 });
  expect(await page.evaluate(() => [...app.bgCtx.getImageData(300, 300, 1, 1).data])).toEqual([255, 0, 0, 255]);
  expect(await page.evaluate(() => [...app.bgCtx.getImageData(300, 50, 1, 1).data])).toEqual([255, 255, 255, 255]);
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  await choose(page, await imageFile(page, '#0000ff'));
  await page.locator('#canvas-width').fill('800');
  await page.locator('#settings-apply').click();
  expect(await page.evaluate(() => app.history.length)).toBe(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => ({ width: app.canvasWidth, image: app.backgroundImage.dataUrl }))).toEqual({ width: 600, image: original });
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await page.evaluate(() => [...app.bgCtx.getImageData(400, 300, 1, 1).data])).toEqual([0, 0, 255, 255]);
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  await page.locator('#background-image-remove').click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => app.backgroundImage)).not.toBeNull();
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  await page.locator('#background-image-remove').click();
  await page.locator('#settings-apply').click();
  expect(await page.evaluate(() => app.backgroundImage)).toBeNull();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => [...app.bgCtx.getImageData(400, 300, 1, 1).data])).toEqual([0, 0, 255, 255]);
  expect(await page.locator('.tools-panel').boundingBox()).toEqual(before);
});

test('saves one embedded image, reopens it, restores autosave, and clears it for old/new projects', async ({ page }) => {
  await install(page);
  await page.evaluate(() => { app.addFrame(); app.addFrame(); });
  const saved = JSON.parse((await download(page, () => app.saveProject())).toString());
  expect(saved.version).toBe(7);
  expect(saved.backgroundImage.name).toBe('Background.png');
  expect(saved.frames.every(frame => !frame.backgroundImage)).toBe(true);
  await expect.poll(() => page.evaluate(async () => JSON.parse(await app.db.get('currentProject') || '{}').backgroundImage?.name)).toBe('Background.png');
  await page.reload();
  await page.waitForFunction(() => window.app?.backgroundImage);
  expect(await page.evaluate(() => [...app.bgCtx.getImageData(300, 300, 1, 1).data])).toEqual([255, 0, 0, 255]);
  await page.evaluate(() => app.confirmNewAnimation());
  expect(await page.evaluate(() => app.backgroundImage)).toBeNull();
  await page.locator('#file-input').setInputFiles({ name: 'background-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect.poll(() => page.evaluate(() => app.backgroundImage?.name)).toBe('Background.png');
  expect(await page.evaluate(() => app.frames.length)).toBe(3);
  await page.evaluate(() => app.importProjectData({ version: 6, frames: [{ strokes: [] }] }));
  expect(await page.evaluate(() => app.backgroundImage)).toBeNull();
});

test('rejects invalid and oversized images without replacing the draft or project', async ({ page }) => {
  await install(page);
  const original = await page.evaluate(() => app.backgroundImage.dataUrl);
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  const input = page.locator('#background-image-input');
  await input.setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
  await expect(page.locator('#background-image-error')).toContainText('could not be opened');
  await input.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.locator('#background-image-error')).toContainText('10 MB');
  await input.setInputFiles(await imageFile(page, '#00ff00', 4001, 4000));
  await expect(page.locator('#background-image-error')).toContainText('16 megapixels');
  expect(await page.evaluate(() => app.backgroundImageDraft.dataUrl)).toBe(original);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('#file-input').setInputFiles({ name: 'bad-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 7, frames: [{ strokes: [] }], backgroundImage: { dataUrl: 'https://example.com/x.png' } })) });
  await expect(page.locator('#save-indicator')).toContainText('PNG, JPEG or WebP');
  expect(await page.evaluate(() => app.backgroundImage.dataUrl)).toBe(original);
});

test('PNG, SVG, ZIP and GIF source frames include the image; Transparent PNG omits it', async ({ page }) => {
  await install(page);
  await page.evaluate(() => app.addFrame());
  const png = await download(page, () => app.exportFrame());
  expect(await pixel(page, `data:image/png;base64,${png.toString('base64')}`)).toEqual([255, 0, 0, 255]);
  const transparent = await download(page, () => app.exportFrame(true));
  expect(await pixel(page, `data:image/png;base64,${transparent.toString('base64')}`)).toEqual([0, 0, 0, 0]);
  const svg = await download(page, () => app.exportSVG());
  expect(svg.toString()).toContain('<image href="data:image/png;base64,');
  expect(await pixel(page, `data:image/svg+xml;base64,${svg.toString('base64')}`)).toEqual([255, 0, 0, 255]);
  const zip = await JSZip.loadAsync(await download(page, () => app.exportPNGSequence()));
  expect(Object.keys(zip.files)).toHaveLength(2);
  for (const file of Object.values(zip.files)) {
    expect(await pixel(page, `data:image/png;base64,${await file.async('base64')}`)).toEqual([255, 0, 0, 255]);
  }
  await page.evaluate(() => { window.gifshot.createGIF = options => { window.backgroundGifFrames = options.images; }; app.exportGIF(); });
  await page.waitForFunction(() => window.backgroundGifFrames?.length === 2);
  for (const source of await page.evaluate(() => window.backgroundGifFrames)) expect(await pixel(page, source)).toEqual([255, 0, 0, 255]);
  for (const source of await page.locator('.frame-card img').evaluateAll(images => images.map(image => image.src))) expect(await pixel(page, source, 60, 60)).toEqual([255, 0, 0, 255]);
});

test('video rendering contains the image on every recorded frame', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'webkit', 'Canvas captureStream is unavailable in this WebKit build');
  await install(page);
  await page.evaluate(() => {
    app.addFrame();
    window.recordedBackgroundPixels = [];
    const render = app.renderFrameToContext.bind(app);
    app.renderFrameToContext = (context, frame, transparent) => {
      render(context, frame, transparent);
      window.recordedBackgroundPixels.push([...context.getImageData(300, 300, 1, 1).data]);
    };
  });
  const video = await download(page, () => app.exportWebM());
  expect(video.length).toBeGreaterThan(0);
  const pixels = await page.evaluate(() => window.recordedBackgroundPixels);
  expect(pixels.length).toBeGreaterThanOrEqual(2);
  expect(pixels.every(value => JSON.stringify(value) === '[255,0,0,255]')).toBe(true);
});

test('Cancel invalidates an in-flight image load', async ({ page }) => {
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  await page.evaluate(() => {
    const decode = app.decodeBackgroundImage.bind(app);
    app.decodeBackgroundImage = async value => { await new Promise(resolve => { window.resumeBackgroundLoad = resolve; }); return decode(value); };
  });
  await page.locator('#background-image-input').setInputFiles(await imageFile(page));
  await page.waitForFunction(() => window.resumeBackgroundLoad);
  await expect(page.locator('#settings-apply')).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => window.resumeBackgroundLoad());
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  expect(await page.evaluate(() => app.backgroundImageDraft)).toBeNull();
  await expect(page.locator('#background-image-set')).toBeVisible();
});

test('keeps drawn artwork above the image, including eraser holes and transparent export', async ({ page }) => {
  await install(page);
  const result = await page.evaluate(() => {
    const stroke = { type: 'brush', brushType: 'brush', color: '#0000ff', size: 100, opacity: 1, points: [{ x: 300, y: 300, p: .5 }],
      holes: [[{ x: 290, y: 290 }, { x: 310, y: 290 }, { x: 310, y: 310 }, { x: 290, y: 310 }]] };
    app.sharedStrokes = [stroke];
    app.renderCanvas();
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    app.renderFrameToContext(ctx, app.frames[0]);
    const normal = [...ctx.getImageData(300, 300, 1, 1).data];
    const ink = [...ctx.getImageData(325, 300, 1, 1).data];
    app.renderFrameToContext(ctx, app.frames[0], true);
    return { normal, ink, hole: [...ctx.getImageData(300, 300, 1, 1).data], transparentInk: [...ctx.getImageData(325, 300, 1, 1).data] };
  });
  expect(result).toEqual({ normal: [255, 0, 0, 255], ink: [0, 0, 255, 255], hole: [0, 0, 0, 0], transparentInk: [0, 0, 255, 255] });
});

test('accepts JPEG/WebP and preserves PNG transparency over the background colour', async ({ page }) => {
  await page.getByRole('button', { name: 'Canvas Settings', exact: true }).click();
  for (const type of ['image/jpeg', 'image/webp', 'image/png']) {
    const dataUrl = await page.evaluate(type => {
      const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 40;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(0, 0, 40, 40);
      return canvas.toDataURL(type);
    }, type);
    // Some WebKit versions cannot encode WebP fixtures; PNG fallback is not a WebP test.
    if (!dataUrl.startsWith(`data:${type};`)) continue;
    await choose(page, { name: type.split('/')[1], mimeType: type, buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  }
  await page.locator('#settings-apply').click();
  const rgba = await page.evaluate(() => [...app.bgCtx.getImageData(300, 300, 1, 1).data]);
  expect(rgba[0]).toBe(255); expect(rgba[1]).toBeGreaterThanOrEqual(126); expect(rgba[1]).toBeLessThanOrEqual(128); expect(rgba[3]).toBe(255);
});
