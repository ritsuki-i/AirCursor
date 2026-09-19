import { test, expect } from "@playwright/test";

test("desktop field, all seven phases, pause, install, and real demo controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "warning" && msg.text().includes("Gravity field")) errors.push(msg.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Move your hand.Move the Web.");
  await page.waitForTimeout(1500);
  await expect(page.locator(".gravity-field")).not.toHaveClass(/is-fallback/);
  await page.screenshot({ path: "test-results/desktop-ambient.png", fullPage: true });
  await page.locator(".hero").screenshot({ path: "test-results/hero-ambient.png" });
  await page.evaluate(() => {
    const phases: string[] = [];
    (window as unknown as { observedPhases: string[] }).observedPhases = phases;
    const canvas = document.querySelector<HTMLElement>(".gravity-field")!;
    new MutationObserver(() => { const phase = canvas.dataset.phase!; if (phases.at(-1) !== phase) phases.push(phase); }).observe(canvas, { attributes: true, attributeFilter: ["data-phase"] });
  });
  await page.getByRole("button", { name: "Play the experience" }).click();
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "attraction");
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "compression");
  await page.waitForTimeout(650);
  await page.locator(".hero").screenshot({ path: "test-results/hero-compression.png" });
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "silence");
  await page.waitForTimeout(1200);
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "silence");
  await page.getByRole("button", { name: "Release the light" }).click();
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "rupture");
  await page.locator(".hero").screenshot({ path: "test-results/hero-rupture.png" });
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "afterglow");
  await expect(page.getByRole("button", { name: "Play the experience" })).toBeEnabled({ timeout: 10000 });
  expect(await page.evaluate(() => (window as unknown as { observedPhases: string[] }).observedPhases)).toEqual(expect.arrayContaining(["attraction", "compression", "silence", "rupture", "afterglow"]));
  await page.getByRole("button", { name: "Pause animation" }).click();
  await expect(page.getByRole("button", { name: "Resume animation" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Resume animation" }).click();
  await page.getByRole("button", { name: "Transform composition" }).click();
  await expect(page.getByRole("heading", { name: "You’re part of it." })).toBeVisible();
  await page.getByRole("button", { name: /Interactive installations/ }).click();
  await expect(page.locator(".demo-wordmark")).toHaveText("forma®");
  await page.getByRole("button", { name: "pnpm", exact: true }).click();
  await expect(page.locator(".install-command code")).toHaveText("pnpm add air-cursor");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy install command" }).click();
  await expect(page.getByText("Command copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("pnpm add air-cursor");
  expect(errors).toEqual([]);
});

test("mobile, keyboard preview, navigation, and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Features" }).click();
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
  await page.locator("#experience").scrollIntoViewIfNeeded();
  const preview = page.getByRole("button", { name: "Play the experience" });
  await preview.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "attraction");
  await expect(preview).toBeEnabled({ timeout: 10000 });
});

test("camera denied preserves the complete mouse fallback", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => Promise.reject(new DOMException("Denied for test", "NotAllowedError")) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable hand tracking" }).click();
  await expect(page.locator(".camera-error")).toContainText("permission was declined", { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Enable hand tracking" })).toBeEnabled();
  await page.mouse.move(1000, 450); await page.mouse.down();
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "attraction");
  await page.mouse.up();
  expect(errors).toEqual([]);
});

test("unavailable WebGL still has a usable field and timeline", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === "webgl") return null;
      return original.apply(this, [kind, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.locator(".gravity-field")).toHaveClass(/is-fallback/);
  await page.getByRole("button", { name: "Play the experience" }).click();
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "attraction");
  await page.screenshot({ path: "test-results/fallback.png" });
  await expect(page.getByRole("button", { name: "Play the experience" })).toBeEnabled({ timeout: 10000 });
});

test("a camera permission response arriving after cancellation stops its tracks", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => new Promise(resolve => {
      (window as unknown as { resolveCamera: (stream: MediaStream) => void }).resolveCamera = resolve;
    }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable hand tracking" }).click();
  await page.waitForFunction(() => "resolveCamera" in window);
  await page.getByRole("button", { name: "Cancel camera" }).click();
  await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
    const stream = canvas.captureStream(1);
    const scope = window as unknown as { resolveCamera: (stream: MediaStream) => void; lateTrack: MediaStreamTrack };
    scope.lateTrack = stream.getVideoTracks()[0]; scope.resolveCamera(stream);
  });
  await page.waitForFunction(() => (window as unknown as { lateTrack: MediaStreamTrack }).lateTrack.readyState === "ended");
  await expect(page.locator(".tracking-video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enable hand tracking" })).toBeVisible();
});
