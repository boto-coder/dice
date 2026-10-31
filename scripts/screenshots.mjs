// Captures milestone screenshots of the running app (desktop + mobile).
// Usage: node scripts/screenshots.mjs <label> [baseUrl]
//   e.g. node scripts/screenshots.mjs m3 http://127.0.0.1:5173
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const label = process.argv[2] ?? 'snapshot';
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:5173';
const outDir = new URL('../docs/screenshots/', import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const targets = [
  { name: 'desktop', context: { viewport: { width: 1280, height: 860 } } },
  { name: 'mobile', context: devices['Pixel 7'] },
];

for (const { name, context } of targets) {
  const page = await (await browser.newContext(context)).newPage();
  await page.goto(baseUrl);
  await page.waitForSelector('canvas');
  const file = (step) => new URL(`${label}-${name}-${step}.png`, outDir).pathname;

  await page.screenshot({ path: file('1-initial') });

  const roll = page.getByRole('button', { name: /^Roll/ });
  await roll.click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: file('2-rolling') });

  await page
    .getByRole('status')
    .filter({ hasText: /Total|:/ })
    .waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  await page.screenshot({ path: file('3-result') });
  console.log(`${name}: ${await page.getByRole('status').textContent()}`);
}

await browser.close();
console.log(`Saved to ${outDir.pathname}`);
