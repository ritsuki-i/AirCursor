import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

test('studio generates a working customized published React component', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/studio.html');
  await page.locator('#selected').selectOption('button');
  await page.locator('#element-text').fill('始めよう');
  await page.locator('#color').fill('#123456');
  await page.locator('#x').fill('20');
  await expect(page.locator('[data-element="button"] button')).toHaveText('始めよう');
  await page.locator('[data-tab="text"]').click();
  await page.locator('#label-dialogTitle').fill('操作ガイド');
  await page.locator('#view-dialog').click();
  await expect(page.locator('#pv-dialogTitle')).toHaveText('操作ガイド');
  await page.locator('[data-tab="settings"]').click();
  await page.locator('#dominantHand').selectOption('left');
  await page.locator('#inferenceFps').fill('24');
  await page.locator('#copy').click();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code).toContain('"dominantHand": "left"');
  expect(code).toContain('"inferenceFps": 24');
  const bundle = await build({ stdin: { contents: `${code}\nimport { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render(<AirCursorUI />);`, resolveDir: path.resolve('../site'), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } });
  const resultPage = await context.newPage();
  await resultPage.goto('/studio.html');
  await resultPage.setContent('<div id="root"></div>');
  await resultPage.addScriptTag({ content: bundle.outputFiles[0].text });
  const button = resultPage.locator('.aircursor-builder .aircursor-btn');
  await expect(button).toHaveText('始めよう');
  await expect(button).toHaveCSS('color', 'rgb(18, 52, 86)');
  await expect(resultPage.locator('.aircursor-builder > div')).toHaveAttribute('style', /left: 20%/);
  await button.click();
  await expect(resultPage.locator('.aircursor-dialog h2')).toHaveText('操作ガイド');
  expect(errors).toEqual([]);
});

test('studio supports small screens and resetting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio.html');
  await page.locator('#element-text').fill('変更');
  await expect(page.locator('[data-element="title"]')).toHaveText('変更');
  await page.locator('#reset').click();
  await expect(page.locator('[data-element="title"]')).toContainText('Webをもっと自由に');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
