// Renders the 1200x630 social sharing image to landing/public/brand/og.png.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = path.dirname(new URL(import.meta.url).pathname);
const mark = readFileSync(path.join(dir, "renewly-mark.svg"), "utf8");
const html = `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&family=Fraunces:opsz,wght@9..144,600&display=block">
<style>html,body{margin:0}body{width:1200px;height:630px;background:#0f172a;color:#fff;font-family:'DM Sans';display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;position:relative;overflow:hidden}
.m svg{width:96px;height:96px}h1{font:600 76px/1.05 Fraunces;margin:36px 0 18px;max-width:900px}p{font-size:30px;color:#93c5fd;margin:0}
.b{position:absolute;right:-120px;bottom:-160px;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,#1d4ed8 0,#1d4ed800 70%)}</style></head>
<body><div class="b"></div><div class="m">${mark}</div><h1>Never miss a license renewal.</h1><p>Renewly · Turks and Caicos accommodation &amp; business licences</p></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(dir, "..", "landing", "public", "brand", "og.png") });
await browser.close();
