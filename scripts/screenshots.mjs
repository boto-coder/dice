// Captures milestone screenshots of the running app (desktop + mobile).
// Usage: node scripts/screenshots.mjs <label> [baseUrl] [buttonName]
//   e.g. node scripts/screenshots.mjs m4 http://127.0.0.1:9119 "Roll all"
// buttonName is the exact accessible name of the button to click
// (default: the first button whose name starts with "Roll").
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const label = process.argv[2] ?? 'snapshot';
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:5173';
const buttonName = process.argv[4] ? { name: process.argv[4], exact: true } : { name: /^Roll/ };
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

  const roll = page.getByRole('button', buttonName).first();
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
