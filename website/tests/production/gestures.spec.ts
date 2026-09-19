import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Replace only camera/model acquisition. Recognition, filtering, hit testing,
// pointer dispatch and the page's callbacks are the actual published npm code.
async function startReplay(page: Page) {
  await page.evaluate(async () => {
    const url = '/assets/aircursor-core.js';
    const { AirCursorEngine, DEMO_PACKAGE } = await import(url);
    (window as any).__replayPackage = DEMO_PACKAGE;
    AirCursorEngine.prototype.start = async function () {
      this.running = true;
      this.lastFrameTime = performance.now();
      this.rafId = requestAnimationFrame(this._loop);
    };
  });
  await page.locator('#cast').click();
  await expect(page.locator('body')).toHaveClass(/tracking/);
}

async function gestureFrames(page: Page, target: { x: number; y: number }, pressed: boolean, frames: number) {
  await page.evaluate(async ({ target, pressed, frames }) => {
    const engine = (window as any).__airCursorDemo;
    for (let i = 0; i < frames; i++) {
        const region = engine.options.activeRegion;
        const x = region.left + (1 - target.x / innerWidth) * (1 - region.left - region.right);
        const y = region.top + target.y / innerHeight * (1 - region.top - region.bottom);
        const hand = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
        hand[0] = { x: .5, y: .6, z: 0 };
        hand[8] = { x: .5, y: .4, z: 0 };
        hand[12] = { x: .51, y: .4, z: 0 };
        hand[16] = { x: .56, y: .4, z: 0 };
        hand[20] = { x: .61, y: .4, z: 0 };
        hand[4] = { x: pressed ? .51 : .59, y: .4, z: 0 };
        hand.forEach(p => { p.x += x - .505; p.y += y - .4; });
        engine._onResults({ multiHandLandmarks: [hand], multiHandedness: [{ label: 'Left', score: 1 }] });
        await new Promise(resolve => setTimeout(resolve, 42));
    }
  }, { target, pressed, frames });
}

async function startGestureStream(page: Page, target: { x: number; y: number }, pressed: boolean, frames: number, interval: number) {
  await page.evaluate(({ target, pressed, frames, interval }) => {
    const engine = (window as any).__airCursorDemo;
    (window as any).__gestureStream = (async () => {
      for (let i = 0; i < frames; i++) {
        const region = engine.options.activeRegion;
        const x = region.left + (1 - target.x / innerWidth) * (1 - region.left - region.right);
        const y = region.top + target.y / innerHeight * (1 - region.top - region.bottom);
        const hand = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
        hand[0] = { x: .5, y: .6, z: 0 };
        hand[8] = { x: .5, y: .4, z: 0 };
        hand[12] = { x: .51, y: .4, z: 0 };
        hand[16] = { x: .56, y: .4, z: 0 };
        hand[20] = { x: .61, y: .4, z: 0 };
        hand[4] = { x: pressed ? .51 : .59, y: .4, z: 0 };
        hand.forEach(p => { p.x += x - .505; p.y += y - .4; });
        engine._onResults({ multiHandLandmarks: [hand], multiHandedness: [{ label: 'Left', score: 1 }] });
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    })();
  }, { target, pressed, frames, interval });
}

async function gestureClick(page: Page, selector: string, dragTo?: { x: number; y: number }) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const rect = (await page.locator(selector).boundingBox())!;
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await gestureFrames(page, point, false, 10);
  await gestureFrames(page, point, true, 10);
  if (dragTo) await gestureFrames(page, dragTo, true, 12);
  await gestureFrames(page, dragTo || point, false, 8);
}

