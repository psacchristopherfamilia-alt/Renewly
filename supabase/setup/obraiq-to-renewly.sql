-- Renewly · one-time setup of the reused "obraiq" Supabase project (ref mawdjmefsqlshiksofik).
-- Paste this whole file into Supabase → SQL Editor → Run. It runs in one transaction: all or nothing.
--   1. Archives ObraIQ (no users, only a 30-item catalog seed) into the private schema obraiq_archive. Nothing is deleted.
--   2. Applies the Renewly migrations: leads + multi-tenant foundation.
begin;

-- 1. Archive ObraIQ ----------------------------------------------------------------------------------------
create schema if not exists obraiq_archive;
revoke all on schema obraiq_archive from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I set schema obraiq_archive', r.tablename);
  end loop;
  for r in select typname from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e' loop
    execute format('alter type public.%I set schema obraiq_archive', r.typname);
  end loop;
end $$;
revoke all on all tables in schema obraiq_archive from anon, authenticated;
comment on schema obraiq_archive is 'Archived ObraIQ objects (2026-11-22). Not exposed through the API.';

-- 2. Renewly migrations -----------------------------------------------------------------------------------

-- >>> supabase/migrations/20261122000001_leads.sql
-- Renewly · Leads from the public sales page.
-- Platform-level data (not tenant data): it belongs to the Renewly operator, not to any customer
-- organisation, so it has no tenant_id. RLS is enabled with no policies: anon and authenticated
-- users cannot read or write it. Only the server (service role) inserts, from /api/leads.

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null check (char_length(name) between 2 and 120),
  email         text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text not null default '' check (char_length(phone) <= 40),
  company       text not null default '' check (char_length(company) <= 160),
  properties    int  not null check (properties between 1 and 5000),
  plan          text not null default 'undecided' check (plan in ('per_property', 'manager', 'undecided')),
  message       text not null default '' check (char_length(message) <= 2000),
  locale        text not null default 'es' check (locale in ('es', 'en')),
  utm_source    text not null default '' check (char_length(utm_source) <= 100),
  utm_medium    text not null default '' check (char_length(utm_medium) <= 100),
  utm_campaign  text not null default '' check (char_length(utm_campaign) <= 100),
  ip_hash       text not null,               -- sha256(salt:ip); the raw IP is never stored
  status        text not null default 'new' check (status in ('new', 'contacted', 'pilot', 'customer', 'discarded')),
  notified_at   timestamptz                  -- set when the owner email was sent
);

create index leads_ip_recent on public.leads (ip_hash, created_at desc);
create index leads_created on public.leads (created_at desc);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

-- >>> supabase/migrations/20261122000002_tenancy.sql
-- Renewly · Multi-tenant foundation: profiles, organisations (tenants), memberships with roles,
-- invitations and the audit log.
--
-- Rules the database enforces, not only the screens:
--   · Every tenant table carries tenant_id and RLS only shows rows of organisations you belong to.
--   · Roles: owner > admin > operator > viewer.
--   · Memberships, invitations and the audit log are never written directly by users: only through the
--     security-definer functions below, which check who is calling.
--   · Only an owner can grant or remove the owner role, and an organisation always keeps at least one owner.
--   · Admins manage operators, viewers and other admins.
--   · Invitation tokens are stored hashed (sha256); the raw token only exists in the invite link.
--   · Every sensitive action writes an audit_log row: who, what, when.

-- ---------------------------------------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'operator', 'viewer');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  locale      text not null default 'es' check (locale in ('es', 'en')),
  created_at  timestamptz not null default now()
);

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),   -- this id is the tenant_id everywhere else
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  timezone    text not null default 'America/Grand_Turk',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.memberships (
  tenant_id   uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index memberships_user on public.memberships (user_id);
-- Second key to profiles so the API can join a member with their name and email.
alter table public.memberships
  add constraint memberships_user_id_profiles_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.organizations (id) on delete cascade,
  email        text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role         public.member_role not null,
  token_hash   text not null unique,
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null,
  revoked_at   timestamptz
);
-- One open invitation per email and organisation.
create unique index invitations_open on public.invitations (tenant_id, email) where accepted_at is null and revoked_at is null;

