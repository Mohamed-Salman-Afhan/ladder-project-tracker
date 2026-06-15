-- Lock down Row Level Security.
--
-- The original policies were wide open ("open_access": for all using (true)),
-- which let anyone holding the publishable anon key (shipped in the browser
-- bundle) read, edit, and delete every row. Replace them with policies scoped
-- to the `authenticated` role so only signed-in users can touch the data.
-- The anon role now has no access at all.

drop policy if exists "open_access" on public.projects;
drop policy if exists "open_access" on public.team_members;

create policy "authenticated_full_access" on public.projects
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on public.team_members
  for all to authenticated using (true) with check (true);
