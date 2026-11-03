// Captures milestone screenshots of the running app (desktop + mobile).
// Usage: node scripts/screenshots.mjs <label> [baseUrl] [dice] [--custom Name=f1|f2|…]…
//   e.g. node scripts/screenshots.mjs m6 http://127.0.0.1:9119 Combat,Combat,d6 \
//          --custom 'Combat=⚔️|⚔️|🛡️|🛡️|💀|'
// `dice` is a comma-separated list of dice (standard or custom names) to add
// to the tray before rolling. Each --custom seeds a saved custom die.
// Steps: 1-initial, 2-tray (dice added), 3-rolling, 4-result (full page);
// with custom dice also 5-manager and 6-editor.
// --theme dark|light|system seeds the saved theme (the app's default is dark).
// --looks gives each die type (and the custom dice) a different preset look,
// and adds 7-appearance (the Dice appearance dialog).
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const custom = [];
for (let i = args.indexOf('--custom'); i >= 0; i = args.indexOf('--custom')) {
  const [name, faces = ''] = args[i + 1].split('=');
  custom.push({ id: `custom-shot-${custom.length}`, name, faces: faces.split('|') });
  args.splice(i, 2);
}
let theme = null;
const themeAt = args.indexOf('--theme');
if (themeAt >= 0) {
  theme = args[themeAt + 1];
  args.splice(themeAt, 2);
}
const looksAt = args.indexOf('--looks');
const looks = looksAt >= 0;
if (looks) args.splice(looksAt, 1);
const look = (body, accent, pattern, finish) => ({ body, accent, label: 'auto', pattern, finish });
const LOOKS = {
  d4: look('#4b2a85', '#7a52c0', 'stripes', 'glossy'),
  d6: look('#8e1428', '#e07a8c', 'marble', 'glossy'),
  d8: look('#0b4f6c', '#8fdcf5', 'speckled', 'matte'),
  d10: look('#1e5e3f', '#2f8a5c', 'swirl', 'glossy'),
  d12: look('#17171c', '#4a4a5c', 'marble', 'glossy'),
  d20: look('#d4a73a', '#fff0b3', 'gradient', 'metallic'),
};
if (looks) for (const die of custom) die.style = look('#0b4f6c', '#8fdcf5', 'speckled', 'matte');
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
    const stored = JSON.stringify({ version: 2, dice: custom });
    await page.addInitScript((value) => {
      localStorage.setItem('dice-roller:custom-dice', value);
    }, stored);
  }
  if (theme || looks) {
    await page.addInitScript(
      (value) => {
        localStorage.setItem('dice-roller:settings', value);
      },
      JSON.stringify({ version: 1, theme: theme ?? 'dark', dice: looks ? LOOKS : {} }),
    );
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
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }

  if (looks) {
    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('dialog', { name: 'Dice appearance' }).locator('canvas').waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: file('7-appearance') });
  }
}

await browser.close();
console.log(`Saved to ${outDir.pathname}`);
