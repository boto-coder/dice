import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const COMBAT_FACES = ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''];

async function createDie(page: Page, name: string, faces: readonly string[]): Promise<void> {
  await page.getByRole('button', { name: 'Manage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Custom dice' });
  await dialog.getByRole('button', { name: 'New custom die' }).click();
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Number of faces').selectOption(String(faces.length));
  for (const [i, face] of faces.entries()) {
    await dialog.getByLabel(`Face ${i + 1}`, { exact: true }).fill(face);
  }
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('button', { name: `Edit ${name}` })).toBeVisible();
}

async function rollAndRead(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  const status = page.getByRole('status');
  await expect(status).not.toHaveText('Rolling…', { timeout: 10_000 });
  await expect(status).toHaveText(/\.$/);
  return (await status.textContent())!;
}

test('creates, rolls, keeps, edits, and deletes a custom die', async ({ page }) => {
  await page.goto('/');
  await createDie(page, 'Combat', COMBAT_FACES);
  const dialog = page.getByRole('dialog', { name: 'Custom dice' });
  await expect(dialog).toContainText('d6 · ⚔️ ⚔️ 🛡️ 🛡️ 💀 –');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Roll it together with a d6: only the d6 counts toward the total.
  await page.getByRole('button', { name: 'Add Combat to tray' }).click();
  await page.getByRole('button', { name: 'Add d6 to tray' }).click();
  const text = await rollAndRead(page);
  expect(text).toMatch(/^Combat: (⚔️|🛡️|💀|blank), d6: ([1-6])\. Total: \2\.$/u);

  // It survives a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add Combat to tray' })).toBeVisible();

  // Edit: make every face a skull, so the result is certain.
  await page.getByRole('button', { name: 'Manage' }).click();
  await dialog.getByRole('button', { name: 'Edit Combat' }).click();
  for (let i = 1; i <= 6; i++) await dialog.getByLabel(`Face ${i}`, { exact: true }).fill('💀');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Add Combat to tray' }).click();
  expect(await rollAndRead(page)).toBe('Combat: 💀.');

  // Delete it: it disappears from the bar and the tray, also after a reload.
  await page.getByRole('button', { name: 'Manage' }).click();
  await dialog.getByRole('button', { name: 'Delete Combat' }).click();
  await dialog.getByRole('button', { name: 'Yes, delete Combat' }).click();
  await expect(dialog).toContainText('No custom dice yet.');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Add Combat to tray' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Tray' })).toContainText('0 / 20');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add Combat to tray' })).toHaveCount(0);
});

test('rolls a custom number die on every custom shape, summing it', async ({ page }) => {
  await page.goto('/');
  // A d4-shaped die (read by its top corner) and a d20-shaped die with text.
  await createDie(page, 'Pips', ['1', '1', '2', '3']);
  await page.keyboard.press('Escape');
  await createDie(
    page,
    'Words',
    Array.from({ length: 20 }, (_, i) => (i % 2 ? 'Yes' : 'No')),
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add Pips to tray' }).click();
  await page.getByRole('button', { name: 'Add Words to tray' }).click();
  const text = await rollAndRead(page);
  expect(text).toMatch(/^Pips: ([123]), Words: (Yes|No)\. Total: \1\.$/);
});

test('shows validation errors in the editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Custom dice' });
  await dialog.getByRole('button', { name: 'New custom die' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await expect(dialog).toContainText('Name is required.');
  await expect(dialog).toContainText('At least one face must have a label.');
});

test('the custom dice dialog has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  await createDie(page, 'Combat', COMBAT_FACES);
  const dialog = page.getByRole('dialog', { name: 'Custom dice' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Edit Combat' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
