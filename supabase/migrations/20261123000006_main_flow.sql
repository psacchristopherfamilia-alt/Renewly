-- Renewly · Phase 3 main flow: bulk import, preloaded example, reminders and the onboarding tour.

-- ---------------------------------------------------------------------------------------------------------
-- Onboarding tour: remembered per user.
-- ---------------------------------------------------------------------------------------------------------
alter table public.profiles add column tour_done_at timestamptz;
grant update (tour_done_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Next expiry of a licence type on or after a date (e.g. accommodation → next Dec 31).
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.next_expiry(p_type text, p_from date default current_date) returns date
language sql stable set search_path = '' as $$
  select case when make_date(extract(year from p_from)::int, t.expiry_month, t.expiry_day) >= p_from
              then make_date(extract(year from p_from)::int, t.expiry_month, t.expiry_day)
              else make_date(extract(year from p_from)::int + 1, t.expiry_month, t.expiry_day) end
  from public.license_types t where t.code = p_type
$$;
grant execute on function public.next_expiry(text, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Bulk import. SECURITY INVOKER: the caller's RLS applies, so only admins and owners can import, and only
-- into their own organisation. All rows or none: one bad row aborts the whole import with its row number.
-- p_rows: [{name, island, area, owner_name, has_pool, license_type, expires_on, license_number, fee_estimate}]
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.import_properties(p_tenant uuid, p_rows jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare r jsonb; i int := 0; v_prop uuid; v_type text; v_exp date;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'empty_import' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'import_too_large' using errcode = '54000'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      insert into public.properties (tenant_id, name, island, area, owner_name, has_pool)
      values (p_tenant, btrim(r ->> 'name'), coalesce(nullif(r ->> 'island', ''), 'providenciales'),
              coalesce(r ->> 'area', ''), coalesce(r ->> 'owner_name', ''), coalesce((r ->> 'has_pool')::boolean, false))
      returning id into v_prop;
      v_type := nullif(r ->> 'license_type', '');
      if v_type is not null then
        if not exists (select 1 from public.license_types where code = v_type) then
          raise exception 'unknown_license_type %', v_type using errcode = '23503';
        end if;
        v_exp := coalesce(nullif(r ->> 'expires_on', '')::date, public.next_expiry(v_type));
        insert into public.licenses (tenant_id, property_id, license_type, expires_on, license_number, fee_estimate)
        values (p_tenant, v_prop, v_type, v_exp, coalesce(r ->> 'license_number', ''), nullif(r ->> 'fee_estimate', '')::numeric);
      end if;
    exception when others then
      raise exception 'import_row_%: %', i, sqlerrm using errcode = sqlstate;
    end;
  end loop;
  return i;
end $$;
revoke all on function public.import_properties(uuid, jsonb) from public, anon;
grant execute on function public.import_properties(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Preloaded example (the prototype's portfolio). Marked is_sample so it can be removed in one click.
-- SECURITY INVOKER: only admins/owners of the organisation can load or clear it.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.load_sample_data(p_tenant uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare v_acc date := public.next_expiry('accommodation'); v_bus date := public.next_expiry('business');
        v_id uuid; v_lic uuid; s record; n int := 0;
begin
  if exists (select 1 from public.properties where tenant_id = p_tenant and is_sample) then return 0; end if;
  for s in select * from (values
    ('Villa Sandcastle',   'providenciales', 'Grace Bay',   'Familia Whitfield',  true,  'accommodation', 1450, array['licence_displayed','pool_signage','inspection_passed','liability_insurance','emergency_contact']),
    ('Casa Azul',          'providenciales', 'Long Bay',    'R. Delancy',         false, 'accommodation', 1450, array['licence_displayed','liability_insurance']),
    ('Turtle Cove Suites', 'providenciales', 'Turtle Cove', 'Cove Holdings Ltd.', true,  'accommodation', 2900, array['licence_displayed','pool_signage','inspection_passed','liability_insurance','emergency_contact','fee_paid']),
    ('Blue Hills Bistro',  'providenciales', 'Blue Hills',  'M. Jolly',           false, 'business',      600,  array['renewal_form']),
    ('Ocean Club West 4B', 'providenciales', 'Grace Bay',   'Hartley Trust',      true,  'accommodation', 1450, array['licence_displayed']),
    ('Salt Cay Cottage',   'salt_cay',       '',            'P. Gardiner',        true,  'accommodation', 1450, array['licence_displayed','liability_insurance','emergency_contact'])
  ) as t(name, island, area, owner_name, has_pool, license_type, fee, done) loop
    insert into public.properties (tenant_id, name, island, area, owner_name, has_pool, is_sample, notes)
    values (p_tenant, s.name, s.island, s.area, s.owner_name, s.has_pool, true, 'Ejemplo / Sample')
    returning id into v_id;
    insert into public.licenses (tenant_id, property_id, license_type, expires_on, fee_estimate)
    values (p_tenant, v_id, s.license_type, case s.license_type when 'business' then v_bus else v_acc end, s.fee)
    returning id into v_lic;
    update public.checklist_items set done = true where license_id = v_lic and template_code = any (s.done);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.clear_sample_data(p_tenant uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  delete from public.properties where tenant_id = p_tenant and is_sample;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.load_sample_data(uuid), public.clear_sample_data(uuid) from public, anon;
grant execute on function public.load_sample_data(uuid), public.clear_sample_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Email reminders. A daily job (server, service role) asks which reminders are due and records each one sent,
-- so nobody gets the same reminder twice. Reminders count down to the filing deadline: 30, 14, 7, 3 and 1 days,
-- then the day it is due and once overdue.
-- ---------------------------------------------------------------------------------------------------------
create table public.reminder_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.organizations (id) on delete cascade,
  license_id  uuid not null references public.licenses (id) on delete cascade,
  deadline    date not null,                     -- the cycle this reminder belongs to
  kind        text not null check (kind in ('d30', 'd14', 'd7', 'd3', 'd1', 'd0', 'overdue')),
  recipients  int  not null default 0,
  sent_at     timestamptz not null default now(),
  unique (license_id, deadline, kind)
);
create index reminder_log_tenant on public.reminder_log (tenant_id, sent_at desc);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
grant select on public.reminder_log to authenticated;
create policy reminder_log_read on public.reminder_log for select to authenticated using (public.is_member(tenant_id));

create or replace function public.reminder_kind(p_days int) returns text
language sql immutable set search_path = '' as $$
  select case when p_days < 0 then 'overdue' when p_days = 0 then 'd0' when p_days = 1 then 'd1' when p_days = 3 then 'd3'
              when p_days = 7 then 'd7' when p_days = 14 then 'd14' when p_days = 30 then 'd30' end
$$;

-- Due reminders for one day, with who should receive them (owners and admins). Service role only.
create or replace function public.due_reminders(p_today date default current_date)
returns table (tenant_id uuid, organization text, license_id uuid, property_name text, license_type text,
               deadline date, expires_on date, days_left int, kind text, required_items bigint, required_done bigint,
               recipients jsonb)
language sql stable security definer set search_path = '' as $$
  with base as (
    select v.*, coalesce(v.filing_deadline, v.expires_on) as dl
    from public.license_overview v
  )
  select b.tenant_id, o.name, b.license_id, b.property_name, b.license_type, b.dl, b.expires_on,
         (b.dl - p_today)::int, public.reminder_kind((b.dl - p_today)::int), b.required_items, b.required_done,
         (select coalesce(jsonb_agg(jsonb_build_object('email', pr.email, 'name', pr.full_name, 'locale', pr.locale)), '[]')
            from public.memberships m join public.profiles pr on pr.id = m.user_id
           where m.tenant_id = b.tenant_id and m.role in ('owner', 'admin'))
  from base b join public.organizations o on o.id = b.tenant_id
  where not b.is_sample
    and public.reminder_kind((b.dl - p_today)::int) is not null
    and b.expires_on >= p_today - 30                                         -- stop nagging a month after expiry
    and not exists (select 1 from public.reminder_log r where r.license_id = b.license_id and r.deadline = b.dl
                    and (r.kind = public.reminder_kind((b.dl - p_today)::int)
                         or (r.kind = 'overdue' and public.reminder_kind((b.dl - p_today)::int) = 'overdue')))
$$;

create or replace function public.mark_reminder_sent(p_license uuid, p_deadline date, p_kind text, p_recipients int)
returns void language sql security definer set search_path = '' as $$
  insert into public.reminder_log (tenant_id, license_id, deadline, kind, recipients)
  select l.tenant_id, l.id, p_deadline, p_kind, p_recipients from public.licenses l where l.id = p_license
  on conflict (license_id, deadline, kind) do nothing;
$$;
revoke all on function public.due_reminders(date), public.mark_reminder_sent(uuid, date, text, int) from public, anon, authenticated;
grant execute on function public.due_reminders(date), public.mark_reminder_sent(uuid, date, text, int) to service_role;
