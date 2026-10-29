import { expect, test } from '@playwright/test';

const dot = (x) => ({ type: 'brush', brushType: 'brush', color: '#000000', size: 40, opacity: 1, points: [{ x, y: 300, p: 0.5 }] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.frames);
  await page.evaluate((strokes) => {
    const app = window.app;
    app.confirmNewAnimation();
    // Frames 1 and 3 are identical, as after Duplicate.
    app.frames = strokes.map((stroke) => ({ strokes: [stroke], paperStrokes: [], hold: 1 }));
    app.frameIndex = 2;
    app.renderUI();
    app.renderCanvas();
  }, [dot(100), dot(200), dot(300), dot(200), dot(500)]);
});

test('undo stores unchanged frames once and keeps their objects when restoring', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window.app;
    const draw = (x) => {
      app.setTool('brush');
      app.onDown({ x, y: 100 }, 0.5);
      app.onMove({ x: x + 50, y: 120 }, 0.5);
      app.onUp();
    };
    draw(100);
    draw(300);
    const [first, second] = app.history;
    const reusedStrings = second.frames.filter((json, index) => json === first.frames[index]).length;
    const before = [...app.frames];
    app.undo();
    const keptObjects = app.frames.filter((frame, index) => frame === before[index]).length;
    const strokesAfterUndo = app.frames.map((frame) => frame.strokes.length);
    app.undo();
    // Identical frames must not end up sharing one object.
    const distinctObjects = new Set(app.frames).size;
    app.frames[1].strokes.push(app.cloneData(app.frames[1].strokes[0]));
    const editedOnlyOne = [app.frames[1].strokes.length, app.frames[3].strokes.length];
    app.redo();
    return { reusedStrings, keptObjects, strokesAfterUndo, distinctObjects, editedOnlyOne, redoBlocked: app.redoStack.length };
  });
  // The second snapshot differs from the first only in the edited frame.
  expect(result.reusedStrings).toBe(4);
  expect(result.keptObjects).toBe(4);
  expect(result.strokesAfterUndo).toEqual([1, 1, 2, 1, 1]);
  expect(result.distinctObjects).toBe(5);
  expect(result.editedOnlyOne).toEqual([2, 1]);
});

test('undo and redo restore artwork across several frames', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window.app;
    const count = () => app.frames.map((frame) => frame.strokes.length);
    const states = [count()];
    for (const index of [0, 4, 2]) {
      app.selectFrame(index);
      app.saveState();
      app.frames[index].strokes.push({ type: 'brush', brushType: 'brush', color: '#ff0000', size: 10, opacity: 1, points: [{ x: 50, y: 50, p: 0.5 }] });
      states.push(count());
    }
    const undone = [];
    while (app.undo()) undone.push(count());
    const redone = [];
    while (app.redo()) redone.push(count());
    return { states, undone, redone };
  });
  expect(result.undone).toEqual([result.states[2], result.states[1], result.states[0]]);
  expect(result.redone).toEqual([result.states[1], result.states[2], result.states[3]]);
});
