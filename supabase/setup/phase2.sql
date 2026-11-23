-- Renewly · Phase 2 for the Supabase project (ref mawdjmefsqlshiksofik).
-- Paste into SQL Editor → Run. One transaction: all or nothing.
-- Adds properties, licences (with official rules), checklists, documents, private file storage and audit triggers.
begin;

-- >>> supabase/migrations/20261123000004_core.sql
-- Renewly · Core data model: properties, licences, checklists and documents.
--
-- Rules the database enforces, not only the screens:
--   · Every tenant row carries tenant_id; RLS shows only organisations you belong to.
--   · Composite foreign keys (id, tenant_id) make it impossible to link a licence, checklist item or
--     document to a property of another organisation, even with a forged request.
--   · tenant_id can never be changed after insert (it is not in any UPDATE grant).
--   · Who can do what:
--       viewer   → reads everything of the organisation.
--       operator → also ticks checklist items, adds notes and uploads documents.
--       admin    → also creates and edits properties, licences and checklist items, deletes documents.
--       owner    → same as admin (billing comes in a later phase).
--   · Licence rules (expiry date, filing deadline) and checklist templates live in tables, not in code,
--     because the government can change them. They are platform data: readable by any signed-in user,
--     editable only through migrations.
--   · Every insert, update and delete on these tables writes an audit_log row.

-- ---------------------------------------------------------------------------------------------------------
-- Platform reference data
-- ---------------------------------------------------------------------------------------------------------
create table public.license_types (
  code                 text primary key check (code ~ '^[a-z_]{2,40}$'),
  name_es              text not null,
  name_en              text not null,
  authority            text not null,
  -- Fixed yearly dates (month, day). The filing deadline is the last day to request the renewal.
  expiry_month         int  check (expiry_month between 1 and 12),
  expiry_day           int  check (expiry_day between 1 and 31),
  filing_month         int  check (filing_month between 1 and 12),
  filing_day           int  check (filing_day between 1 and 31),
  rules_confirmed      boolean not null default false,   -- false = dates still to confirm with the office
  source_url           text,
  notes                text not null default ''
);

create table public.checklist_templates (
  id                   uuid primary key default gen_random_uuid(),
  license_type         text not null references public.license_types (code) on delete cascade,
  code                 text not null check (code ~ '^[a-z_]{2,60}$'),
  label_es             text not null,
  label_en             text not null,
  required             boolean not null default true,
  requires_document    boolean not null default false,
  -- Only added when the property matches, e.g. 'has_pool'. Null = always.
  condition            text check (condition in ('has_pool')),
  sort                 int not null default 0,
  unique (license_type, code)
);

insert into public.license_types (code, name_es, name_en, authority, expiry_month, expiry_day, filing_month, filing_day, rules_confirmed, source_url, notes) values
  ('accommodation', 'Licencia de alojamiento', 'Accommodation licence', 'Department of Tourism Regulations',
   12, 31, 12, 2, false, 'https://gov.tc/tourismregulations/',
   'Vence el 31 de diciembre; renovación a más tardar el 2 de diciembre (fecha por confirmar con el Departamento).'),
  ('business', 'Licencia comercial', 'Business licence', 'Inland Revenue Department',
   3, 31, 4, 30, true, 'https://www.pressoffice.gov.tc/latest/business-licence-renewal-period-2026',
   'Vence el 31 de marzo; renovación hasta el 30 de abril. Sin renovar: suspensión automática el 1 de mayo y cancelación si no se reinstala antes del 31 de mayo (ciclo 2026).');

insert into public.checklist_templates (license_type, code, label_es, label_en, required, requires_document, condition, sort) values
  ('accommodation', 'licence_displayed',   'Licencia vigente publicada en la propiedad',      'Current licence displayed at the property', true,  true,  null,       10),
  ('accommodation', 'pool_signage',        'Señalización de seguridad de piscina',            'Pool safety signage',                       true,  true,  'has_pool', 20),
  ('accommodation', 'inspection_passed',   'Inspección del Departamento de Turismo aprobada', 'Tourism Department inspection passed',      true,  true,  null,       30),
  ('accommodation', 'liability_insurance', 'Seguro de responsabilidad civil vigente',         'Liability insurance in force',              true,  true,  null,       40),
  ('accommodation', 'emergency_contact',   'Contacto de emergencia 24 h visible',             '24 h emergency contact visible',            true,  false, null,       50),
  ('accommodation', 'fee_paid',            'Tasa de renovación pagada',                       'Renewal fee paid',                          true,  true,  null,       60),
  ('business',      'renewal_form',        'Formulario de renovación completo',               'Renewal form completed',                    true,  false, null,       10),
  ('business',      'previous_licence',    'Copia de la licencia anterior',                   'Copy of the previous licence',              true,  true,  null,       20),
  ('business',      'fee_paid',            'Tasa de renovación pagada',                       'Renewal fee paid',                          true,  true,  null,       30);

