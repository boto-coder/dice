import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('loads the app shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Dice Roller');
  await expect(page.getByRole('heading', { level: 1, name: 'Dice Roller' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dice table' }).locator('canvas')).toBeVisible();
});

test('rolls a 3D d6 and shows the result', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Roll d6' });
  await button.click();
  await expect(page.getByRole('status')).toHaveText(/^d6: [1-6]\. Total: [1-6]\.$/, {
    timeout: 10_000,
  });
  await expect(button).toBeEnabled();

  // Rolling again works and still yields a valid result.
  await button.click();
  await expect(page.getByRole('status')).toHaveText(/^d6: [1-6]\. Total: [1-6]\.$/, {
    timeout: 10_000,
  });
});

test('rolls every die shape at once and shows a valid result for each', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Roll all' }).click();
  const status = page.getByRole('status');
  await expect(status).toHaveText(/Total: \d+\.$/, { timeout: 15_000 });
  const text = (await status.textContent())!;
  const values: Record<string, number> = Object.fromEntries(
    [...text.matchAll(/(d\d+): (\d+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  const sides = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };
  for (const [die, max] of Object.entries(sides)) {
    expect(values[die]).toBeGreaterThanOrEqual(1);
    expect(values[die]).toBeLessThanOrEqual(max);
  }
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  expect(text).toContain(`Total: ${total}.`);
});

test('has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
