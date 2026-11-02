// Renders the PNG app icons from public/icon.svg.
// Usage: node scripts/icons.mjs
//   any:      icon-192.png, icon-512.png (rounded square, as drawn)
//   maskable: icon-maskable-512.png, apple-touch-icon.png (full-bleed background,
//             die kept inside the central safe zone so platform masks don't clip it)
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);
const svg = await readFile(new URL('icon.svg', publicDir), 'utf8');

/** Full-bleed variant: square background, die scaled to 90% around the centre (its corners stay inside the 80% safe circle). */
const fullBleed = svg
  .replace('rx="112" ', '')
  .replace(
    /<rect x="112"[\s\S]*<\/g>/,
    (die) => `<g transform="translate(25.6 25.6) scale(0.9)">${die}</g>`,
  );

const outputs = [
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-512.png', size: 512, source: svg },
  { file: 'icon-maskable-512.png', size: 512, source: fullBleed },
  { file: 'apple-touch-icon.png', size: 180, source: fullBleed },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, source } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page
    .locator('svg')
    .screenshot({ path: new URL(file, publicDir).pathname, omitBackground: true });
  console.log(`wrote public/${file}`);
}
await browser.close();
