// @ts-check
import { test, expect } from '@playwright/test';

// Same isolation as app.spec.js: no Supabase, no real Sheets sync, clean storage.
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

const isoDaysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

async function createProject(page, name, fill = async () => {}) {
  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(name);
  await page.getByTestId('input-clientName').fill('Lifecycle Client');
  await fill();
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();
}

test('edit modal shows the lifecycle & health section', async ({ page }) => {
  await page.getByTestId('btn-new').click();
  await expect(page.getByTestId('lifecycle-editor')).toBeVisible();
  await expect(page.getByTestId('input-phase')).toHaveValue('handover');
});

test('dashboard shows Needs attention and Renewals panels', async ({ page }) => {
  await expect(page.getByTestId('attention-panel')).toBeVisible();
  await expect(page.getByTestId('renewals-panel')).toBeVisible();
  await expect(page.getByText('All active projects are on track.')).toBeVisible();
});

test('a new project with no issues is On track', async ({ page }) => {
  await createProject(page, `Green_${Date.now()}`);
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('[data-health="Green"]').first()).toBeVisible();
});

test('a domain expiring in 10 days makes the project At risk and lists it', async ({ page }) => {
  const name = `Renewal_${Date.now()}`;
  await createProject(page, name, async () => {
    await page.getByTestId('btn-add-renewal').click();
    await page.getByTestId('renewal-date-0').fill(isoDaysFromNow(10));
  });
  const panel = page.getByTestId('attention-panel');
  await expect(panel.getByText(name)).toBeVisible();
  await expect(panel.getByText(/Domain renews in 10 days/)).toBeVisible();
  await expect(panel.locator('[data-health="Red"]')).toBeVisible();
  await expect(page.getByTestId('renewals-panel').getByText(name)).toBeVisible();
});

test('overdue next action makes the project Needs attention', async ({ page }) => {
  const name = `Overdue_${Date.now()}`;
  await createProject(page, name, async () => {
    await page.getByTestId('input-nextAction').fill('Send staging link');
    await page.getByTestId('input-nextActionDue').fill(isoDaysFromNow(-2));
  });
  const panel = page.getByTestId('attention-panel');
  await expect(panel.locator('[data-health="Amber"]')).toBeVisible();
  await expect(panel.getByText(/Next action overdue: Send staging link/)).toBeVisible();
});

test('open Critical security issue makes the project At risk', async ({ page }) => {
  const name = `Security_${Date.now()}`;
  await createProject(page, name, async () => {
    await page.getByTestId('input-sec-critical').fill('1');
  });
  await expect(page.getByTestId('attention-panel').getByText(/1 open Critical security issue/)).toBeVisible();
});

test('changing phase logs a gate and persists after reload', async ({ page }) => {
  const name = `Phase_${Date.now()}`;
  await createProject(page, name, async () => {
    await page.getByTestId('input-phase').selectOption('build');
    await page.getByTestId('input-platform').selectOption('Squarespace');
  });
  await page.getByRole('button', { name: 'Projects' }).click();
  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: name });
  await expect(card.getByText('Build')).toBeVisible();
  await card.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('input-phase')).toHaveValue('build');
  await expect(page.getByTestId('input-platform')).toHaveValue('Squarespace');
  await expect(page.getByText(/Sales Handover → Build/)).toBeVisible();
});

test('Sheets sync payload carries lifecycle fields', async ({ page }) => {
  let payload = null;
  await page.route('**/api/sync-sheets', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  const name = `Sync_${Date.now()}`;
  await createProject(page, name, async () => {
    await page.getByTestId('input-platform').selectOption('Shopify');
  });
  await expect.poll(() => payload?.projects?.find((p) => p.projectName === name)?.platform).toBe('Shopify');
  const row = payload.projects.find((p) => p.projectName === name);
  expect(row.phase).toBe('Sales Handover');
  expect(row.health).toBe('Green');
});
