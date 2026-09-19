import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const output = "test-results/reference";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => console.error(error));
  await page.goto("http://127.0.0.1:3100/", { waitUntil: "networkidle" });
  const pause = () => page.evaluate(() => document.querySelector('[aria-label="Pause animation"]').click());
  const resume = () => page.evaluate(() => document.querySelector('[aria-label="Resume animation"]').click());
  const shot = name => page.locator(".hero").screenshot({ path: `${output}/${name}.png` });
  await page.waitForTimeout(700);
  await pause(); await shot("01-ambient");
  await resume(); await page.mouse.move(1010, 535); await page.waitForTimeout(500);
  await pause(); await shot("02-detection");
  await page.getByRole("button", { name: "Play the experience" }).click();
  await page.waitForFunction(() => document.querySelector(".gravity-field").dataset.phase === "attraction" && Number(document.querySelector(".gravity-field").dataset.elapsed) > .45);
  await pause(); await shot("03-attraction");
  await resume();
  await page.waitForFunction(() => document.querySelector(".gravity-field")?.dataset.phase === "compression");
  await page.waitForFunction(() => Number(document.querySelector(".gravity-field").dataset.elapsed) > .98);
  await pause(); await shot("04-compression");
  // Freeze the fully compressed core before explicitly releasing it.
  await page.evaluate(() => {
    const canvas = document.querySelector(".gravity-field");
    const observer = new MutationObserver(() => {
      if (canvas.dataset.phase === "silence") {
        document.querySelector('[aria-label="Pause animation"]').click();
        observer.disconnect();
      }
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ["data-phase"] });
  });
  await resume();
  await page.waitForFunction(() => document.querySelector(".gravity-field")?.dataset.phase === "silence");
  await shot("05-silence");
  await page.getByRole("button", { name: "Release the light" }).click();
  await resume();
  await page.waitForFunction(() => document.querySelector(".gravity-field")?.dataset.phase === "rupture");
  await page.waitForFunction(() => Number(document.querySelector(".gravity-field").dataset.elapsed) > .10);
  await pause(); await shot("06-rupture");
  await resume();
  await page.waitForFunction(() => document.querySelector(".gravity-field")?.dataset.phase === "afterglow");
  await page.waitForTimeout(700); await pause(); await shot("07-afterglow");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3100/", { waitUntil: "networkidle" });
  await pause(); await shot("08-mobile");
  console.log(`Saved the seven visual states and mobile composition to ${output}.`);
} finally { await browser.close(); }