create table public.audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid references public.organizations (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_log_tenant on public.audit_log (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.role_rank(r public.member_role) returns int
language sql immutable set search_path = '' as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'operator' then 2 else 1 end
$$;

-- Role of the calling user in an organisation, or null.
create or replace function public.my_role(p_tenant uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m where m.tenant_id = p_tenant and m.user_id = auth.uid()
$$;

create or replace function public.is_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.tenant_id = p_tenant and m.user_id = auth.uid())
$$;

-- True when the caller's role in the tenant is at least p_min.
create or replace function public.has_role(p_tenant uuid, p_min public.member_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.role_rank(public.my_role(p_tenant)) >= public.role_rank(p_min), false)
$$;

create or replace function public._audit(p_tenant uuid, p_action text, p_entity text, p_entity_id text, p_data jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, data)
  values (p_tenant, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_data, '{}'));
$$;

create or replace function public._require_user() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return auth.uid();
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Profiles are created with the auth user
-- ---------------------------------------------------------------------------------------------------------
create or replace function public._on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120),
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'es' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._on_auth_user_created();

-- ---------------------------------------------------------------------------------------------------------
-- Organisation and membership operations
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user(); v_id uuid;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  -- Abuse guard: at most 10 organisations created per user.
  if (select count(*) from public.organizations o where o.created_by = v_user) >= 10 then
    raise exception 'too_many_organizations' using errcode = '54000';
  end if;
  insert into public.organizations (name, created_by) values (btrim(p_name), v_user) returning id into v_id;
  insert into public.memberships (tenant_id, user_id, role) values (v_id, v_user, 'owner');
  perform public._audit(v_id, 'organization.created', 'organization', v_id::text, jsonb_build_object('name', btrim(p_name)));
  return v_id;
end $$;

