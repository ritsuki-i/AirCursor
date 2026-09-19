import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/production',
  timeout: 45_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8777', channel: 'chrome', headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'node ../scripts/serve-site.mjs', url: 'http://127.0.0.1:8777', reuseExistingServer: true },
});
