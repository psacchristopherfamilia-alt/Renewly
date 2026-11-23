-- Renewly · Phase 5 (assisted government submission) for the Supabase project (ref mawdjmefsqlshiksofik).
-- Paste into SQL Editor → Run. One transaction: all or nothing.
-- Adds renewal procedures: questions, provisional requirement lists, statuses, submission records,
-- office responses and timeline.
begin;

-- Renewly · Assisted government submission (portal without API).
--
-- The office does not offer an API: Renewly prepares everything (pre-filled data, document checklist, a PDF
-- package) and the customer files it on the official portal or at the office with their own account. Then they
-- record the portal reference and upload the receipt here. Renewly never claims the government accepted
-- anything: a renewal is only "approved" when the customer records the office's decision with evidence.
--
-- Rules the database enforces:
--   · Requirements per procedure come from templates (mandatory, and conditional on the property or on
--     answers to questions). Each requirement shows uploaded / missing / expired (document past its expiry).
--   · "Submitted" is refused while a mandatory requirement is missing or expired, and needs the portal
--     reference and the filing receipt.
--   · Office replies are recorded: approved (with the new licence document and expiry), rejected (with reason),
--     or more information requested (adds requirements from the office, which go back to the checklist).
--   · Every step is in the renewal timeline and the audit log.
--   · The requirement lists are provisional until confirmed in writing with each office (templates_confirmed).

-- ---------------------------------------------------------------------------------------------------------
-- Platform reference data: where to file, questions, requirement templates
-- ---------------------------------------------------------------------------------------------------------
alter table public.license_types
  add column portal_name text not null default '',
  add column portal_url text,
  add column templates_confirmed boolean not null default false;

update public.license_types set portal_name = 'Department of Tourism Regulations', portal_url = 'https://gov.tc/tourismregulations/'
 where code = 'accommodation';
update public.license_types set portal_name = 'Business Licence e-Services (IRD)', portal_url = 'https://gov.tc/mof/portals/'
 where code = 'business';

create table public.renewal_questions (
  license_type  text not null references public.license_types (code) on delete cascade,
  code          text not null check (code ~ '^[a-z_]{2,40}$'),
  label_es      text not null,
  label_en      text not null,
  sort          int not null default 0,
  primary key (license_type, code)
);

create table public.requirement_templates (
  license_type  text not null references public.license_types (code) on delete cascade,
  code          text not null check (code ~ '^[a-z_]{2,60}$'),
  label_es      text not null,
  label_en      text not null,
  required      boolean not null default true,
  -- null = always; 'has_pool' = property flag; 'q:<code>' = answer "yes" to that question.
  condition     text check (condition is null or condition = 'has_pool' or condition ~ '^q:[a-z_]{2,40}$'),
  doc_kind      text not null default 'other',
  sort          int not null default 0,
  primary key (license_type, code)
);

insert into public.renewal_questions (license_type, code, label_es, label_en, sort) values
  ('accommodation', 'ownership_changed', '¿Cambió el dueño de la propiedad desde la última licencia?', 'Has the property owner changed since the last licence?', 10),
  ('accommodation', 'units_changed',     '¿Cambió el número de habitaciones o unidades?',               'Has the number of rooms or units changed?',              20),
  ('business',      'has_employees',     '¿El negocio tiene empleados?',                                 'Does the business have employees?',                       10),
  ('business',      'sells_alcohol',     '¿Vende bebidas alcohólicas?',                                  'Does it sell alcoholic drinks?',                          20),
  ('business',      'address_changed',   '¿Cambió la dirección del local?',                              'Has the business address changed?',                       30);

