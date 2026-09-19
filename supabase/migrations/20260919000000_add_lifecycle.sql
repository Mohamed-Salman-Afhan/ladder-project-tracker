-- Web Project Lifecycle: phase, health inputs, renewals, security status and
-- gate log per project (see src/lib/lifecycle.js). Stored as one jsonb column
-- so the app can evolve the shape without further migrations. Idempotent.
alter table public.projects
  add column if not exists lifecycle jsonb not null default '{}'::jsonb;

-- Lets the daily brief / reports filter by phase cheaply.
create index if not exists projects_lifecycle_phase_idx
  on public.projects ((lifecycle->>'phase'));
