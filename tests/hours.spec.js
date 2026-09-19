// @ts-check
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.route(/script\.google\.com/, (route) => route.abort());
  await page.route('**/api/sync-sheets', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  );
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await expect(page.getByTestId('loading')).toBeHidden({ timeout: 15000 });
});

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

async function createRetainerProject(page, name, account, retainer) {
  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(name);
  await page.getByTestId('input-clientName').fill(name);
  await page.getByTestId('input-account').fill(account);
  await page.getByTestId('input-retainerHours').fill(String(retainer));
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();
}

async function logHours(page, site, task, hours, account) {
  await page.getByTestId('hours-site').fill(site);
  if (account) await page.getByTestId('hours-account').fill(account);
  await page.getByTestId('hours-task').fill(task);
  await page.getByTestId('hours-hours').fill(String(hours));
  await page.getByTestId('hours-add').click();
}

test('Hours tab is available', async ({ page }) => {
  await page.getByRole('button', { name: 'Hours', exact: true }).click();
  await expect(page.getByTestId('hours-tab')).toBeVisible();
  await expect(page.getByText('No hours logged for this month yet.')).toBeVisible();
});

test('validates required fields', async ({ page }) => {
  await page.getByRole('button', { name: 'Hours', exact: true }).click();
  await page.getByTestId('hours-add').click();
  await expect(page.getByTestId('hours-error')).toContainText('website');
});

test('logging hours on a retainer site picks up its account and shows hours left', async ({ page }) => {
  await createRetainerProject(page, 'Warneford', 'Bear', 10);
  await page.getByRole('button', { name: 'Hours', exact: true }).click();
  await expect(page.getByTestId('retainer-Warneford')).toContainText('10 h left of 10 h');
  await logHours(page, 'Warneford', 'Plugins, theme and WordPress update', 3);
  await expect(page.getByTestId('hours-account')).toHaveValue('Bear');
  await logHours(page, 'Warneford', 'Home page content updates', 2.5);
  await expect(page.getByTestId('hours-account-Bear')).toContainText('5.5 h');
  await expect(page.getByTestId('retainer-Warneford')).toContainText('4.5 h left of 10 h');
  await expect(page.getByTestId('hours-month-total')).toHaveText('5.5 h');
});

test('going over the retainer is flagged', async ({ page }) => {
  await createRetainerProject(page, 'Regent Property', 'Bear', 2);
  await page.getByRole('button', { name: 'Hours', exact: true }).click();
  await logHours(page, 'Regent Property', 'Audit report', 3);
  await expect(page.getByTestId('retainer-Regent Property')).toContainText('1 h over 2 h retainer');
});

test('ad-hoc sites are grouped by account and filterable', async ({ page }) => {
  await page.getByRole('button', { name: 'Hours', exact: true }).click();
  await logHours(page, 'Chadwell', 'Checkout page', 4, 'Bear');
  await logHours(page, 'Boulder Canyon', 'Mailchimp newsletter', 1, 'Shane Young');
  await expect(page.getByTestId('hours-account-Bear')).toBeVisible();
  await expect(page.getByTestId('hours-account-Shane Young')).toBeVisible();
  await page.getByTestId('hours-account-filter').selectOption('Shane Young');
  await expect(page.getByTestId('hours-account-Bear')).toBeHidden();
  await expect(page.getByTestId('hours-month-total')).toHaveText('1 h');
});

test('entries persist after reload and can be deleted', async ({ page }) => {
  await page.getByRole('button', { name: 'Hours', exact: true }).click();
  await logHours(page, 'GymCraft London', 'Hero image to video', 0.5, 'Bear');
  await page.evaluate(() => {
    // keep data across reload (beforeEach clears only on first load of the test)
    sessionStorage.setItem('keep', '1');
  });
  const saved = await page.evaluate(() => localStorage.getItem('ladder_time_entries'));
  expect(JSON.parse(saved)).toHaveLength(1);
  await page.getByTestId('hours-site-GymCraft London').locator('summary').click();
  await page.locator('[data-testid^="hours-delete-"]').first().click();
  await page.locator('[data-testid^="hours-confirm-delete-"]').first().click();
  await expect(page.getByText('No hours logged for this month yet.')).toBeVisible();
});

test('downloads the month report as XLSX', async ({ page }) => {
  await page.getByRole('button', { name: 'Hours', exact: true }).click();
  await logHours(page, 'Chadwell', 'Pop up banner', 2, 'Bear');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('hours-export').click()]);
  expect(dl.suggestedFilename()).toBe(`hours-all-accounts-${today().slice(0, 7)}.xlsx`);
});