create or replace function public.rename_organization(p_tenant uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_user();
  if not public.has_role(p_tenant, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.organizations set name = btrim(p_name) where id = p_tenant;
  perform public._audit(p_tenant, 'organization.renamed', 'organization', p_tenant::text, jsonb_build_object('name', btrim(p_name)));
end $$;

-- Creates an invitation and returns the raw token (shown once, sent in the invite link).
create or replace function public.invite_member(p_tenant uuid, p_email text, p_role public.member_role) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform public._require_user();
  if not public.has_role(p_tenant, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'owner' and not public.has_role(p_tenant, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then raise exception 'invalid_email' using errcode = '22023'; end if;
  if exists (select 1 from public.memberships m join public.profiles p on p.id = m.user_id
             where m.tenant_id = p_tenant and p.email = v_email) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  -- Abuse guard: at most 50 invitations per organisation per day.
  if (select count(*) from public.invitations i where i.tenant_id = p_tenant and i.created_at > now() - interval '1 day') >= 50 then
    raise exception 'too_many_invitations' using errcode = '54000';
  end if;
  -- A new invitation replaces an open one for the same email.
  update public.invitations set revoked_at = now()
   where tenant_id = p_tenant and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
  values (p_tenant, v_email, p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid());
  perform public._audit(p_tenant, 'member.invited', 'invitation', v_email, jsonb_build_object('role', p_role));
  return v_token;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_email text;
begin
  perform public._require_user();
  select tenant_id, email into v_tenant, v_email from public.invitations
   where id = p_invitation and accepted_at is null and revoked_at is null;
  if v_tenant is null or not public.has_role(v_tenant, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.invitations set revoked_at = now() where id = p_invitation;
  perform public._audit(v_tenant, 'member.invitation_revoked', 'invitation', v_email, '{}');
end $$;

-- What an invite link points to, so the accept page can show it. Only open, unexpired invitations.
create or replace function public.invitation_preview(p_token text)
returns table (organization_name text, email text, role public.member_role, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.name, i.email, i.role, i.expires_at
  from public.invitations i join public.organizations o on o.id = i.tenant_id
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;

-- The signed-in user accepts an invitation addressed to their own email.
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public._require_user(); v_inv public.invitations; v_email text;
begin
  select * into v_inv from public.invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and accepted_at is null and revoked_at is null and expires_at > now()
   for update;
  if v_inv.id is null then raise exception 'invalid_invitation' using errcode = '22023'; end if;
  select lower(email) into v_email from auth.users where id = v_user;
  if v_email is distinct from v_inv.email then raise exception 'invitation_email_mismatch' using errcode = '42501'; end if;
  insert into public.memberships (tenant_id, user_id, role) values (v_inv.tenant_id, v_user, v_inv.role)
  on conflict (tenant_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  perform public._audit(v_inv.tenant_id, 'member.joined', 'membership', v_user::text, jsonb_build_object('role', v_inv.role));
  return v_inv.tenant_id;
end $$;

create or replace function public._owner_count(p_tenant uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.memberships where tenant_id = p_tenant and role = 'owner'
$$;

create or replace function public.change_member_role(p_tenant uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_current public.member_role;
begin
  perform public._require_user();
  if not public.has_role(p_tenant, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select role into v_current from public.memberships where tenant_id = p_tenant and user_id = p_user for update;
  if v_current is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Only owners touch the owner role, in either direction.
  if (v_current = 'owner' or p_role = 'owner') and not public.has_role(p_tenant, 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_current = 'owner' and p_role <> 'owner' and public._owner_count(p_tenant) <= 1 then
    raise exception 'last_owner' using errcode = '23514';
  end if;
  update public.memberships set role = p_role where tenant_id = p_tenant and user_id = p_user;
  perform public._audit(p_tenant, 'member.role_changed', 'membership', p_user::text, jsonb_build_object('from', v_current, 'to', p_role));
end $$;

-- Removes a member. Anyone may leave; removing others needs admin (owner to remove an owner).
create or replace function public.remove_member(p_tenant uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.member_role; v_self boolean := p_user = auth.uid();
begin
  perform public._require_user();
  select role into v_role from public.memberships where tenant_id = p_tenant and user_id = p_user for update;
  if v_role is null or not public.is_member(p_tenant) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not v_self then
    if not public.has_role(p_tenant, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
    if v_role = 'owner' and not public.has_role(p_tenant, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  if v_role = 'owner' and public._owner_count(p_tenant) <= 1 then raise exception 'last_owner' using errcode = '23514'; end if;
  delete from public.memberships where tenant_id = p_tenant and user_id = p_user;
  perform public._audit(p_tenant, case when v_self then 'member.left' else 'member.removed' end, 'membership', p_user::text,
                        jsonb_build_object('role', v_role));
end $$;

-- Organisations of the calling user, with their role. Used by the organisation switcher.
create or replace function public.my_organizations()
returns table (id uuid, name text, role public.member_role)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, m.role from public.memberships m join public.organizations o on o.id = m.tenant_id
  where m.user_id = auth.uid() order by o.name
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Row Level Security and least privilege
-- ---------------------------------------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;
alter table public.invitations   enable row level security;
alter table public.audit_log     enable row level security;

-- Users read; writes go through the functions above. Profiles allow editing name and language only.
revoke all on public.profiles, public.organizations, public.memberships, public.invitations, public.audit_log from anon, authenticated;
grant select on public.profiles, public.organizations, public.memberships, public.invitations, public.audit_log to authenticated;
grant update (full_name, locale) on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (select 1 from public.memberships mine join public.memberships theirs on theirs.tenant_id = mine.tenant_id
             where mine.user_id = auth.uid() and theirs.user_id = profiles.id)
);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_read on public.organizations for select to authenticated using (public.is_member(id));
create policy memberships_read on public.memberships for select to authenticated using (public.is_member(tenant_id));
create policy invitations_read on public.invitations for select to authenticated using (public.has_role(tenant_id, 'admin'));
create policy audit_read on public.audit_log for select to authenticated using (public.has_role(tenant_id, 'admin'));

-- Functions: internal helpers are not callable from the API; the operations are, by signed-in users only.
revoke all on function public._audit(uuid, text, text, text, jsonb), public._owner_count(uuid),
  public._on_auth_user_created(), public._require_user() from public, anon, authenticated;
revoke all on function public.create_organization(text), public.rename_organization(uuid, text),
  public.invite_member(uuid, text, public.member_role), public.revoke_invitation(uuid), public.accept_invitation(text),
  public.change_member_role(uuid, uuid, public.member_role), public.remove_member(uuid, uuid),
  public.my_organizations(), public.invitation_preview(text) from public, anon;
grant execute on function public.create_organization(text), public.rename_organization(uuid, text),
  public.invite_member(uuid, text, public.member_role), public.revoke_invitation(uuid), public.accept_invitation(text),
  public.change_member_role(uuid, uuid, public.member_role), public.remove_member(uuid, uuid),
  public.my_organizations(), public.invitation_preview(text),
  public.my_role(uuid), public.is_member(uuid), public.has_role(uuid, public.member_role) to authenticated;

-- Record the migrations so `supabase db push` later knows they are applied.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261122000001', 'leads'), ('20261122000002', 'tenancy')
on conflict (version) do nothing;

commit;

-- Check: should list audit_log, invitations, leads, memberships, organizations, profiles
select string_agg(tablename, ', ' order by tablename) as renewly_tables from pg_tables where schemaname = 'public';
