// Checks the deployed app: it loads from the public URL, rolls, has a valid
// manifest with reachable icons, works offline after the first visit, and
// serves only the app (no repository files). Takes screenshots of it.
// Usage: node scripts/livecheck.mjs [url] [label]
//   defaults: https://boto-coder.github.io/dice/  m9-live
// Exits with status 1 if any check fails.
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'https://boto-coder.github.io/dice/';
const label = process.argv[3] ?? 'm9-live';
const outDir = new URL('../docs/screenshots/', import.meta.url);
await mkdir(outDir, { recursive: true });

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

const browser = await chromium.launch();
const targets = [
  { name: 'desktop', context: { viewport: { width: 1280, height: 860 } } },
  { name: 'mobile', context: devices['Pixel 7'] },
];

for (const { name, context } of targets) {
  console.log(`\n${name}`);
  const ctx = await browser.newContext(context);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const file = (step) => new URL(`${label}-${name}-${step}.png`, outDir).pathname;

  const response = await page.goto(url);
  const local = new URL(url).hostname === 'localhost';
  check(
    local ? 'loads (local, so HTTP is fine)' : 'loads over HTTPS',
    response?.ok() === true && (local || page.url().startsWith('https://')),
  );
  check('title', (await page.title()) === 'Dice Roller');
  await page.waitForSelector('canvas');
  await page.screenshot({ path: file('1-initial') });

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href, page.url()).href;
  const manifest = await (await ctx.request.get(manifestUrl)).json();
  check('manifest', manifest.name === 'Dice Roller' && manifest.display === 'standalone');
  const icons = await Promise.all(
    manifest.icons.map(async (i) => (await ctx.request.get(new URL(i.src, manifestUrl).href)).ok()),
  );
  check('manifest icons reachable', icons.every(Boolean), `${icons.length} icons`);

  for (const die of ['d20', 'd12', 'd8', 'd6', 'd4', 'd100']) {
    await page.getByRole('button', { name: `Add ${die} to tray` }).click();
  }
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: file('2-rolling') });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, {
    timeout: 15_000,
  });
  const status = (await page.getByRole('status').textContent()) ?? '';
  check('rolls', /Total: \d+\.$/.test(status), status);
  // Clicking Roll can scroll the page; the sticky Roll bar would then cover the
  // tray in a full-page capture.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: file('3-result'), fullPage: true });

  // The service worker installs on the first visit; then the app must load offline.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.scope,
  );
  check('service worker scope', scope === new URL('./', url).href, scope);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('canvas');
  await page.getByRole('button', { name: 'Add d20 to tray' }).click();
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, {
    timeout: 15_000,
  });
  const offline = (await page.getByRole('status').textContent()) ?? '';
  check('works offline', /^d20: \d+/.test(offline), offline);
  await page.screenshot({ path: file('4-offline') });
  await ctx.setOffline(false);

  check('no errors in the console', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Only the built app is published: repository files must not be served.
console.log('\nsite contents');
const ctx = await browser.newContext();
for (const path of [
  'README.md',
  'REQUIREMENTS.md',
  'package.json',
  'src/main.ts',
  '.entire/settings.json',
]) {
  const res = await ctx.request.get(new URL(path, url).href);
  // GitHub Pages answers 404; a local preview answers unknown paths with the app page.
  const appPage = (res.headers()['content-type'] ?? '').startsWith('text/html');
  check(`not published: ${path}`, res.status() === 404 || appPage, String(res.status()));
}
await browser.close();

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