insert into public.requirement_templates (license_type, code, label_es, label_en, required, condition, doc_kind, sort) values
  ('accommodation', 'renewal_form',        'Formulario de renovación firmado',                  'Signed renewal form',                         true, null,                 'form',          10),
  ('accommodation', 'current_licence',     'Licencia de alojamiento vigente o anterior',         'Current or previous accommodation licence',   true, null,                 'licence',       20),
  ('accommodation', 'inspection_report',   'Informe de inspección aprobado',                     'Passed inspection report',                    true, null,                 'inspection',    30),
  ('accommodation', 'liability_insurance', 'Póliza de seguro de responsabilidad civil vigente',  'Liability insurance policy in force',         true, null,                 'insurance',     40),
  ('accommodation', 'pool_safety',         'Fotos o certificado de seguridad de piscina',        'Pool safety photos or certificate',           true, 'has_pool',           'signage_photo', 50),
  ('accommodation', 'ownership_proof',     'Prueba de propiedad del nuevo dueño',                'Proof of ownership of the new owner',         true, 'q:ownership_changed', 'other',        60),
  ('accommodation', 'units_list',          'Lista actualizada de habitaciones o unidades',       'Updated list of rooms or units',              true, 'q:units_changed',    'form',          70),
  ('business',      'renewal_form',        'Formulario de renovación de licencia comercial',     'Business licence renewal form',               true, null,                 'form',          10),
  ('business',      'current_licence',     'Licencia comercial vigente o anterior',              'Current or previous business licence',        true, null,                 'licence',       20),
  ('business',      'nib_compliance',      'Constancia de cumplimiento de NIB',                  'NIB compliance letter',                       true, 'q:has_employees',    'other',         30),
  ('business',      'liquor_licence',      'Licencia de licores vigente',                        'Liquor licence in force',                     true, 'q:sells_alcohol',    'licence',       40),
  ('business',      'premises_proof',      'Contrato de alquiler o título del nuevo local',      'Lease or title for the new premises',         true, 'q:address_changed',  'other',         50);

alter table public.renewal_questions enable row level security;
alter table public.requirement_templates enable row level security;
revoke all on public.renewal_questions, public.requirement_templates from anon, authenticated;
grant select on public.renewal_questions, public.requirement_templates to authenticated;
create policy renewal_questions_read on public.renewal_questions for select to authenticated using (true);
create policy requirement_templates_read on public.requirement_templates for select to authenticated using (true);

-- ---------------------------------------------------------------------------------------------------------
-- Renewals, their requirements and timeline
-- ---------------------------------------------------------------------------------------------------------
-- Composite key so renewals can only point to documents of the same organisation.
alter table public.documents add constraint documents_id_tenant unique (id, tenant_id);

create type public.renewal_status as enum ('preparing', 'submitted', 'info_requested', 'approved', 'rejected', 'withdrawn');

create table public.renewals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  license_id          uuid not null,
  cycle_expires_on    date not null,                         -- the expiry this renewal is for
  status              public.renewal_status not null default 'preparing',
  answers             jsonb not null default '{}',           -- {"ownership_changed": true, ...}
  form_data           jsonb not null default '{}',           -- pre-filled values the customer can edit
  submitted_at        timestamptz,
  submitted_by        uuid references auth.users (id) on delete set null,
  portal_reference    text check (char_length(portal_reference) <= 120),
  receipt_document_id uuid,
  decided_at          timestamptz,
  decision_note       text check (char_length(decision_note) <= 1000),
  new_license_id      uuid,
  created_by          uuid references auth.users (id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, tenant_id),
  unique (license_id, cycle_expires_on),
  foreign key (license_id, tenant_id) references public.licenses (id, tenant_id) on delete cascade,
  foreign key (receipt_document_id, tenant_id) references public.documents (id, tenant_id) on delete set null (receipt_document_id)
);
create index renewals_tenant on public.renewals (tenant_id, status);
create index renewals_receipt on public.renewals (receipt_document_id);
create index renewals_submitted_by on public.renewals (submitted_by);
create index renewals_created_by on public.renewals (created_by);

