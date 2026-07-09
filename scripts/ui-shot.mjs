import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath:
    ".pw-browsers/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5173/");
await page.waitForTimeout(2000);

await page.locator("#dock").screenshot({ path: "shots/panel-dark-panels.png" });
await page.screenshot({ path: "shots/panel-dark-full.png" });

await page.click('.dock-tab[data-tab="controls"]');
await page.waitForTimeout(400);
await page.locator("#dock").screenshot({ path: "shots/panel-dark-controls.png" });

await page.evaluate(() => document.body.classList.add("light"));
await page.waitForTimeout(400);
await page.locator("#dock").screenshot({ path: "shots/panel-light-controls.png" });

await page.click('.dock-tab[data-tab="panels"]');
await page.waitForTimeout(400);
await page.locator("#dock").screenshot({ path: "shots/panel-light-panels.png" });

await browser.close();
