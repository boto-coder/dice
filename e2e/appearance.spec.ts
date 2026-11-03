import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const appearance = (page: Page) => page.getByRole('dialog', { name: 'Dice appearance' });

async function rolled(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Total/, { timeout: 10_000 });
}

test('gives the d20 a look that is kept after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Appearance' }).click();
  const dialog = appearance(page);
  await expect(dialog.getByLabel('Die')).toHaveValue('d20');
  // The 3D preview draws into its own canvas.
  await expect(dialog.locator('.style-editor__preview canvas')).toBeVisible();
  await dialog.getByRole('button', { name: 'Ruby marble' }).click();
  await expect(dialog.getByRole('button', { name: 'Ruby marble' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Appearance' })).toBeFocused();

  await page.getByRole('button', { name: 'Add d20 to tray' }).click();
  await rolled(page);

  await page.reload();
  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect(appearance(page).getByLabel('Pattern')).toHaveValue('marble');
  await expect(appearance(page).getByRole('button', { name: 'Ruby marble' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Other dice keep the default look.
  await appearance(page).getByLabel('Die').selectOption('d6');
  await expect(
    appearance(page).getByRole('button', { name: 'Ivory', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('gives a custom die its own look', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Manage' }).click();
  const manager = page.getByRole('dialog', { name: 'Custom dice' });
  await manager.getByRole('button', { name: 'New custom die' }).click();
  await manager.getByLabel('Name').fill('Coin');
  await manager.getByLabel('Number of faces').selectOption('4');
  for (const [i, face] of ['H', 'T', 'H', 'T'].entries()) {
    await manager.getByLabel(`Face ${i + 1}`, { exact: true }).fill(face);
  }
  const look = manager.getByRole('group', { name: 'Look' });
  await look.getByRole('button', { name: 'Gold' }).click();
  await manager.getByRole('button', { name: 'Save' }).click();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Add Coin to tray' }).click();
  await page.getByRole('button', { name: 'Add d6 to tray' }).click();
  await rolled(page);

  await page.reload();
  await page.getByRole('button', { name: 'Appearance' }).click();
  await appearance(page).getByLabel('Die').selectOption({ label: 'Coin' });
  await expect(appearance(page).getByRole('button', { name: 'Gold' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    appearance(page).getByRole('button', { name: 'Use this look for all standard dice' }),
  ).toBeHidden();
});

test('the appearance dialog has no accessibility violations', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect(appearance(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(results.violations).toEqual([]);
});

test('Escape closes the appearance dialog', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.keyboard.press('Escape');
  await expect(appearance(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Appearance' })).toBeFocused();
});
