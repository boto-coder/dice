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

test('has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
