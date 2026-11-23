\set ON_ERROR_STOP 1
-- Assisted submission: requirements by condition and answers, statuses, submit gate, office responses,
-- licence renewal on approval, roles, isolation and suspension.
insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000001', 'rita@reef.tc', '{"full_name":"Rita"}'),
  ('f0000000-0000-0000-0000-000000000002', 'oto@reef.tc',  '{"full_name":"Oto"}'),
  ('f0000000-0000-0000-0000-000000000003', 'vic@reef.tc',  '{"full_name":"Vic"}'),
  ('f0000000-0000-0000-0000-000000000004', 'xia@other.tc', '{"full_name":"Xia"}');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  select null::void;
$$;
create temp table k (name text primary key, id uuid);
grant all on k to authenticated;
set role authenticated;

select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
insert into k values ('org', public.create_organization('Reef Rentals'));
reset role;
insert into public.memberships (tenant_id, user_id, role) values
  ((select id from k where name = 'org'), 'f0000000-0000-0000-0000-000000000002', 'operator'),
  ((select id from k where name = 'org'), 'f0000000-0000-0000-0000-000000000003', 'viewer');
set role authenticated;

-- Rita (owner) has a villa with a pool and a bar.
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
do $$ declare v_org uuid := (select id from k where name = 'org'); v_villa uuid; v_bar uuid; begin
  insert into public.properties (tenant_id, name, has_pool, owner_name) values (v_org, 'Reef Villa', true, 'R. Smith') returning id into v_villa;
  insert into public.properties (tenant_id, name) values (v_org, 'Reef Bar') returning id into v_bar;
  insert into public.licenses (tenant_id, property_id, license_type, expires_on, license_number) values (v_org, v_villa, 'accommodation', '2026-12-31', 'ACC-77');
  insert into public.licenses (tenant_id, property_id, license_type, expires_on) values (v_org, v_bar, 'business', '2027-03-31');
  insert into k select 'lic_villa', id from public.licenses where property_id = v_villa;
  insert into k select 'lic_bar', id from public.licenses where property_id = v_bar;
  insert into k values ('villa', v_villa);
end $$;

