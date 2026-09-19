-- Time tracking per website, grouped by billing account (e.g. Bear, Shane Young,
-- Sprint Integration, Direct) for month-end hour reports. Idempotent.
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  project_name text not null,              -- snapshot, so history survives project renames/deletes
  account text not null default 'Direct',
  work_date date not null,
  task text not null,
  category text not null default 'Change request',
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  person text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists time_entries_work_date_idx on public.time_entries (work_date);
create index if not exists time_entries_account_date_idx on public.time_entries (account, work_date);
create index if not exists time_entries_project_idx on public.time_entries (project_id);

alter table public.time_entries enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'time_entries' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on public.time_entries
      for all to authenticated using (true) with check (true);
  end if;
end $$;

drop trigger if exists time_entries_updated_at on public.time_entries;
create trigger time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();
