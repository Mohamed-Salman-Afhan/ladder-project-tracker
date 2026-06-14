// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Before each test:
 * 1. Abort Supabase + Google Sheets requests via regex (glob pattern is unreliable for supabase.co)
 * 2. Clear localStorage so the app starts from a clean slate (no projects)
 * 3. Navigate and wait for the loading spinner to disappear
 */
test.beforeEach(async ({ page }) => {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.route(/script\.google\.com/, (route) => route.abort());
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

test('dashboard shows all five stats cards', async ({ page }) => {
  for (const label of ['Total', 'In Progress', 'Completed', 'Not Started', 'On Hold']) {
    await expect(page.getByText(label).first()).toBeVisible();
  }
  await expect(page.getByText('Project Progress')).toBeVisible();
});

test('new project appears in dashboard progress list', async ({ page }) => {
  const projectName = `DashProject_${Date.now()}`;

  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Dash Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  // Project should appear in the progress list on the dashboard
  await expect(page.getByText(projectName)).toBeVisible();
});

// ─── Projects Tab ────────────────────────────────────────────────────────────

test('projects tab shows search and filter controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByTestId('input-search')).toBeVisible();
  await expect(page.getByTestId('select-filter-status')).toBeVisible();
});

test('projects tab shows created projects in the list', async ({ page }) => {
  const projectName = `ListTest_${Date.now()}`;

  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('List Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: projectName })).toBeVisible();
});

// ─── Create Project ──────────────────────────────────────────────────────────

test('creates a new project with all fields', async ({ page }) => {
  const projectName = `TestProject_${Date.now()}`;

  await page.getByTestId('btn-new').click();
  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('New Project')).toBeVisible();

  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Acme Corp');
  await page.getByTestId('input-website').fill('https://acme.com');

  await page.getByTestId('btn-save').click();
  await expect(modal).toBeHidden();

  // Appears in dashboard progress list
  await expect(page.getByText(projectName)).toBeVisible();

  // Appears in Projects tab
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: projectName })).toBeVisible();
});

test('creates a project without website (optional field)', async ({ page }) => {
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

  await page.getByTestId('input-clientName').fill('Some Client');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/required/i);
    await dialog.accept();
  });

  await page.getByTestId('btn-save').click();
  await expect(modal).toBeVisible(); // modal stays open
});

test('shows alert when client name is missing', async ({ page }) => {
  await page.getByTestId('btn-new').click();
  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();

  await page.getByTestId('input-projectName').fill('Some Project');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/required/i);
    await dialog.accept();
  });

  await page.getByTestId('btn-save').click();
  await expect(modal).toBeVisible();
});

test('shows alert when both required fields are empty', async ({ page }) => {
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

  // Create a project
  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(original);
  await page.getByTestId('input-clientName').fill('Edit Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  // Edit it from the Projects tab
  await page.getByRole('button', { name: 'Projects' }).click();
  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: original });
  await card.getByRole('button', { name: 'Edit' }).click();

  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Edit Project')).toBeVisible();

  const nameInput = page.getByTestId('input-projectName');
  await nameInput.clear();
  await nameInput.fill(updated);
  await page.getByTestId('btn-save').click();

  await expect(modal).toBeHidden();
  await expect(page.getByText(updated)).toBeVisible();
  await expect(page.getByText(original)).not.toBeVisible();
});

test('edit modal shows all four workflow stages', async ({ page }) => {
  const projectName = `StagesTest_${Date.now()}`;

  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Stage Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  await page.getByRole('button', { name: 'Projects' }).click();
  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: projectName });
  await card.getByRole('button', { name: 'Edit' }).click();

  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Tasks')).toBeVisible();

  for (const stage of ['Questionnaire', 'Kickoff Meeting', 'UI/UX Design', 'Development']) {
    await expect(modal.locator(`input[value="${stage}"]`)).toBeVisible();
  }

  await page.getByTestId('btn-cancel-modal').click();
  await expect(modal).toBeHidden();
});

// ─── Delete Project ──────────────────────────────────────────────────────────