create table public.renewal_requirements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  renewal_id    uuid not null,
  code          text not null,
  label         text not null check (char_length(btrim(label)) between 2 and 300),
  required      boolean not null default true,
  doc_kind      text not null default 'other',
  source        text not null default 'template' check (source in ('template', 'office_request')),
  document_id   uuid,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  unique (renewal_id, code),
  foreign key (renewal_id, tenant_id) references public.renewals (id, tenant_id) on delete cascade,
  foreign key (document_id, tenant_id) references public.documents (id, tenant_id) on delete set null (document_id)
);
create index renewal_requirements_renewal on public.renewal_requirements (renewal_id, sort);
create index renewal_requirements_document on public.renewal_requirements (document_id);
create index renewal_requirements_tenant on public.renewal_requirements (tenant_id);

create table public.renewal_events (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null,
  renewal_id  uuid not null,
  kind        text not null check (kind in ('started', 'answers_saved', 'document_attached', 'form_saved', 'submitted',
                                            'info_requested', 'approved', 'rejected', 'withdrawn', 'note')),
  note        text check (char_length(note) <= 1000),
  data        jsonb not null default '{}',
  actor_id    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  foreign key (renewal_id, tenant_id) references public.renewals (id, tenant_id) on delete cascade
);
create index renewal_events_renewal on public.renewal_events (renewal_id, created_at);
create index renewal_events_tenant on public.renewal_events (tenant_id);
create index renewal_events_actor on public.renewal_events (actor_id);

-- Requirement status: uploaded, missing, or expired (attached document past its expiry date).
create view public.renewal_requirement_status with (security_invoker = true) as
select r.id, r.tenant_id, r.renewal_id, r.code, r.label, r.required, r.doc_kind, r.source, r.document_id, r.sort,
       d.file_name, d.expires_on as document_expires_on,
       case when r.document_id is null then 'missing'
            when d.expires_on is not null and d.expires_on < current_date then 'expired'
            else 'uploaded' end as status
from public.renewal_requirements r left join public.documents d on d.id = r.document_id;

