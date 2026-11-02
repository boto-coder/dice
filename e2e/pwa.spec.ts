import { test, expect } from '@playwright/test';

test('has an installable web manifest with icons', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: 'Dice Roller', display: 'standalone', start_url: './' });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const res = await request.get(new URL(icon.src, new URL(href!, page.url())).href);
    expect(res.ok(), icon.src).toBe(true);
  }
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  // Wait until the service worker has installed (precached the app) and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Dice Roller' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dice table' }).locator('canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Add d20 to tray' }).click();
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    /^d20: \d+( \(critical \w+\))?\. Total: \d+\.$/,
    {
      timeout: 10_000,
    },
  );
  await context.setOffline(false);
});
