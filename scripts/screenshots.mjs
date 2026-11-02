// Captures milestone screenshots of the running app (desktop + mobile).
// Usage: node scripts/screenshots.mjs <label> [baseUrl] [dice] [--custom Name=f1|f2|…]…
//   e.g. node scripts/screenshots.mjs m6 http://127.0.0.1:9119 Combat,Combat,d6 \
//          --custom 'Combat=⚔️|⚔️|🛡️|🛡️|💀|'
// `dice` is a comma-separated list of dice (standard or custom names) to add
// to the tray before rolling. Each --custom seeds a saved custom die.
// Steps: 1-initial, 2-tray (dice added), 3-rolling, 4-result (full page);
// with custom dice also 5-manager and 6-editor.
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const custom = [];
for (let i = args.indexOf('--custom'); i >= 0; i = args.indexOf('--custom')) {
  const [name, faces = ''] = args[i + 1].split('=');
  custom.push({ id: `custom-shot-${custom.length}`, name, faces: faces.split('|') });
  args.splice(i, 2);
}
const label = args[0] ?? 'snapshot';
const baseUrl = args[1] ?? 'http://127.0.0.1:5173';
const dice = (args[2] ?? 'd20,d6,d6').split(',').filter(Boolean);
const outDir = new URL('../docs/screenshots/', import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const targets = [
  { name: 'desktop', context: { viewport: { width: 1280, height: 860 } } },
  { name: 'mobile', context: devices['Pixel 7'] },
];

for (const { name, context } of targets) {
  const page = await (await browser.newContext(context)).newPage();
  if (custom.length > 0) {
    const stored = JSON.stringify({ version: 1, dice: custom });
    await page.addInitScript((value) => {
      localStorage.setItem('dice-roller:custom-dice', value);
    }, stored);
  }
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
  if ((await history.getAttribute('open')) === null) await history.locator('summary').click();
  await page.screenshot({ path: file('4-result'), fullPage: true });
  console.log(`${name}: ${await page.getByRole('status').textContent()}`);

  if (custom.length > 0) {
    await page.getByRole('button', { name: 'Manage' }).click();
    const dialog = page.getByRole('dialog', { name: 'Custom dice' });
    await page.screenshot({ path: file('5-manager') });
    await dialog.getByRole('button', { name: `Edit ${custom[0].name}` }).click();
    await page.screenshot({ path: file('6-editor') });
  }
}

await browser.close();
console.log(`Saved to ${outDir.pathname}`);
