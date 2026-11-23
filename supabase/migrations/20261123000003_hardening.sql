-- Renewly · Fixes from the Supabase security and performance advisors (2026-11-23).
--
-- 1. Postgres grants EXECUTE on new functions to PUBLIC, so visitors without a session could call the
--    role helpers through /rest/v1/rpc. They only ever answered "no", but nothing outside a session
--    should reach them: execute is now for signed-in users only.
revoke execute on function public.my_role(uuid), public.is_member(uuid), public.has_role(uuid, public.member_role),
  public.role_rank(public.member_role) from public, anon;
grant execute on function public.my_role(uuid), public.is_member(uuid), public.has_role(uuid, public.member_role),
  public.role_rank(public.member_role) to authenticated;

-- Future functions in public start closed; each migration grants what it needs.
alter default privileges in schema public revoke execute on functions from public, anon;

-- 2. RLS on profiles: evaluate auth.uid() once per query instead of once per row.
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (select 1 from public.memberships mine join public.memberships theirs on theirs.tenant_id = mine.tenant_id
             where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id)
);
drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 3. Indexes for foreign keys (deletes of users and lookups by actor stay fast).
create index if not exists audit_log_actor on public.audit_log (actor_id);
create index if not exists invitations_accepted_by on public.invitations (accepted_by);
create index if not exists invitations_invited_by on public.invitations (invited_by);
create index if not exists organizations_created_by on public.organizations (created_by);