test('deletes a project after confirmation', async ({ page }) => {
  const projectName = `ToDelete_${Date.now()}`;

  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Delete Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  await page.getByRole('button', { name: 'Projects' }).click();
  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: projectName });
  await card.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Delete Project?')).toBeVisible();
  await expect(page.getByText('This cannot be undone.')).toBeVisible();

  await page.getByTestId('btn-confirm-delete').click();

  await expect(page.getByText(projectName)).not.toBeVisible();
  await expect(page.getByText('Delete Project?')).toBeHidden();
});

test('cancel delete keeps the project', async ({ page }) => {
  // Create our own project — do not rely on SAMPLE data
  const projectName = `KeepMe_${Date.now()}`;

  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Keep Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  await page.getByRole('button', { name: 'Projects' }).click();
  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: projectName });
  await card.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Delete Project?')).toBeVisible();
  await page.getByTestId('btn-cancel-delete').click();

  await expect(page.getByText('Delete Project?')).toBeHidden();
  await expect(page.getByText(projectName)).toBeVisible();
});

test('toggles a project between active and inactive (soft delete)', async ({ page }) => {
  const projectName = `Toggle_${Date.now()}`;

  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(projectName);
  await page.getByTestId('input-clientName').fill('Toggle Client');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  await page.getByRole('button', { name: 'Projects' }).click();
  const card = page.locator('[data-testid^="project-card-"]').filter({ hasText: projectName });

  // Deactivate — project is retained (soft delete) and the toggle flips label
  await card.getByRole('button', { name: 'Set Inactive' }).click();
  await expect(card.getByRole('button', { name: 'Set Active' })).toBeVisible();
  await expect(page.getByText(projectName)).toBeVisible();

  // Reactivate
  await card.getByRole('button', { name: 'Set Active' }).click();
  await expect(card.getByRole('button', { name: 'Set Inactive' })).toBeVisible();
});

// ─── Search & Filter ─────────────────────────────────────────────────────────

test('search filters projects by project name', async ({ page }) => {
  const targetName = `SearchTarget_${Date.now()}`;
  const otherName = `SearchOther_${Date.now()}`;

  for (const [name, client] of [[targetName, 'Client A'], [otherName, 'Client B']]) {
    await page.getByTestId('btn-new').click();
    await page.getByTestId('input-projectName').fill(name);
    await page.getByTestId('input-clientName').fill(client);
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('project-modal')).toBeHidden();
  }

  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByTestId('input-search').fill(targetName);

  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: targetName })).toBeVisible();
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: otherName })).not.toBeVisible();
});

test('search filters projects by client name', async ({ page }) => {
  const uniqueClient = `UniqueClient_${Date.now()}`;
  const matchProject = `MatchProject_${Date.now()}`;
  const noMatchProject = `NoMatchProject_${Date.now()}`;

  for (const [name, client] of [[matchProject, uniqueClient], [noMatchProject, 'OtherCorp']]) {
    await page.getByTestId('btn-new').click();
    await page.getByTestId('input-projectName').fill(name);
    await page.getByTestId('input-clientName').fill(client);
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('project-modal')).toBeHidden();
  }

  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByTestId('input-search').fill(uniqueClient);

  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: matchProject })).toBeVisible();
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: noMatchProject })).not.toBeVisible();
});

test('search shows "No projects found" for unmatched query', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByTestId('input-search').fill('ZZZNOMATCH999XYZ');
  await expect(page.getByText('No projects found.')).toBeVisible();
});

test('clearing search restores all projects', async ({ page }) => {
  const projectA = `ClearA_${Date.now()}`;
  const projectB = `ClearB_${Date.now()}`;

  for (const [name, client] of [[projectA, 'Client A'], [projectB, 'Client B']]) {
    await page.getByTestId('btn-new').click();
    await page.getByTestId('input-projectName').fill(name);
    await page.getByTestId('input-clientName').fill(client);
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('project-modal')).toBeHidden();
  }

  await page.getByRole('button', { name: 'Projects' }).click();
  const searchInput = page.getByTestId('input-search');

  await searchInput.fill(projectA);
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: projectB })).not.toBeVisible();

  await searchInput.clear();
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: projectA })).toBeVisible();
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: projectB })).toBeVisible();
});