-- ---------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------
create or replace function public._renewal_event(p_renewal public.renewals, p_kind text, p_note text default null, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.renewal_events (tenant_id, renewal_id, kind, note, data, actor_id)
  values (p_renewal.tenant_id, p_renewal.id, p_kind, p_note, coalesce(p_data, '{}'), auth.uid());
  perform public._audit(p_renewal.tenant_id, 'renewal.' || p_kind, 'renewal', p_renewal.id::text, coalesce(p_data, '{}'));
end $$;

create or replace function public._renewal_for_write(p_renewal uuid, p_min public.member_role) returns public.renewals
language plpgsql security definer set search_path = '' as $$
declare v public.renewals;
begin
  perform public._require_user();
  select * into v from public.renewals where id = p_renewal for update;
  if v.id is null or not public.has_role(v.tenant_id, p_min) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.tenant_writable(v.tenant_id) then raise exception 'subscription_suspended' using errcode = '42501'; end if;
  return v;
end $$;

-- (Re)builds the template requirements from the property and the answers. Keeps attached documents and
-- office requests; removes conditional requirements that no longer apply (only if nothing is attached).
create or replace function public._sync_requirements(p_renewal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.renewals; v_type text; v_pool boolean; v_lang text;
begin
  select * into v from public.renewals where id = p_renewal;
  select l.license_type, p.has_pool into v_type, v_pool
    from public.licenses l join public.properties p on p.id = l.property_id where l.id = v.license_id;
  select coalesce((select locale from public.profiles where id = auth.uid()), 'es') into v_lang;

  insert into public.renewal_requirements (tenant_id, renewal_id, code, label, required, doc_kind, sort)
  select v.tenant_id, v.id, t.code, case when v_lang = 'en' then t.label_en else t.label_es end, t.required, t.doc_kind, t.sort
  from public.requirement_templates t
  where t.license_type = v_type
    and (t.condition is null
         or (t.condition = 'has_pool' and v_pool)
         or (t.condition like 'q:%' and coalesce((v.answers ->> substr(t.condition, 3))::boolean, false)))
  on conflict (renewal_id, code) do nothing;

  delete from public.renewal_requirements r
   using public.requirement_templates t
   where r.renewal_id = v.id and r.source = 'template' and r.document_id is null
     and t.license_type = v_type and t.code = r.code and t.condition is not null
     and not ((t.condition = 'has_pool' and v_pool)
              or (t.condition like 'q:%' and coalesce((v.answers ->> substr(t.condition, 3))::boolean, false)));
end $$;

-- Missing or expired mandatory requirements of a renewal.
create or replace function public.renewal_blockers(p_renewal uuid) returns table (code text, label text, status text)
language sql stable security invoker set search_path = '' as $$
  select s.code, s.label, s.status from public.renewal_requirement_status s
  where s.renewal_id = p_renewal and s.required and s.status <> 'uploaded' order by s.sort
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------------------------------------
-- Starts (or returns) the renewal of a licence for its current expiry, pre-filling the form.
create or replace function public.start_renewal(p_license uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l record; v_id uuid;
begin
  perform public._require_user();
  select li.*, p.name as property_name, p.island, p.area, p.address, p.owner_name, p.has_pool, o.name as org_name, lt.portal_name
    into l
    from public.licenses li join public.properties p on p.id = li.property_id join public.organizations o on o.id = li.tenant_id
    join public.license_types lt on lt.code = li.license_type
   where li.id = p_license and li.archived_at is null;
  if l.id is null or not public.has_role(l.tenant_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.tenant_writable(l.tenant_id) then raise exception 'subscription_suspended' using errcode = '42501'; end if;
  select id into v_id from public.renewals where license_id = p_license and cycle_expires_on = l.expires_on;
  if v_id is not null then return v_id; end if;
  insert into public.renewals (tenant_id, license_id, cycle_expires_on, form_data)
  values (l.tenant_id, l.id, l.expires_on, jsonb_build_object(
    'property_name', l.property_name, 'island', initcap(replace(l.island, '_', ' ')), 'area', l.area, 'address', l.address,
    'owner_name', l.owner_name, 'operator_name', l.org_name, 'license_number', l.license_number,
    'current_expiry', l.expires_on, 'contact_name', coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    'contact_email', coalesce((select email from public.profiles where id = auth.uid()), ''),
    'contact_phone', '', 'rooms', '', 'authority', l.portal_name))
  returning id into v_id;
  perform public._sync_requirements(v_id);
  perform public._renewal_event((select r from public.renewals r where r.id = v_id), 'started');
  return v_id;
end $$;

create or replace function public.save_renewal_answers(p_renewal uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.renewals := public._renewal_for_write(p_renewal, 'admin'); v_clean jsonb;
begin
  if v.status not in ('preparing', 'info_requested') then raise exception 'renewal_locked' using errcode = '22023'; end if;
  -- Only known questions, as booleans.
  select coalesce(jsonb_object_agg(q.code, coalesce((p_answers ->> q.code)::boolean, false)), '{}') into v_clean
    from public.renewal_questions q join public.licenses l on l.license_type = q.license_type where l.id = v.license_id;
  update public.renewals set answers = v_clean, updated_at = now() where id = v.id;
  perform public._sync_requirements(v.id);
  perform public._renewal_event(v, 'answers_saved', null, v_clean);
end $$;

create or replace function public.save_renewal_form(p_renewal uuid, p_form jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.renewals := public._renewal_for_write(p_renewal, 'admin'); v_clean jsonb;
begin
  if v.status not in ('preparing', 'info_requested') then raise exception 'renewal_locked' using errcode = '22023'; end if;
  -- Known keys only, text up to 300 characters each.
  select coalesce(jsonb_object_agg(k, left(coalesce(p_form ->> k, ''), 300)), '{}') into v_clean
    from unnest(array['property_name', 'island', 'area', 'address', 'owner_name', 'operator_name', 'license_number',
                      'current_expiry', 'contact_name', 'contact_email', 'contact_phone', 'rooms', 'authority']) as k;
  update public.renewals set form_data = v_clean, updated_at = now() where id = v.id;
  perform public._renewal_event(v, 'form_saved');
end $$;

-- Operators may attach documents (they upload inspection photos); null detaches.
create or replace function public.attach_requirement_document(p_requirement uuid, p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.renewal_requirements; v public.renewals;
begin
  select * into r from public.renewal_requirements where id = p_requirement;
  if r.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v := public._renewal_for_write(r.renewal_id, 'operator');
  if v.status not in ('preparing', 'info_requested') then raise exception 'renewal_locked' using errcode = '22023'; end if;
  if p_document is not null and not exists (select 1 from public.documents where id = p_document and tenant_id = r.tenant_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.renewal_requirements set document_id = p_document where id = r.id;
  perform public._renewal_event(v, 'document_attached', r.label, jsonb_build_object('requirement', r.code, 'document', p_document));
end $$;

-- The customer filed on the official portal: records the reference and the receipt. Blocked while a
-- mandatory requirement is missing or expired.
create or replace function public.mark_renewal_submitted(p_renewal uuid, p_portal_reference text, p_receipt_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.renewals := public._renewal_for_write(p_renewal, 'admin');
begin
  if v.status not in ('preparing', 'info_requested') then raise exception 'renewal_locked' using errcode = '22023'; end if;
  if exists (select 1 from public.renewal_blockers(v.id)) then raise exception 'requirements_missing' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_portal_reference, ''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
  if p_receipt_document is null or not exists (select 1 from public.documents where id = p_receipt_document and tenant_id = v.tenant_id) then
    raise exception 'receipt_required' using errcode = '22023';
  end if;
  update public.renewals set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(),
         portal_reference = btrim(p_portal_reference), receipt_document_id = p_receipt_document, updated_at = now()
   where id = v.id;
  perform public._renewal_event(v, 'submitted', null, jsonb_build_object('portal_reference', btrim(p_portal_reference)));
end $$;

-- Records what the office answered. Approval needs the new licence document and its expiry: the licence
-- is renewed (old one archived, new one created with a fresh checklist). Info requested adds requirements.
create or replace function public.record_office_response(p_renewal uuid, p_kind text, p_note text default '',
                                                         p_new_expiry date default null, p_new_licence_document uuid default null,
                                                         p_new_licence_number text default null, p_extra_requirements text[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare v public.renewals := public._renewal_for_write(p_renewal, 'admin'); l public.licenses; v_new uuid; i int := 0; x text;
begin
  if v.status not in ('submitted', 'info_requested') then raise exception 'renewal_locked' using errcode = '22023'; end if;
  if p_kind = 'approved' then
    if p_new_expiry is null or p_new_expiry <= v.cycle_expires_on then raise exception 'new_expiry_required' using errcode = '22023'; end if;
    if p_new_licence_document is null or not exists (select 1 from public.documents where id = p_new_licence_document and tenant_id = v.tenant_id) then
      raise exception 'evidence_required' using errcode = '22023';
    end if;
    select * into l from public.licenses where id = v.license_id;
    update public.licenses set archived_at = now() where id = l.id;
    insert into public.licenses (tenant_id, property_id, license_type, license_number, issued_on, expires_on, fee_estimate, notes, created_by)
    values (l.tenant_id, l.property_id, l.license_type, coalesce(nullif(btrim(p_new_licence_number), ''), l.license_number),
            current_date, p_new_expiry, l.fee_estimate, l.notes, auth.uid())
    returning id into v_new;
    update public.documents set license_id = v_new, kind = 'licence' where id = p_new_licence_document;
    update public.renewals set status = 'approved', decided_at = now(), decision_note = left(p_note, 1000), new_license_id = v_new, updated_at = now()
     where id = v.id;
    perform public._renewal_event(v, 'approved', p_note, jsonb_build_object('new_expiry', p_new_expiry, 'new_license', v_new));
  elsif p_kind = 'rejected' then
    if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.renewals set status = 'rejected', decided_at = now(), decision_note = left(p_note, 1000), updated_at = now() where id = v.id;
    perform public._renewal_event(v, 'rejected', p_note);
  elsif p_kind = 'info_requested' then
    foreach x in array coalesce(p_extra_requirements, '{}') loop
      if char_length(btrim(x)) >= 2 then
        i := i + 1;
        insert into public.renewal_requirements (tenant_id, renewal_id, code, label, required, source, sort)
        values (v.tenant_id, v.id, 'office_' || to_char(now(), 'YYYYMMDDHH24MISS') || '_' || i, left(btrim(x), 300), true, 'office_request', 900 + i);
      end if;
    end loop;
    if i = 0 and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.renewals set status = 'info_requested', decision_note = left(p_note, 1000), updated_at = now() where id = v.id;
    perform public._renewal_event(v, 'info_requested', p_note, jsonb_build_object('added', i));
  else
    raise exception 'invalid_response' using errcode = '22023';
  end if;
end $$;

create or replace function public.withdraw_renewal(p_renewal uuid, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare v public.renewals := public._renewal_for_write(p_renewal, 'admin');
begin
  if v.status in ('approved', 'withdrawn') then raise exception 'renewal_locked' using errcode = '22023'; end if;
  update public.renewals set status = 'withdrawn', decision_note = left(p_note, 1000), updated_at = now() where id = v.id;
  perform public._renewal_event(v, 'withdrawn', p_note);
end $$;

-- Starts renewals for several licences at once (batch). Returns how many were started or already existed.
create or replace function public.start_renewals(p_licenses uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare x uuid; n int := 0;
begin
  if coalesce(array_length(p_licenses, 1), 0) > 200 then raise exception 'too_many' using errcode = '54000'; end if;
  foreach x in array coalesce(p_licenses, '{}') loop
    perform public.start_renewal(x);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- RLS: members read; every write goes through the functions above.
-- ---------------------------------------------------------------------------------------------------------
alter table public.renewals enable row level security;
alter table public.renewal_requirements enable row level security;
alter table public.renewal_events enable row level security;
revoke all on public.renewals, public.renewal_requirements, public.renewal_events, public.renewal_requirement_status from anon, authenticated;
grant select on public.renewals, public.renewal_requirements, public.renewal_events, public.renewal_requirement_status to authenticated;
create policy renewals_read on public.renewals for select to authenticated using (public.is_member(tenant_id));
create policy renewal_requirements_read on public.renewal_requirements for select to authenticated using (public.is_member(tenant_id));
create policy renewal_events_read on public.renewal_events for select to authenticated using (public.is_member(tenant_id));

revoke all on function public._renewal_event(public.renewals, text, text, jsonb), public._renewal_for_write(uuid, public.member_role),
  public._sync_requirements(uuid) from public, anon, authenticated;
revoke all on function public.renewal_blockers(uuid), public.start_renewal(uuid), public.start_renewals(uuid[]), public.save_renewal_answers(uuid, jsonb),
  public.save_renewal_form(uuid, jsonb), public.attach_requirement_document(uuid, uuid), public.mark_renewal_submitted(uuid, text, uuid),
  public.record_office_response(uuid, text, text, date, uuid, text, text[]), public.withdraw_renewal(uuid, text) from public, anon;
grant execute on function public.renewal_blockers(uuid), public.start_renewal(uuid), public.start_renewals(uuid[]), public.save_renewal_answers(uuid, jsonb),
  public.save_renewal_form(uuid, jsonb), public.attach_requirement_document(uuid, uuid), public.mark_renewal_submitted(uuid, text, uuid),
  public.record_office_response(uuid, text, text, date, uuid, text, text[]), public.withdraw_renewal(uuid, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261123000009', 'renewals')
on conflict (version) do nothing;
commit;

-- Check: should list the 5 renewal tables
select string_agg(tablename, ', ' order by tablename) as renewal_tables from pg_tables where schemaname = 'public'
  and tablename in ('renewals', 'renewal_requirements', 'renewal_events', 'renewal_questions', 'requirement_templates');