-- ---------------------------------------------------------------------------------------------------------
-- Tenant data
-- ---------------------------------------------------------------------------------------------------------
create table public.properties (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.organizations (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 120),
  island       text not null default 'providenciales'
               check (island in ('providenciales', 'grand_turk', 'north_caicos', 'middle_caicos', 'south_caicos', 'salt_cay', 'other')),
  area         text not null default '' check (char_length(area) <= 80),
  address      text not null default '' check (char_length(address) <= 200),
  owner_name   text not null default '' check (char_length(owner_name) <= 120),
  has_pool     boolean not null default false,
  notes        text not null default '' check (char_length(notes) <= 2000),
  is_sample    boolean not null default false,          -- preloaded example the user can delete
  archived_at  timestamptz,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, tenant_id)
);
create index properties_tenant on public.properties (tenant_id) where archived_at is null;
create index properties_created_by on public.properties (created_by);

create table public.licenses (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  property_id     uuid not null,
  license_type    text not null references public.license_types (code),
  license_number  text not null default '' check (char_length(license_number) <= 60),
  issued_on       date,
  expires_on      date not null,
  fee_estimate    numeric(10, 2) check (fee_estimate >= 0),
  notes           text not null default '' check (char_length(notes) <= 2000),
  archived_at     timestamptz,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (property_id, tenant_id) references public.properties (id, tenant_id) on delete cascade,
  check (issued_on is null or issued_on <= expires_on)
);
-- One current licence of each type per property.
create unique index licenses_one_current on public.licenses (property_id, license_type) where archived_at is null;
create index licenses_tenant_expiry on public.licenses (tenant_id, expires_on) where archived_at is null;
create index licenses_type on public.licenses (license_type);
create index licenses_created_by on public.licenses (created_by);

create table public.checklist_items (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  license_id         uuid not null,
  template_code      text,                                  -- null for items added by the organisation
  label              text not null check (char_length(btrim(label)) between 2 and 200),
  required           boolean not null default true,
  requires_document  boolean not null default false,
  sort               int not null default 0,
  done               boolean not null default false,
  done_by            uuid references auth.users (id) on delete set null,
  done_at            timestamptz,
  notes              text not null default '' check (char_length(notes) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, tenant_id),
  unique (license_id, template_code),
  foreign key (license_id, tenant_id) references public.licenses (id, tenant_id) on delete cascade
);
create index checklist_items_license on public.checklist_items (license_id, sort);
create index checklist_items_tenant on public.checklist_items (tenant_id);
create index checklist_items_done_by on public.checklist_items (done_by);

create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  property_id        uuid not null,
  license_id         uuid,
  checklist_item_id  uuid,
  kind               text not null default 'other'
                     check (kind in ('licence', 'inspection', 'insurance', 'signage_photo', 'receipt', 'form', 'other')),
  storage_path       text not null unique,                  -- documents/<tenant_id>/<uuid>/<file name>
  file_name          text not null check (char_length(file_name) between 1 and 200),
  mime_type          text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes         int  not null check (size_bytes between 1 and 15728640),   -- 15 MB
  expires_on         date,
  uploaded_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  foreign key (property_id, tenant_id) references public.properties (id, tenant_id) on delete cascade,
  foreign key (license_id, tenant_id) references public.licenses (id, tenant_id) on delete cascade,
  foreign key (checklist_item_id, tenant_id) references public.checklist_items (id, tenant_id) on delete set null (checklist_item_id),
  check (storage_path like tenant_id::text || '/%')
);
create index documents_property on public.documents (property_id);
create index documents_license on public.documents (license_id);
create index documents_item on public.documents (checklist_item_id);
create index documents_tenant on public.documents (tenant_id);
create index documents_uploaded_by on public.documents (uploaded_by);

-- ---------------------------------------------------------------------------------------------------------
-- Triggers: timestamps, checklist from templates, who ticked an item, audit trail
-- ---------------------------------------------------------------------------------------------------------
create or replace function public._touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger properties_touch before update on public.properties for each row execute function public._touch_updated_at();
create trigger licenses_touch before update on public.licenses for each row execute function public._touch_updated_at();
create trigger checklist_items_touch before update on public.checklist_items for each row execute function public._touch_updated_at();

