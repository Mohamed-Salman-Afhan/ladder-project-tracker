create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  created_at timestamptz default now()
);

alter table public.team_members enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'team_members' and policyname = 'open_access'
  ) then
    create policy "open_access" on public.team_members
      for all using (true) with check (true);
  end if;
end $$;

insert into public.team_members (name, position)
select name, position from (values
  ('Pasindu', 0),
  ('Shamam',  1),
  ('Salman',  2),
  ('Janith',  3)
) as t(name, position)
where not exists (select 1 from public.team_members);
