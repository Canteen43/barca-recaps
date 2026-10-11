// Renders app/icons/icon.svg to the PNG sizes the PWA manifest needs (uses the local Chrome via Playwright).
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const svg = await readFile("app/icons/icon.svg", "utf8");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();

async function render(size, file, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons need full-bleed background and content inside the central 80% safe zone.
  const inner = maskable ? svg.replace('rx="112"', 'rx="0"') : svg;
  const scale = maskable ? 0.8 : 1;
  await page.setContent(`<html><body style="margin:0;background:${maskable ? "#0b1020" : "transparent"};display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${size * scale}px;height:${size * scale}px">${inner.replace("<svg ", `<svg width="${size * scale}" height="${size * scale}" `)}</div></body></html>`);
  await page.screenshot({ path: file, omitBackground: !maskable });
  console.log("wrote", file);
}

await render(192, "app/icons/icon-192.png");
await render(512, "app/icons/icon-512.png");
await render(512, "app/icons/icon-maskable-512.png", { maskable: true });
await browser.close();
