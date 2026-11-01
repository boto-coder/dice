// Captures milestone screenshots of the running app (desktop + mobile).
// Usage: node scripts/screenshots.mjs <label> [baseUrl] [dice]
//   e.g. node scripts/screenshots.mjs m5 http://127.0.0.1:9119 d20,d6,d6,d10
// `dice` is a comma-separated list of dice to add to the tray before rolling.
// Steps: 1-initial, 2-tray (dice added), 3-rolling, 4-result (full page).
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const label = process.argv[2] ?? 'snapshot';
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:5173';
const dice = (process.argv[4] ?? 'd20,d6,d6').split(',').filter(Boolean);
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

  for (const die of dice) {
    await page.getByRole('button', { name: `Add ${die} to tray` }).click();
  }
  await page.screenshot({ path: file('2-tray') });

  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: file('3-rolling') });

  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, {
    timeout: 15_000,
  });
  const history = page.locator('details.history');
  if (!(await history.getAttribute('open'))) await history.locator('summary').click();
  await page.screenshot({ path: file('4-result'), fullPage: true });
  console.log(`${name}: ${await page.getByRole('status').textContent()}`);
}

await browser.close();
console.log(`Saved to ${outDir.pathname}`);
