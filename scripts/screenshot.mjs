import { chromium } from "playwright";

const prefix = process.argv[2] ?? "shot";
const waitMs = Number(process.argv[3] ?? 2500);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text());
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(waitMs);
await page.screenshot({ path: `/tmp/${prefix}-wall.png` });

await page.evaluate(() => {
  const api = window.__lava;
  if (!api) return;

  const lamp = Math.floor(api.wall.cols * 2 + api.wall.cols / 2);
  window.dispatchEvent(new CustomEvent("lava-hero", { detail: lamp }));
});

const info = await page.evaluate(() => {
  const w = window.__lava?.wall;
  return w ? { cols: w.cols, rows: w.rows } : { cols: 16, rows: 6 };
});
const usableW = 1600 - 340;
const cellW = usableW / info.cols;
const cellH = 900 / info.rows;
const clickX = cellW * (Math.floor(info.cols / 2) + 0.5);
const clickY = cellH * (Math.floor(info.rows / 2) + 0.55);
await page.mouse.click(clickX, clickY);
await page.waitForTimeout(1800);
await page.screenshot({ path: `/tmp/${prefix}-hero.png` });

const digest = await page.locator(".digest").textContent();
console.log(`digest: ${digest?.slice(0, 24)}…`);
console.log(`saved /tmp/${prefix}-wall.png and /tmp/${prefix}-hero.png`);
await browser.close();