-- Operators and viewers cannot start a renewal.
select pg_temp.as_user('f0000000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.start_renewal((select id from k where name = 'lic_villa')); raise exception 'operator started renewal';
  exception when insufficient_privilege then null; end;
end $$;

-- Batch start: one renewal per licence, pre-filled, idempotent.
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
do $$ declare v_ren uuid; begin
  assert public.start_renewals(array[(select id from k where name = 'lic_villa'), (select id from k where name = 'lic_bar')]) = 2, 'batch started';
  assert public.start_renewals(array[(select id from k where name = 'lic_villa')]) = 1, 'idempotent';
  assert (select count(*) from public.renewals) = 2, 'one renewal per licence and cycle';
  v_ren := (select id from public.renewals where license_id = (select id from k where name = 'lic_villa'));
  insert into k values ('ren', v_ren), ('ren_bar', (select id from public.renewals where license_id = (select id from k where name = 'lic_bar')));
  assert (select form_data ->> 'license_number' from public.renewals where id = v_ren) = 'ACC-77', 'form pre-filled from the licence';
  assert (select form_data ->> 'owner_name' from public.renewals where id = v_ren) = 'R. Smith', 'form pre-filled from the property';
  -- Villa with a pool: 5 mandatory requirements including pool safety; bar: only the 2 unconditional ones.
  assert (select count(*) from public.renewal_requirements where renewal_id = v_ren) = 5, 'villa requirements';
  assert exists (select 1 from public.renewal_requirements where renewal_id = v_ren and code = 'pool_safety'), 'pool requirement from the property';
  assert (select count(*) from public.renewal_requirements where renewal_id = (select id from k where name = 'ren_bar')) = 2, 'bar requirements';
  -- Answers add conditional requirements, and removing the answer removes them again.
  perform public.save_renewal_answers((select id from k where name = 'ren_bar'), '{"has_employees": true, "sells_alcohol": true, "hack": "x"}');
  assert (select count(*) from public.renewal_requirements where renewal_id = (select id from k where name = 'ren_bar')) = 4, 'NIB and liquor added';
  assert (select answers from public.renewals where id = (select id from k where name = 'ren_bar')) ? 'hack' = false, 'unknown answers dropped';
  perform public.save_renewal_answers((select id from k where name = 'ren_bar'), '{"has_employees": true, "sells_alcohol": false}');
  assert (select count(*) from public.renewal_requirements where renewal_id = (select id from k where name = 'ren_bar')) = 3, 'liquor removed';
  assert (select count(*) from public.renewal_blockers(v_ren)) = 5, 'all 5 missing';
end $$;

-- Oto (operator) uploads documents and attaches them; one insurance policy already expired.
select pg_temp.as_user('f0000000-0000-0000-0000-000000000002');
do $$ declare v_org uuid := (select id from k where name = 'org'); v_ren uuid := (select id from k where name = 'ren'); d uuid; c text; begin
  foreach c in array array['renewal_form', 'current_licence', 'inspection_report', 'liability_insurance', 'pool_safety'] loop
    insert into public.documents (tenant_id, property_id, kind, storage_path, file_name, mime_type, size_bytes, expires_on)
    values (v_org, (select id from k where name = 'villa'), 'other', v_org::text || '/' || c || '/f.pdf', c || '.pdf', 'application/pdf', 100,
            case when c = 'liability_insurance' then current_date - 1 end)
    returning id into d;
    perform public.attach_requirement_document((select id from public.renewal_requirements where renewal_id = v_ren and renewal_requirements.code = c), d);
  end loop;
  assert (select status from public.renewal_requirement_status where renewal_id = v_ren and code = 'liability_insurance') = 'expired', 'expired document detected';
  assert (select count(*) from public.renewal_blockers(v_ren)) = 1, 'only the expired insurance blocks';
  begin perform public.save_renewal_answers(v_ren, '{}'); raise exception 'operator changed answers';
  exception when insufficient_privilege then null; end;
  begin perform public.mark_renewal_submitted(v_ren, 'TR-1', null); raise exception 'operator submitted';
  exception when insufficient_privilege then null; end;
end $$;

-- Vic (viewer) reads the renewal and its timeline, changes nothing.
select pg_temp.as_user('f0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from public.renewals) = 2, 'viewer reads renewals';
  assert (select count(*) from public.renewal_events where renewal_id = (select id from k where name = 'ren')) >= 6, 'timeline visible';
  begin perform public.attach_requirement_document((select id from public.renewal_requirements where renewal_id = (select id from k where name = 'ren') limit 1), null);
    raise exception 'viewer detached a document';
  exception when insufficient_privilege then null; end;
end $$;

-- Xia (other organisation) sees nothing and cannot act.
select pg_temp.as_user('f0000000-0000-0000-0000-000000000004');
insert into k values ('org_x', public.create_organization('Other'));
do $$ begin
  assert (select count(*) from public.renewals) = 0, 'outsider sees no renewals';
  assert (select count(*) from public.renewal_requirement_status) = 0, 'outsider sees no requirements';
  begin perform public.start_renewal((select id from k where name = 'lic_villa')); raise exception 'outsider started';
  exception when insufficient_privilege then null; end;
  begin perform public.mark_renewal_submitted((select id from k where name = 'ren'), 'X-1', null); raise exception 'outsider submitted';
  exception when insufficient_privilege then null; end;
end $$;

-- Rita: submitting is blocked until the expired insurance is replaced, and needs the reference and receipt.
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
do $$ declare v_org uuid := (select id from k where name = 'org'); v_ren uuid := (select id from k where name = 'ren'); d uuid; rcpt uuid; begin
  begin perform public.mark_renewal_submitted(v_ren, 'TR-2026-1', null); raise exception 'submitted with an expired document';
  exception when check_violation then assert sqlerrm = 'requirements_missing', sqlerrm; end;
  insert into public.documents (tenant_id, property_id, kind, storage_path, file_name, mime_type, size_bytes, expires_on)
  values (v_org, (select id from k where name = 'villa'), 'insurance', v_org::text || '/ins2/f.pdf', 'insurance-2027.pdf', 'application/pdf', 100, current_date + 365)
  returning id into d;
  perform public.attach_requirement_document((select id from public.renewal_requirements where renewal_id = v_ren and code = 'liability_insurance'), d);
  assert (select count(*) from public.renewal_blockers(v_ren)) = 0, 'ready';
  begin perform public.mark_renewal_submitted(v_ren, ' ', null); raise exception 'no reference accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.mark_renewal_submitted(v_ren, 'TR-2026-1', null); raise exception 'no receipt accepted';
  exception when invalid_parameter_value then null; end;
  insert into public.documents (tenant_id, property_id, kind, storage_path, file_name, mime_type, size_bytes)
  values (v_org, (select id from k where name = 'villa'), 'receipt', v_org::text || '/rcpt/f.pdf', 'portal-receipt.pdf', 'application/pdf', 100)
  returning id into rcpt;
  perform public.mark_renewal_submitted(v_ren, 'TR-2026-1', rcpt);
  assert (select status from public.renewals where id = v_ren) = 'submitted', 'submitted';
  begin perform public.save_renewal_form(v_ren, '{}'); raise exception 'form edited after submission';
  exception when invalid_parameter_value then null; end;
  -- The office asks for more: requirements are added and the renewal goes back to the customer.
  perform public.record_office_response(v_ren, 'info_requested', 'Need fire extinguisher certificate', null, null, null, array['Certificado de extintores']);
  assert (select status from public.renewals where id = v_ren) = 'info_requested', 'info requested';
  assert (select count(*) from public.renewal_blockers(v_ren) where label = 'Certificado de extintores') = 1, 'office request is now a blocker';
  insert into public.documents (tenant_id, property_id, kind, storage_path, file_name, mime_type, size_bytes)
  values (v_org, (select id from k where name = 'villa'), 'other', v_org::text || '/fire/f.pdf', 'extintores.pdf', 'application/pdf', 100)
  returning id into d;
  perform public.attach_requirement_document((select id from public.renewal_requirements where renewal_id = v_ren and source = 'office_request'), d);
  perform public.mark_renewal_submitted(v_ren, 'TR-2026-1b', rcpt);
  -- Approval needs evidence and a later expiry.
  begin perform public.record_office_response(v_ren, 'approved', 'ok', '2027-12-31', null); raise exception 'approved without evidence';
  exception when invalid_parameter_value then null; end;
  begin perform public.record_office_response(v_ren, 'approved', 'ok', '2026-12-31', d); raise exception 'approved without a later expiry';
  exception when invalid_parameter_value then null; end;
  insert into public.documents (tenant_id, property_id, kind, storage_path, file_name, mime_type, size_bytes)
  values (v_org, (select id from k where name = 'villa'), 'licence', v_org::text || '/newlic/f.pdf', 'licence-2027.pdf', 'application/pdf', 100)
  returning id into d;
  perform public.record_office_response(v_ren, 'approved', 'Licence issued', '2027-12-31', d, 'ACC-77-2027');
  assert (select status from public.renewals where id = v_ren) = 'approved', 'approved';
  assert (select archived_at from public.licenses where id = (select id from k where name = 'lic_villa')) is not null, 'old licence archived';
  assert (select expires_on from public.licenses where property_id = (select id from k where name = 'villa') and archived_at is null) = '2027-12-31', 'new licence';
  assert (select license_number from public.licenses where property_id = (select id from k where name = 'villa') and archived_at is null) = 'ACC-77-2027', 'new number';
  assert (select count(*) from public.checklist_items c join public.licenses l on l.id = c.license_id
          where l.property_id = (select id from k where name = 'villa') and l.archived_at is null and not c.done) = 6, 'fresh checklist for the new cycle';
  assert (select count(*) from public.license_overview where property_id = (select id from k where name = 'villa')) = 1, 'dashboard shows only the new licence';
  begin perform public.record_office_response(v_ren, 'rejected', 'late'); raise exception 'changed after approval';
  exception when invalid_parameter_value then null; end;
  -- Rejection needs a reason.
  begin perform public.withdraw_renewal((select id from k where name = 'ren'), ''); raise exception 'withdrew an approved renewal';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

do $$ begin
  assert (select count(*) from public.renewal_events where renewal_id = (select id from k where name = 'ren') and kind in ('submitted', 'info_requested', 'approved')) = 4, 'timeline complete';
  assert (select count(*) from public.audit_log where action like 'renewal.%' and tenant_id = (select id from k where name = 'org')) >= 10, 'renewal steps audited';
  update public.subscriptions set status = 'suspended' where tenant_id = (select id from k where name = 'org');
end $$;

-- Suspended accounts cannot move renewals forward.
set role authenticated;
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.save_renewal_answers((select id from k where name = 'ren_bar'), '{}'); raise exception 'suspended account wrote';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