-- New licence → its checklist, from the templates that apply to the property.
create or replace function public._licence_checklist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.checklist_items (tenant_id, license_id, template_code, label, required, requires_document, sort)
  select new.tenant_id, new.id, t.code,
         case when o.locale = 'en' then t.label_en else t.label_es end,
         t.required, t.requires_document, t.sort
  from public.checklist_templates t
  join public.properties p on p.id = new.property_id
  left join public.profiles o on o.id = auth.uid()
  where t.license_type = new.license_type
    and (t.condition is null or (t.condition = 'has_pool' and p.has_pool));
  return new;
end $$;
create trigger licenses_checklist after insert on public.licenses for each row execute function public._licence_checklist();

-- Ticking an item records who and when; unticking clears it. Users cannot forge these columns.
create or replace function public._checklist_done() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_by := auth.uid(); new.done_at := now();
  elsif not new.done then
    new.done_by := null; new.done_at := null;
  else
    new.done_by := old.done_by; new.done_at := old.done_at;
  end if;
  return new;
end $$;
create trigger checklist_items_done before insert or update on public.checklist_items
  for each row execute function public._checklist_done();

-- Generic audit: one row per change, with the changed columns.
create or replace function public._audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_new jsonb; v_old jsonb; v_changed jsonb := '{}'; k text; v_tenant uuid;
begin
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k not in ('updated_at') and v_new -> k is distinct from v_old -> k then
        v_changed := v_changed || jsonb_build_object(k, v_new -> k);
      end if;
    end loop;
    if v_changed = '{}' then return new; end if;
  end if;
  v_tenant := coalesce(v_new ->> 'tenant_id', v_old ->> 'tenant_id')::uuid;
  -- Rows removed because their whole organisation is being deleted: nothing left to audit against.
  if not exists (select 1 from public.organizations where id = v_tenant) then return coalesce(new, old); end if;
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, data)
  values (
    v_tenant,
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    case tg_op when 'INSERT' then v_new when 'UPDATE' then v_changed else v_old end
  );
  return coalesce(new, old);
end $$;

create trigger properties_audit after insert or update or delete on public.properties for each row execute function public._audit_row();
create trigger licenses_audit after insert or update or delete on public.licenses for each row execute function public._audit_row();
create trigger checklist_items_audit after update or delete on public.checklist_items for each row execute function public._audit_row();
create trigger documents_audit after insert or delete on public.documents for each row execute function public._audit_row();

-- ---------------------------------------------------------------------------------------------------------
-- Dashboard view: one row per current licence, with days left and checklist progress.
-- security_invoker: the caller's RLS applies, so each organisation only sees its own rows.
-- ---------------------------------------------------------------------------------------------------------
create view public.license_overview with (security_invoker = true) as
select
  l.id as license_id, l.tenant_id, l.property_id, p.name as property_name, p.island, p.area, p.owner_name, p.is_sample,
  l.license_type, lt.name_es as license_name_es, lt.name_en as license_name_en,
  l.license_number, l.expires_on, l.fee_estimate,
  -- Both current licence types file in the same calendar year as the expiry (Dec 2 → Dec 31; Mar 31 → Apr 30).
  make_date(extract(year from l.expires_on)::int, lt.filing_month, lt.filing_day) as filing_deadline,
  (l.expires_on - (now() at time zone o.timezone)::date) as days_left,
  count(c.id) filter (where c.required) as required_items,
  count(c.id) filter (where c.required and c.done) as required_done
from public.licenses l
join public.properties p on p.id = l.property_id
join public.organizations o on o.id = l.tenant_id
join public.license_types lt on lt.code = l.license_type
left join public.checklist_items c on c.license_id = l.id
where l.archived_at is null and p.archived_at is null
group by l.id, p.id, lt.code, o.timezone;

-- ---------------------------------------------------------------------------------------------------------
-- Row Level Security and least privilege
-- ---------------------------------------------------------------------------------------------------------
alter table public.license_types       enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.properties          enable row level security;
alter table public.licenses            enable row level security;
alter table public.checklist_items     enable row level security;
alter table public.documents           enable row level security;

revoke all on public.license_types, public.checklist_templates, public.properties, public.licenses,
  public.checklist_items, public.documents, public.license_overview from anon, authenticated;

-- Reference data: read only.
grant select on public.license_types, public.checklist_templates to authenticated;
create policy license_types_read on public.license_types for select to authenticated using (true);
create policy checklist_templates_read on public.checklist_templates for select to authenticated using (true);