test('compressed galaxy waits for the npm pointer-to-click transition', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer', 'webgl-worker');
  await startReplay(page);
  const rect = (await page.locator('.hero').boundingBox())!;
  const point = { x: rect.x + rect.width * .82, y: rect.y + rect.height * .35 };
  await gestureFrames(page, point, false, 190);
  await expect(page.locator('.hero')).toHaveAttribute('data-phase', 'silence');
  await expect(page.locator('.hero-copy')).toHaveCSS('opacity', '0');
  const heldX = Number(await page.locator('.hero').getAttribute('data-field-x'));
  const movedPoint = { x: rect.x + rect.width * .36, y: rect.y + rect.height * .62 };
  // Keep input arriving faster than the worker's intentional 30fps render
  // rate. Coordinate messages must not cancel and starve the pending frame.
  await startGestureStream(page, movedPoint, false, 190, 8);
  await page.waitForTimeout(1200);
  await expect(page.locator('.hero')).toHaveAttribute('data-phase', 'silence');
  const movedX = Number(await page.locator('.hero').getAttribute('data-field-x'));
  expect(Math.abs(movedX-heldX)).toBeGreaterThan(.1);
  await page.evaluate(() => (window as any).__gestureStream);
  await gestureFrames(page, movedPoint, true, 8);
  await expect(page.locator('.hero')).toHaveAttribute('data-phase', /rupture|afterglow/);
  await gestureFrames(page, point, true, 110);
  await expect(page.locator('.hero')).toHaveAttribute('data-phase', /ambient|detection/);
});

test('published npm gestures activate the same hero and product controls as the mouse', async ({ page, context }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer', 'webgl-worker');
  await startReplay(page);
  expect(await page.evaluate(() => (window as any).__replayPackage)).toEqual({ name: 'air-cursor', version: '2.0.0', source: 'npm' });
  await gestureClick(page, '#language-toggle');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await gestureClick(page, '#language-toggle');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await gestureClick(page, '#copy');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('npm install air-cursor');
  await gestureClick(page, '#galaxy-pause');
  await expect(page.locator('#galaxy-pause')).toHaveAttribute('aria-pressed', 'true');
  await gestureClick(page, '#galaxy-pause');
  await expect(page.locator('#galaxy-pause')).toHaveAttribute('aria-pressed', 'false');
  await gestureClick(page, '#try-target');
  await expect(page.locator('#try-result')).toHaveAttribute('data-clicks', '1');
  await expect(page.locator('#try-result')).toHaveAttribute('data-input', 'hand');
  await gestureClick(page, '#t-div');
  await expect(page.locator('#c-div')).toHaveText('1');
  await gestureClick(page, '[data-copy-install]');
  await expect(page.locator('#install-feedback')).toHaveText('Install command copied');
  await gestureClick(page, '#copy-citation');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('@software{ishikawa2026aircursor');
  // Observe activation without following an external site during the test.
  await page.evaluate(() => {
    document.querySelector('a.npm-cta')!.addEventListener('click', event => { event.preventDefault(); (window as any).__npmActivated = true; });
  });
  await gestureClick(page, '.hero a.npm-cta');
  expect(await page.evaluate(() => (window as any).__npmActivated)).toBe(true);
  await gestureClick(page, '#cast');
  await expect(page.locator('body')).not.toHaveClass(/tracking/);
  expect(errors).toEqual([]);
});

test('worker doubles lights while leaving the main thread available for input', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer', 'webgl-worker');
  await expect(page.locator('.hero')).toHaveAttribute('data-particles', '14036');
  // Exclude one-time shader compilation and allow the quality controller to
  // settle. Measure steady-state interaction, retaining the raw p95 in output.
  await page.waitForTimeout(3000);
  const stats = await page.evaluate(async () => {
    const gaps: number[] = [];
    let last = performance.now();
    const stop = last + 3000;
    await new Promise<void>(resolve => {
      function frame(now: number) { gaps.push(now - last); last = now; if (now < stop) requestAnimationFrame(frame); else resolve(); }
      requestAnimationFrame(frame);
    });
    gaps.sort((a, b) => a - b);
    return { median: gaps[Math.floor(gaps.length / 2)], p95: gaps[Math.floor(gaps.length * .95)], frames: gaps.length };
  });
  const report = testInfo.outputPath('main-thread-frame-gaps.json');
  await writeFile(report, JSON.stringify(stats, null, 2));
  await testInfo.attach('main-thread-frame-gaps.json', { path: report, contentType: 'application/json' });
  // A regression guard on this machine, not a device-independent FPS claim.
  expect(stats.median).toBeLessThan(40);
  await page.locator('#experience').scrollIntoViewIfNeeded();
  const phase = await page.locator('.hero').getAttribute('data-phase');
  await page.waitForTimeout(300);
  await expect(page.locator('.hero')).toHaveAttribute('data-phase', phase!);
});
