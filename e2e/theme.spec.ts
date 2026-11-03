import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const radio = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name });

test('is dark by default, even on a light device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  expect(await theme(page)).toBe('dark');
  await expect(radio(page, 'Dark')).toBeChecked();
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#0f1216');
});

test('the light theme has no detectable accessibility violations', async ({ page }) => {
  await page.goto('./');
  await radio(page, 'Light').check();
  await page.getByRole('button', { name: 'Add d20 to tray' }).click();
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Total/, { timeout: 10_000 });
  const history = page.locator('details.history');
  if ((await history.getAttribute('open')) === null) await history.locator('summary').click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('keeps the chosen theme after a reload, applied before the app starts', async ({ page }) => {
  // Record the theme when the HTML has been parsed but before the app's module runs.
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') {
        (window as unknown as { early?: string }).early = document.documentElement.dataset.theme;
      }
    });
  });
  await page.goto('./');
  await radio(page, 'Light').check();
  expect(await theme(page)).toBe('light');
  await page.reload();
  expect(await page.evaluate(() => (window as unknown as { early?: string }).early)).toBe('light');
  await expect(radio(page, 'Light')).toBeChecked();
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#f6f7f9');
});

test('System follows the device setting, also while open', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  await radio(page, 'System').check();
  expect(await theme(page)).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page)).toBe('dark');
  await page.reload();
  expect(await theme(page)).toBe('dark');
});

test('the switch works with the keyboard as one radio group', async ({ page }) => {
  await page.goto('./');
  await radio(page, 'Dark').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio(page, 'Light')).toBeChecked();
  await expect(radio(page, 'Light')).toBeFocused();
  expect(await theme(page)).toBe('light');
  // Tab leaves the group in one step, to the dice Appearance button.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Appearance' })).toBeFocused();
});
