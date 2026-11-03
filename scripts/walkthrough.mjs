// Captures walkthrough screenshots of states the milestone screenshots don't show.
// Usage: node scripts/walkthrough.mjs [baseUrl] [previewUrl]
//   baseUrl: the dev server (default http://127.0.0.1:9119).
//   previewUrl: a production preview (npm run build && npm run preview), used for
//   the offline shot because the service worker only runs in production.
//   Without it the offline shot is skipped.
// Saves docs/screenshots/walk-*.png.
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:9119';
const previewUrl = process.argv[3];
const outDir = new URL('../docs/screenshots/', import.meta.url);
await mkdir(outDir, { recursive: true });
const file = (name) => new URL(`walk-${name}.png`, outDir).pathname;

const CUSTOM = [
  { id: 'walk-combat', name: 'Combat', faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''] },
  { id: 'walk-pips', name: 'Pips', faces: ['1', '1', '2', '3'] },
  { id: 'walk-weather', name: 'Weather', faces: ['☀️', '☀️', '⛅', '🌧️', '⛈️', '❄️', '🌫️', '🌈'] },
];
const DESKTOP = { viewport: { width: 1280, height: 860 } };

const browser = await chromium.launch();

async function open(context, url = baseUrl) {
  const ctx = await browser.newContext(context);
  const page = await ctx.newPage();
  await page.addInitScript(
    (value) => {
      if (!localStorage.getItem('dice-roller:custom-dice')) {
        localStorage.setItem('dice-roller:custom-dice', value);
      }
    },
    JSON.stringify({ version: 1, dice: CUSTOM }),
  );
  await page.goto(url);
  await page.waitForSelector('canvas');
  return { ctx, page };
}

const add = (page, die) => page.getByRole('button', { name: `Add ${die} to tray` }).click();

async function roll(page, name = 'Roll') {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, {
    timeout: 15_000,
  });
  return (await page.getByRole('status').textContent()) ?? '';
}

async function openHistory(page) {
  const history = page.locator('details.history');
  if ((await history.getAttribute('open')) === null) await history.locator('summary').click();
}

// 1. Mobile, as it looks without scrolling, after adding a few dice.
{
  const { ctx, page } = await open(devices['Pixel 7']);
  for (const die of ['d20', 'd8', 'Combat']) await add(page, die);
  await page.screenshot({ path: file('mobile-viewport-tray') });
  await roll(page);
  await page.screenshot({ path: file('mobile-viewport-result') });
  await ctx.close();
}

// 2. A full tray: 20 dice, the add buttons are unavailable.
{
  const { ctx, page } = await open(DESKTOP);
  const mix = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'Combat', 'Pips', 'Weather'];
  for (let i = 0; i < 20; i++) await add(page, mix[i % mix.length]);
  await page.screenshot({ path: file('desktop-tray-full'), fullPage: true });
  console.log('full tray:', await roll(page));
  await page.screenshot({ path: file('desktop-tray-full-result'), fullPage: true });
  await ctx.close();
}

// 3. Crits and history: a d20 + Weather rolled until both a natural 20 and a
// natural 1 have come up. Reduced motion settles at once, which keeps this quick.
{
  const { ctx, page } = await open({ ...DESKTOP, reducedMotion: 'reduce' });
  await add(page, 'd20');
  await add(page, 'Weather');
  await openHistory(page);
  const seen = new Set();
  let text = await roll(page);
  for (let i = 0; i < 200 && seen.size < 2; i++) {
    for (const kind of ['critical success', 'critical failure']) {
      if (text.includes(kind) && !seen.has(kind)) {
        seen.add(kind);
        const name = kind === 'critical success' ? 'nat20' : 'nat1';
        // Clicking Roll again scrolls the page once the history makes it taller.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: file(`desktop-${name}`) });
        console.log(`${name} after ${i + 1} rolls: ${text}`);
      }
    }
    if (seen.size < 2) text = await roll(page, 'Roll again');
  }
  // Fill the history to its 20-entry limit.
  while ((await page.locator('.history__entry').count()) < 20) await roll(page, 'Roll again');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: file('desktop-history'), fullPage: true });
  await ctx.close();
}

// 4. The custom dice editor: validation errors and the delete confirmation.
{
  const { ctx, page } = await open(DESKTOP);
  await page.getByRole('button', { name: 'Manage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Custom dice' });
  await dialog.getByRole('button', { name: 'New custom die' }).click();
  await dialog.getByLabel('Name').fill('Combat');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.screenshot({ path: file('desktop-editor-errors') });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.getByRole('button', { name: 'Delete Pips' }).click();
  await page.screenshot({ path: file('desktop-delete-confirm') });
  await ctx.close();
}

// 5. Keyboard: the focus ring while tabbing through the dice buttons.
{
  const { ctx, page } = await open(DESKTOP);
  await page.getByRole('button', { name: 'Add d4 to tray' }).focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.screenshot({ path: file('desktop-keyboard-focus') });
  await ctx.close();
}

// 6. Offline: after one visit, the production build loads and rolls with no network.
if (previewUrl) {
  const { ctx, page } = await open(devices['Pixel 7'], previewUrl);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('canvas');
  await add(page, 'd20');
  await add(page, 'Weather');
  console.log('offline:', await roll(page));
  await page.screenshot({ path: file('mobile-offline') });
  await ctx.close();
} else {
  console.log('No preview URL given: skipping the offline shot.');
}

await browser.close();
console.log(`Saved to ${outDir.pathname}`);