-- Column grants: tenant_id, ids, authorship and timestamps are never writable by users.
grant select on public.properties, public.licenses, public.checklist_items, public.documents, public.license_overview to authenticated;
grant insert (tenant_id, name, island, area, address, owner_name, has_pool, notes, is_sample) on public.properties to authenticated;
grant update (name, island, area, address, owner_name, has_pool, notes, archived_at) on public.properties to authenticated;
grant delete on public.properties to authenticated;
grant insert (tenant_id, property_id, license_type, license_number, issued_on, expires_on, fee_estimate, notes) on public.licenses to authenticated;
grant update (license_number, issued_on, expires_on, fee_estimate, notes, archived_at) on public.licenses to authenticated;
grant delete on public.licenses to authenticated;
grant insert (tenant_id, license_id, label, required, requires_document, sort, notes) on public.checklist_items to authenticated;
grant update (label, required, requires_document, sort, done, notes) on public.checklist_items to authenticated;
grant delete on public.checklist_items to authenticated;
grant insert (tenant_id, property_id, license_id, checklist_item_id, kind, storage_path, file_name, mime_type, size_bytes, expires_on)
  on public.documents to authenticated;
grant delete on public.documents to authenticated;

-- Read: any member. Write: admin, except the checklist and documents where operators work.
create policy properties_read   on public.properties for select to authenticated using (public.is_member(tenant_id));
create policy properties_insert on public.properties for insert to authenticated with check (public.has_role(tenant_id, 'admin'));
create policy properties_update on public.properties for update to authenticated
  using (public.has_role(tenant_id, 'admin')) with check (public.has_role(tenant_id, 'admin'));
create policy properties_delete on public.properties for delete to authenticated using (public.has_role(tenant_id, 'admin'));

create policy licenses_read   on public.licenses for select to authenticated using (public.is_member(tenant_id));
create policy licenses_insert on public.licenses for insert to authenticated with check (public.has_role(tenant_id, 'admin'));
create policy licenses_update on public.licenses for update to authenticated
  using (public.has_role(tenant_id, 'admin')) with check (public.has_role(tenant_id, 'admin'));
create policy licenses_delete on public.licenses for delete to authenticated using (public.has_role(tenant_id, 'admin'));

create policy checklist_read   on public.checklist_items for select to authenticated using (public.is_member(tenant_id));
create policy checklist_insert on public.checklist_items for insert to authenticated with check (public.has_role(tenant_id, 'admin'));
create policy checklist_update on public.checklist_items for update to authenticated
  using (public.has_role(tenant_id, 'operator')) with check (public.has_role(tenant_id, 'operator'));
create policy checklist_delete on public.checklist_items for delete to authenticated using (public.has_role(tenant_id, 'admin'));

create policy documents_read   on public.documents for select to authenticated using (public.is_member(tenant_id));
create policy documents_insert on public.documents for insert to authenticated with check (public.has_role(tenant_id, 'operator'));
create policy documents_delete on public.documents for delete to authenticated using (public.has_role(tenant_id, 'admin'));

-- Operators may tick items and write notes, but not rename, reorder or change what is required.
create or replace function public._checklist_operator_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.has_role(new.tenant_id, 'admin')
     and (new.label is distinct from old.label or new.required is distinct from old.required
          or new.requires_document is distinct from old.requires_document or new.sort is distinct from old.sort) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger checklist_items_operator_guard before update on public.checklist_items
  for each row execute function public._checklist_operator_guard();

revoke all on function public._touch_updated_at(), public._licence_checklist(), public._checklist_done(),
  public._audit_row(), public._checklist_operator_guard() from public, anon, authenticated;

-- >>> supabase/migrations/20261123000005_storage.sql
-- Renewly · Private storage for inspection photos, insurance, receipts and other documents.
-- Files live at documents/<tenant_id>/<random id>/<file name>. The first folder decides who may touch them:
--   read: any member of that organisation · upload: operator and up · delete: admin and up.
-- Files are never public: the app serves them with short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Tenant id from the first folder of an object path, or null when it is not a valid uuid.
create or replace function public._path_tenant(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end $$;
grant execute on function public._path_tenant(text) to authenticated;

create policy documents_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_member(public._path_tenant(name)));
create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.has_role(public._path_tenant(name), 'operator'));
create policy documents_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.has_role(public._path_tenant(name), 'admin'));

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261123000004', 'core'), ('20261123000005', 'storage')
on conflict (version) do nothing;
commit;

-- Check: should list audit_log, checklist_items, checklist_templates, documents, invitations, leads, license_types, licenses, memberships, organizations, profiles, properties
select string_agg(tablename, ', ' order by tablename) as renewly_tables from pg_tables where schemaname = 'public';
