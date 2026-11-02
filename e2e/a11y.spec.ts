import { test, expect, type Page } from '@playwright/test';

/** Accessible-ish name of the focused element: aria-label, else its text. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '';
  });

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the settled dice at once instead of animating the throw', async ({ page }) => {
    await page.goto('/');
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Add d6 to tray' }).click();
    const start = Date.now();
    await page.getByRole('button', { name: 'Roll', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(/Total: \d+\.$/, { timeout: 5_000 });
    // An animated roll of 10 dice takes seconds; settling at once is far quicker.
    expect(Date.now() - start).toBeLessThan(1_500);
    expect(await page.getByRole('status').textContent()).toMatch(/^(d6: [1-6], ){9}d6: [1-6]\./);
  });
});

test('every control can be reached with Tab, in a sensible order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add d4 to tray' }).click();
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Total/, { timeout: 10_000 });
  const history = page.locator('details.history');
  if ((await history.getAttribute('open')) === null) await history.locator('summary').click();

  // Start at the first control, then walk forward with Tab.
  await page.getByRole('button', { name: 'Add d4 to tray' }).focus();
  const names: string[] = [await focusedName(page)];
  for (let i = 0; i < 25; i++) {
    const before = await page.evaluateHandle(() => document.activeElement);
    await page.keyboard.press('Tab');
    // Past the last control, focus leaves the page for the browser UI: Chromium
    // then reports <body> as focused, Firefox keeps the last control.
    const left = await page.evaluate(
      (prev) => document.activeElement === document.body || document.activeElement === prev,
      before,
    );
    if (left) break;
    names.push(await focusedName(page));
  }
  expect(names).toEqual([
    'Add d4 to tray',
    'Add d6 to tray',
    'Add d8 to tray',
    'Add d10 to tray',
    'Add d12 to tray',
    'Add d20 to tray',
    'Add d100 to tray',
    'Manage',
    'Clear tray',
    'Remove d4 from tray',
    'Roll',
    'Roll again',
    expect.stringMatching(/^History/),
    'Clear history',
  ]);
});

test('shows a visible focus ring on keyboard focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).toBe('solid');
});

test('the custom dice dialog works from the keyboard and traps focus', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Custom dice' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'New custom die' })).toBeFocused();

  // Create a die with the keyboard only.
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await page.keyboard.type('Coin');
  await page.keyboard.press('Tab'); // face count
  await page.keyboard.press('Tab'); // face 1
  await page.keyboard.type('H');
  await page.keyboard.press('Tab');
  await page.keyboard.type('T');
  await page.keyboard.press('Enter'); // submits the form
  await expect(dialog.getByRole('button', { name: 'Edit Coin' })).toBeFocused();

  // Focus never reaches the page behind the modal dialog. (Chrome lets Tab
  // leave to the browser UI, where the document's activeElement is <body>.)
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const ok = await dialog.evaluate(
      (d) => document.activeElement === document.body || d.contains(document.activeElement),
    );
    expect(ok).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Manage' })).toBeFocused();
});

test('announces results in a polite live region', async ({ page }) => {
  await page.goto('/');
  const status = page.getByRole('status');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await page.getByRole('button', { name: 'Add d8 to tray' }).click();
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(status).toHaveText('Rolling…');
  await expect(status).toHaveText(/^d8: [1-8]\. Total: [1-8]\.$/, { timeout: 10_000 });
});
