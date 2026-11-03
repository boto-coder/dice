import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SIDES: Record<string, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };

async function add(page: Page, die: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.getByRole('button', { name: `Add ${die} to tray` }).click();
  }
}

/** Waits for the roll to finish and returns the announced values per die, in order. */
async function rollResult(page: Page, timeout = 10_000) {
  const status = page.getByRole('status');
  await expect(status).toHaveText(/Total: \d+\.$/, { timeout });
  const text = (await status.textContent())!;
  const values = [...text.matchAll(/(d\d+): (\d+)/g)].map((m) => ({
    die: m[1]!,
    value: Number(m[2]),
  }));
  const total = Number(/Total: (\d+)\.$/.exec(text)![1]);
  return { values, total };
}

function expectValid({ values, total }: Awaited<ReturnType<typeof rollResult>>) {
  for (const { die, value } of values) {
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(SIDES[die]!);
  }
  expect(total).toBe(values.reduce((sum, v) => sum + v.value, 0));
}

test('loads the app shell', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Dice Roller');
  await expect(page.getByRole('heading', { level: 1, name: 'Dice Roller' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dice table' }).locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Roll', exact: true })).toBeDisabled();
});

test('builds a group in the tray, rolls it, and rolls it again', async ({ page }) => {
  await page.goto('./');
  await add(page, 'd6', 2);
  await add(page, 'd10');
  const tray = page.getByRole('region', { name: 'Tray' });
  await expect(tray).toContainText('3 / 20: 2 × d6 + 1 × d10');

  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  const first = await rollResult(page);
  expect(first.values.map((v) => v.die)).toEqual(['d6', 'd6', 'd10']);
  expectValid(first);
  await expect(page.getByRole('region', { name: 'Results' }).locator('.die-result')).toHaveCount(3);
  await expect(page.locator('.results__total-value')).toHaveText(String(first.total));

  // Change the tray, then Roll again still throws the previous group.
  await tray.getByRole('button', { name: 'Remove d10 from tray' }).click();
  await page.getByRole('button', { name: 'Roll again' }).click();
  await expect(page.getByRole('status')).toHaveText('Rolling…');
  const second = await rollResult(page);
  expect(second.values.map((v) => v.die)).toEqual(['d6', 'd6', 'd10']);
  expectValid(second);

  // Both rolls are in the history, newest first.
  const history = page.locator('details.history');
  if ((await history.getAttribute('open')) === null) await history.locator('summary').click();
  await expect(history.locator('.history__entry')).toHaveCount(2);
  await expect(history.locator('.history__entry').first()).toBeVisible();
  await expect(history.locator('.history__entry').first()).toContainText(`Total ${second.total}`);
});

test('rolls every die shape at once', async ({ page }) => {
  await page.goto('./');
  for (const die of Object.keys(SIDES)) await add(page, die);
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  const result = await rollResult(page, 15_000);
  expect(result.values.map((v) => v.die)).toEqual(Object.keys(SIDES));
  expectValid(result);
});

test('rolls a full tray of 20 dice', async ({ page }) => {
  await page.goto('./');
  await add(page, 'd6', 20);
  await expect(page.getByRole('button', { name: 'Add d6 to tray' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Tray' })).toContainText('The tray is full');
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  const result = await rollResult(page, 15_000);
  expect(result.values).toHaveLength(20);
  expectValid(result);
});

test('can be used with the keyboard only', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add d8 to tray' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Tray' })).toContainText('2 × d8');
  await page.getByRole('button', { name: 'Roll', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Roll', exact: true })).toBeFocused();
  expectValid(await rollResult(page));
});

test('has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('./');
  await add(page, 'd20');
  await add(page, 'd6');
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await rollResult(page);
  const history = page.locator('details.history');
  if ((await history.getAttribute('open')) === null) await history.locator('summary').click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('keeps the controls under the table when the history is long', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 900, 'only the desktop layout has a side column');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await add(page, 'd6');
  const history = page.locator('details.history');
  if ((await history.getAttribute('open')) === null) await history.locator('summary').click();
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  for (let i = 1; i < 20; i++) {
    await expect(page.locator('.history__entry')).toHaveCount(i);
    await page.getByRole('button', { name: 'Roll again' }).click();
  }
  await expect(page.locator('.history__entry')).toHaveCount(20);

  const table = (await page.getByRole('region', { name: 'Dice table' }).boundingBox())!;
  const dice = (await page.getByRole('region', { name: 'Dice', exact: true }).boundingBox())!;
  expect(dice.y - (table.y + table.height)).toBeLessThan(40);
});
