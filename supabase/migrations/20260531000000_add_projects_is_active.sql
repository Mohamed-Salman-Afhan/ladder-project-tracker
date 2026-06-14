-- The live `projects` table already has an `is_active` column (added manually),
-- but it was never recorded in a migration. This makes migrations the source of
-- truth so a fresh database provisions correctly. Idempotent.
alter table public.projects
  add column if not exists is_active boolean not null default true;
