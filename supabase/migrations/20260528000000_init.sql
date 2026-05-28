create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  client_name text not null,
  website text default '',
  status text default 'Not Started',
  stages jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.projects enable row level security;

-- Internal tool — open access (no auth required)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'projects' and policyname = 'open_access'
  ) then
    create policy "open_access" on public.projects
      for all using (true) with check (true);
  end if;
end $$;

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();
