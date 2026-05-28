// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Before each test:
 * 1. Abort Supabase API calls so the app falls back to localStorage (deterministic state)
 * 2. Clear localStorage so the app loads the built-in SAMPLE projects
 * 3. Navigate and wait for the loading spinner to disappear
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/supabase.co/**', (route) => route.abort());
  await page.route('**/script.google.com/**', (route) => route.abort());
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await expect(page.getByTestId('loading')).toBeHidden({ timeout: 15000 });
});

// ─── App Load ────────────────────────────────────────────────────────────────

test('app loads with correct header and navigation tabs', async ({ page }) => {
  await expect(page.getByText('Project Tracker')).toBeVisible();
  for (const tab of ['Dashboard', 'Projects', 'Team', 'Sheets']) {
    await expect(page.getByRole('button', { name: tab })).toBeVisible();
  }
  await expect(page.getByTestId('btn-new')).toBeVisible();
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

test('dashboard shows stats cards and project progress', async ({ page }) => {
  // All five stat cards should be present
  for (const label of ['Total', 'In Progress', 'Completed', 'Not Started', 'On Hold']) {
    await expect(page.getByText(label).first()).toBeVisible();
  }
  await expect(page.getByText('Project Progress')).toBeVisible();
  // Sample projects appear in the progress list
  await expect(page.getByText('Propsense')).toBeVisible();
  await expect(page.getByText('Sprint')).toBeVisible();
});

// ─── Projects Tab ────────────────────────────────────────────────────────────

test('projects tab shows search input, status filter, and sample projects', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByTestId('input-search')).toBeVisible();
  await expect(page.getByTestId('select-filter-status')).toBeVisible();
  // All four sample projects should be listed
  for (const name of ['Propsense', 'WTC', 'Crowntex', 'Sprint']) {
    await expect(page.getByText(name)).toBeVisible();
  }
});

// ─── Create Project ──────────────────────────────────────────────────────────

test('creates a new project with required fields', async ({ page }) => {
  const projectName = `TestProject_${Date.now()}`;

  await page.getByTestId('btn-new').click();

  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('New Project')).toBeVisible();

  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Acme Corp');
  await page.getByTestId('input-website').fill('https://acme.com');

  await page.getByTestId('btn-save').click();

  // Modal closes after save
  await expect(modal).toBeHidden();

  // New project appears on the dashboard progress list
  await expect(page.getByText(projectName)).toBeVisible();

  // Also present in the Projects tab
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByText(projectName)).toBeVisible();
});

test('create project with only minimum required fields (no website)', async ({ page }) => {
  const projectName = `MinProject_${Date.now()}`;

  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Minimal Client');
  await page.getByTestId('btn-save').click();

  await expect(page.getByTestId('project-modal')).toBeHidden();
  await expect(page.getByText(projectName)).toBeVisible();
});

// ─── Validation ──────────────────────────────────────────────────────────────

test('shows alert when project name is missing', async ({ page }) => {
  await page.getByTestId('btn-new').click();

  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();

  // Fill only client name, leave project name empty
  await page.getByTestId('input-clientName').fill('Some Client');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/required/i);
    await dialog.accept();
  });

  await page.getByTestId('btn-save').click();

  // Modal must still be open after the alert
  await expect(modal).toBeVisible();
});

test('shows alert when client name is missing', async ({ page }) => {
  await page.getByTestId('btn-new').click();

  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();

  await page.getByTestId('input-projectName').fill('Some Project');
  // Leave client name empty

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/required/i);
    await dialog.accept();
  });

  await page.getByTestId('btn-save').click();

  await expect(modal).toBeVisible();
});

test('shows alert when both required fields are missing', async ({ page }) => {
  await page.getByTestId('btn-new').click();

  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/required/i);
    await dialog.accept();
  });

  await page.getByTestId('btn-save').click();

  await expect(modal).toBeVisible();
});

// ─── Edit Project ────────────────────────────────────────────────────────────

test('edits an existing project name', async ({ page }) => {
  const original = `EditMe_${Date.now()}`;
  const updated = `Edited_${Date.now()}`;

  // Create a project first
  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(original);
  await page.getByTestId('input-clientName').fill('Edit Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  // Go to Projects tab and edit it
  await page.getByRole('button', { name: 'Projects' }).click();

  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: original });
  await card.getByRole('button', { name: 'Edit' }).click();

  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Edit Project')).toBeVisible();

  // Clear and re-type the project name
  const nameInput = page.getByTestId('input-projectName');
  await nameInput.clear();
  await nameInput.fill(updated);
  await page.getByTestId('btn-save').click();

  await expect(modal).toBeHidden();
  await expect(page.getByText(updated)).toBeVisible();
  await expect(page.getByText(original)).not.toBeVisible();
});

test('edit project preserves stage data', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();

  // Edit the first sample project (Propsense)
  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: 'Propsense' });
  await card.getByRole('button', { name: 'Edit' }).click();

  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();

  // Stage section should be visible with 4 stages
  await expect(modal.getByText('Workflow Stages')).toBeVisible();
  await expect(modal.getByText('Questionnaire')).toBeVisible();
  await expect(modal.getByText('Kickoff Meeting')).toBeVisible();
  await expect(modal.getByText('UI/UX Design')).toBeVisible();
  await expect(modal.getByText('Development')).toBeVisible();

  // Cancel without changing anything
  await page.getByTestId('btn-cancel-modal').click();
  await expect(modal).toBeHidden();
});

// ─── Delete Project ──────────────────────────────────────────────────────────

test('deletes a project after confirmation', async ({ page }) => {
  const projectName = `ToDelete_${Date.now()}`;

  // Create a project to delete
  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Delete Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  await page.getByRole('button', { name: 'Projects' }).click();

  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: projectName });
  await card.getByRole('button', { name: 'Delete' }).click();

  // Confirm dialog appears
  await expect(page.getByText('Delete Project?')).toBeVisible();
  await expect(page.getByText('This cannot be undone.')).toBeVisible();

  await page.getByTestId('btn-confirm-delete').click();

  // Project is gone
  await expect(page.getByText(projectName)).not.toBeVisible();
  await expect(page.getByText('Delete Project?')).toBeHidden();
});

test('cancel delete keeps the project', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();

  // Target the Propsense sample project
  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: 'Propsense' });
  await card.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Delete Project?')).toBeVisible();

  // Cancel the deletion
  await page.getByTestId('btn-cancel-delete').click();

  // Dialog closes, project is still there
  await expect(page.getByText('Delete Project?')).toBeHidden();
  await expect(page.getByText('Propsense')).toBeVisible();
});

// ─── Search & Filter ─────────────────────────────────────────────────────────

test('search filters projects by project name', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();

  await page.getByTestId('input-search').fill('Propsense');

  await expect(page.getByText('Propsense')).toBeVisible();
  await expect(page.getByText('WTC')).not.toBeVisible();
  await expect(page.getByText('Crowntex')).not.toBeVisible();
  await expect(page.getByText('Sprint')).not.toBeVisible();
});

test('search filters projects by client name', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();

  // WTC sample project has clientName "WTC"
  await page.getByTestId('input-search').fill('WTC');

  await expect(page.getByText('WTC')).toBeVisible();
  await expect(page.getByText('Propsense')).not.toBeVisible();
});

test('search shows no results message for unmatched query', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();

  await page.getByTestId('input-search').fill('ZZZNOMATCH999XYZ');

  await expect(page.getByText('No projects found.')).toBeVisible();
});

test('clearing search restores all projects', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();

  const searchInput = page.getByTestId('input-search');
  await searchInput.fill('Propsense');
  await expect(page.getByText('WTC')).not.toBeVisible();

  await searchInput.clear();
  await expect(page.getByText('Propsense')).toBeVisible();
  await expect(page.getByText('WTC')).toBeVisible();
  await expect(page.getByText('Crowntex')).toBeVisible();
  await expect(page.getByText('Sprint')).toBeVisible();
});

test('status filter shows only matching projects', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();

  // Sprint is the only Completed project in SAMPLE data
  await page.getByTestId('select-filter-status').selectOption('Completed');
  await expect(page.getByText('Sprint')).toBeVisible();
  await expect(page.getByText('Propsense')).not.toBeVisible();
  await expect(page.getByText('WTC')).not.toBeVisible();
});

test('status filter "All" shows every project', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();

  // Apply a filter then reset it
  await page.getByTestId('select-filter-status').selectOption('Completed');
  await page.getByTestId('select-filter-status').selectOption('All');

  for (const name of ['Propsense', 'WTC', 'Crowntex', 'Sprint']) {
    await expect(page.getByText(name)).toBeVisible();
  }
});

// ─── Modal Controls ──────────────────────────────────────────────────────────

test('closes modal with the × button', async ({ page }) => {
  await page.getByTestId('btn-new').click();
  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();

  await modal.getByRole('button', { name: '×' }).click();
  await expect(modal).toBeHidden();
});

test('closes modal with the Cancel button', async ({ page }) => {
  await page.getByTestId('btn-new').click();
  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();

  await page.getByTestId('btn-cancel-modal').click();
  await expect(modal).toBeHidden();
});

// ─── Team Management ─────────────────────────────────────────────────────────

test('team tab shows all initial members', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();
  await expect(page.getByText('Team Members')).toBeVisible();

  for (const member of ['Pasindu', 'Shamam', 'Salman', 'Janith']) {
    await expect(page.getByText(member, { exact: true })).toBeVisible();
  }
});

test('adds a new team member', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  const newMember = `Member_${Date.now()}`;
  await page.getByTestId('input-team-name').fill(newMember);
  await page.getByTestId('btn-add-team').click();

  await expect(page.getByText(newMember, { exact: true })).toBeVisible();
});

test('adds a team member by pressing Enter', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  const newMember = `EnterMember_${Date.now()}`;
  await page.getByTestId('input-team-name').fill(newMember);
  await page.getByTestId('input-team-name').press('Enter');

  await expect(page.getByText(newMember, { exact: true })).toBeVisible();
});

test('prevents adding a duplicate team member', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/already exists/i);
    await dialog.accept();
  });

  await page.getByTestId('input-team-name').fill('Pasindu');
  await page.getByTestId('btn-add-team').click();

  // Exactly one element with text "Pasindu"
  await expect(page.getByText('Pasindu', { exact: true })).toHaveCount(1);
});

test('prevents adding an empty team member name', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  const countBefore = await page.locator('[data-testid="input-team-name"]').count();
  // Click Add with empty input — should do nothing
  await page.getByTestId('btn-add-team').click();

  // Still the same 4 original members (count didn't increase)
  await expect(page.getByText('Pasindu', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Janith', { exact: true })).toHaveCount(1);
});

test('removes a team member after confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  // Add a temporary member so we do not remove a member used by sample projects
  const tempMember = `Temp_${Date.now()}`;
  await page.getByTestId('input-team-name').fill(tempMember);
  await page.getByTestId('btn-add-team').click();
  await expect(page.getByText(tempMember, { exact: true })).toBeVisible();

  // Handle the window.confirm dialog
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });

  // Find that member's row and click Remove
  const memberRow = page.locator('div').filter({ hasText: new RegExp(`^${tempMember}$`) }).first();
  await memberRow.getByRole('button', { name: 'Remove' }).click();

  await expect(page.getByText(tempMember, { exact: true })).not.toBeVisible();
});

test('cancels removing a team member', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  page.once('dialog', async (dialog) => {
    await dialog.dismiss(); // Cancel
  });

  const memberRow = page.locator('div').filter({ hasText: /^Pasindu$/ }).first();
  await memberRow.getByRole('button', { name: 'Remove' }).click();

  // Member should still be there
  await expect(page.getByText('Pasindu', { exact: true })).toBeVisible();
});
