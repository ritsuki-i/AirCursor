import { test, expect } from '@playwright/test';

test('production galaxy, languages, resources and demo controls', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 650 });
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer', 'webgl-worker');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.hero h1')).toHaveText('Move your hand.Move the Web.');
  await expect(page.locator('.hero-translation')).toBeHidden();
  expect(await page.evaluate(() => {
    const hero = document.querySelector('.hero')!.getBoundingClientRect();
    const selectors = ['.topbar', '.hero-content', '.gesture-guide', '.hero-foot'];
    const content = document.querySelector('.hero-content')!.getBoundingClientRect();
    const scroll = document.querySelector('.hero-foot > a')!.getBoundingClientRect();
    const guide = document.querySelector('.gesture-guide')!.getBoundingClientRect();
    const pause = document.querySelector('#galaxy-pause')!.getBoundingClientRect();
    return Math.abs(hero.height - innerHeight) < 1
      && content.bottom + 8 <= scroll.top
      && guide.top < pause.top
      && selectors.every(selector => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    });
  })).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://ritsuki-i.github.io/AirCursor/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://ritsuki-i.github.io/AirCursor/assets/og-image.png');
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1734');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '907');
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', 'https://ritsuki-i.github.io/AirCursor/assets/og-image.png');
  await page.locator('#galaxy-pause').click();
  await expect(page.locator('#galaxy-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.hero')).toHaveAttribute('data-phase', /ambient|detection/);
  await expect(page.locator('.hero-copy')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/production-hero.png' });
  await page.screenshot({ path: 'test-results/production-desktop.png', fullPage: true });
  await page.locator('#language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('.hero h1')).toHaveText('Move your hand.Move the Web.');
  await expect(page.locator('.hero-translation')).toBeVisible();
  await expect(page.locator('#quickstart')).toContainText('カメラを開始');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await page.locator('#language-toggle').click();
  await page.locator('#copy').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('npm install air-cursor');
  await page.locator('#copy-citation').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('@software{ishikawa2026aircursor');
  await page.locator('#t-div').click();
  await expect(page.locator('#c-div')).toHaveText('1');
  await page.locator('#t-hover').hover();
  await expect(page.locator('#t-hover')).toHaveClass(/lit/);
  await expect(page.locator('footer a[href="https://www.npmjs.com/package/air-cursor"]')).toBeVisible();
  await page.locator('#galaxy-pause').scrollIntoViewIfNeeded();
  await page.locator('#galaxy-pause').click();
  await expect(page.locator('#galaxy-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#galaxy-pause').click();
  await expect(page.locator('#galaxy-pause')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('mobile layout, reduced motion and blocked storage', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer', 'webgl-worker');
  await expect(page.locator('#galaxy-play')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/production-mobile.png' });
  await page.locator('#language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('.hero h1')).toBeVisible();
  await expect(page.locator('.hero h1')).toHaveText('Move your hand.Move the Web.');
  await expect(page.locator('.hero-translation')).toBeVisible();
  expect(await page.evaluate(() => {
    const hero = document.querySelector('.hero')!.getBoundingClientRect();
    const selectors = ['.topbar', '.hero-content', '.gesture-guide', '.hero-foot'];
    const content = document.querySelector('.hero-content')!.getBoundingClientRect();
    const scroll = document.querySelector('.hero-foot > a')!.getBoundingClientRect();
    const guide = document.querySelector('.gesture-guide')!.getBoundingClientRect();
    const pause = document.querySelector('#galaxy-pause')!.getBoundingClientRect();
    return Math.abs(hero.height - innerHeight) < 1
      && content.bottom + 8 <= scroll.top
      && guide.top < pause.top
      && selectors.every(selector => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    });
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/production-mobile-ja.png' });
});

test('Canvas fallback remains usable without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', { value: undefined });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === 'webgl') return null;
      return original.call(this, kind, ...args);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveAttribute('data-renderer', 'canvas-2d');
  await expect(page.locator('.galaxy-fallback')).toBeVisible();
  await page.locator('#galaxy-pause').click();
  await page.screenshot({ path: 'test-results/production-fallback.png' });
});
