// Renders PNG variants of the brand SVGs with the pre-installed Chromium.
// Usage: node brand/render.mjs   (from the repo root)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(dir, "png");
mkdirSync(out, { recursive: true });
const font = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&display=block">';
const jobs = [
  ["renewly-mark.svg", [16, 32, 180, 192, 512, 1024], 1, null],
  ["renewly-logo-light.svg", [520, 1040], 260 / 64, "#ffffff"],
  ["renewly-logo-dark.svg", [520, 1040], 260 / 64, "#0f172a"],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, widths, ratio, bg] of jobs) {
  const svg = readFileSync(path.join(dir, file), "utf8");
  for (const w of widths) {
    const h = Math.round(w / ratio);
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><head>${font}<style>html,body{margin:0;background:${bg ?? "transparent"}}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const name = file.replace(".svg", `-${w}.png`);
    await page.screenshot({ path: path.join(out, name), omitBackground: !bg });
  }
}
await browser.close();
console.log("PNG written to", out);
