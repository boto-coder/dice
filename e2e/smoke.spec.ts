import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('loads the app shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Dice Roller');
  await expect(page.getByRole('heading', { level: 1, name: 'Dice Roller' })).toBeVisible();
});

test('has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