test('status filter shows only matching-status projects', async ({ page }) => {
  const completedName = `Completed_${Date.now()}`;
  const inProgressName = `InProg_${Date.now()}`;

  // Create a Completed project
  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(completedName);
  await page.getByTestId('input-clientName').fill('Comp Client');
  // Overall Status is the first <select> inside the modal
  await page.getByTestId('project-modal').locator('select').first().selectOption('Completed');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  // Create an In Progress project
  await page.getByTestId('btn-new').click();
  await page.getByTestId('input-projectName').fill(inProgressName);
  await page.getByTestId('input-clientName').fill('IP Client');
  await page.getByTestId('project-modal').locator('select').first().selectOption('In Progress');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('project-modal')).toBeHidden();

  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByTestId('select-filter-status').selectOption('Completed');

  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: completedName })).toBeVisible();
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: inProgressName })).not.toBeVisible();
});

test('status filter "All" shows all projects', async ({ page }) => {
  const projectA = `AllA_${Date.now()}`;
  const projectB = `AllB_${Date.now()}`;

  for (const [name, client] of [[projectA, 'Client A'], [projectB, 'Client B']]) {
    await page.getByTestId('btn-new').click();
    await page.getByTestId('input-projectName').fill(name);
    await page.getByTestId('input-clientName').fill(client);
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('project-modal')).toBeHidden();
  }

  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByTestId('select-filter-status').selectOption('Completed');
  await page.getByTestId('select-filter-status').selectOption('All');

  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: projectA })).toBeVisible();
  await expect(page.locator('[data-testid^="project-card-"]').filter({ hasText: projectB })).toBeVisible();
});

// ─── Modal Controls ──────────────────────────────────────────────────────────

test('closes modal with the × button', async ({ page }) => {
  await page.getByTestId('btn-new').click();
  const modal = page.getByTestId('project-modal');
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: '×' }).first().click();
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

test('adds a new team member via Add button', async ({ page }) => {
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

  await expect(page.getByText('Pasindu', { exact: true })).toHaveCount(1);
});

test('prevents adding an empty name', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  // Click Add with no text — should do nothing (no dialog, no new member)
  await page.getByTestId('btn-add-team').click();

  // Original 4 members still present
  await expect(page.getByText('Pasindu', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Janith', { exact: true })).toHaveCount(1);
});

test('deactivates a team member (soft delete)', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  // Add a temporary member — it will be the LAST in the list
  const tempMember = `Temp_${Date.now()}`;
  await page.getByTestId('input-team-name').fill(tempMember);
  await page.getByTestId('btn-add-team').click();
  await expect(page.getByText(tempMember, { exact: true })).toBeVisible();

  // No "Set Active" buttons exist while every member is active
  await expect(page.getByRole('button', { name: 'Set Active' })).toHaveCount(0);

  // The newly-added member is last, so its Set Inactive button is last
  await page.getByRole('button', { name: 'Set Inactive' }).last().click();

  // Member is retained (soft delete) and its toggle now reads "Set Active"
  await expect(page.getByText(tempMember, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set Active' })).toHaveCount(1);
});

test('reactivates an inactive team member', async ({ page }) => {
  await page.getByRole('button', { name: 'Team' }).click();

  // Pasindu is first in INIT_TEAM — deactivate it
  await page.getByRole('button', { name: 'Set Inactive' }).first().click();
  await expect(page.getByRole('button', { name: 'Set Active' })).toHaveCount(1);

  // Reactivate it again
  await page.getByRole('button', { name: 'Set Active' }).first().click();
  await expect(page.getByRole('button', { name: 'Set Active' })).toHaveCount(0);
  await expect(page.getByText('Pasindu', { exact: true })).toBeVisible();
});
