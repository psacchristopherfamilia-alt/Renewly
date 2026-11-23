\set ON_ERROR_STOP 1
-- Core data model: properties, licences, checklists and documents, checked role by role.
-- Island Villas (org A): Ana owner, Abel admin, Otto operator, Vale viewer. Other Co (org B): Xena owner.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001', 'ana@iv.tc',  '{"full_name":"Ana"}'),
  ('c0000000-0000-0000-0000-000000000002', 'abel@iv.tc', '{"full_name":"Abel"}'),
  ('c0000000-0000-0000-0000-000000000003', 'otto@iv.tc', '{"full_name":"Otto"}'),
  ('c0000000-0000-0000-0000-000000000004', 'vale@iv.tc', '{"full_name":"Vale"}'),
  ('c0000000-0000-0000-0000-000000000005', 'xena@oc.tc', '{"full_name":"Xena","locale":"en"}');
insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-00000000000a', 'Island Villas'), ('0b000000-0000-0000-0000-00000000000b', 'Other Co');
insert into public.memberships (tenant_id, user_id, role) values
  ('0a000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'owner'),
  ('0a000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000002', 'admin'),
  ('0a000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000003', 'operator'),
  ('0a000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000004', 'viewer'),
  ('0b000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000005', 'owner');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  select null::void;
$$;
create temp table k (name text primary key, id uuid);
grant all on k to authenticated;
set role authenticated;

-- Abel (admin) creates two villas and their accommodation licences.
select pg_temp.as_user('c0000000-0000-0000-0000-000000000002');
do $$ declare v_pool uuid; v_dry uuid; v_lic uuid; v_lic_dry uuid; begin
  assert (select count(*) from public.license_types) = 2, 'reference data readable';
  insert into public.properties (tenant_id, name, area, has_pool) values ('0a000000-0000-0000-0000-00000000000a', 'Villa Sandcastle', 'Grace Bay', true) returning id into v_pool;
  insert into public.properties (tenant_id, name, area, has_pool) values ('0a000000-0000-0000-0000-00000000000a', 'Casa Azul', 'Long Bay', false) returning id into v_dry;
  insert into public.licenses (tenant_id, property_id, license_type, expires_on, fee_estimate)
    values ('0a000000-0000-0000-0000-00000000000a', v_pool, 'accommodation', '2026-12-31', 1450) returning id into v_lic;
  insert into k values ('pool', v_pool), ('dry', v_dry), ('lic', v_lic);
  insert into public.licenses (tenant_id, property_id, license_type, expires_on)
    values ('0a000000-0000-0000-0000-00000000000a', v_dry, 'accommodation', '2026-12-31') returning id into v_lic_dry;
  insert into k values ('lic_dry', v_lic_dry);
  assert (select count(*) from public.checklist_items where license_id = v_lic) = 6, 'villa with pool gets 6 items';
  assert (select count(*) from public.checklist_items where license_id = (select id from k where name = 'lic_dry')) = 5, 'no pool → no pool signage item';
  assert (select created_by from public.properties where id = v_pool) = auth.uid(), 'author recorded';
  begin
    insert into public.licenses (tenant_id, property_id, license_type, expires_on) values ('0a000000-0000-0000-0000-00000000000a', v_pool, 'accommodation', '2027-12-31');
    raise exception 'two current licences of the same type';
  exception when unique_violation then null; end;
  begin
    update public.properties set tenant_id = '0b000000-0000-0000-0000-00000000000b' where id = v_pool;
    raise exception 'tenant_id changed';
  exception when insufficient_privilege then null; end;
  update public.licenses set license_number = 'ACC-2026-0142' where id = v_lic;
end $$;

-- The dashboard view shows days left, the filing deadline and checklist progress.
do $$ begin
  assert (select filing_deadline from public.license_overview where license_id = (select id from k where name = 'lic')) = '2026-12-02', 'filing deadline from rules';
  assert (select required_items from public.license_overview where license_id = (select id from k where name = 'lic')) = 6, 'progress counts';
  assert (select required_done from public.license_overview where license_id = (select id from k where name = 'lic')) = 0, 'nothing done yet';
end $$;

-- Otto (operator) ticks items, writes notes and uploads documents, but cannot change the structure.
select pg_temp.as_user('c0000000-0000-0000-0000-000000000003');
do $$ declare v_item uuid := (select id from public.checklist_items where license_id = (select id from k where name = 'lic') and template_code = 'pool_signage'); begin
  update public.checklist_items set done = true, notes = 'Signs replaced 20 Nov' where id = v_item;
  assert (select done_by from public.checklist_items where id = v_item) = auth.uid(), 'done_by is the operator';
  assert (select done_at from public.checklist_items where id = v_item) is not null, 'done_at set';
  begin update public.checklist_items set done_by = 'c0000000-0000-0000-0000-000000000001' where id = v_item; raise exception 'done_by forged';
  exception when insufficient_privilege then null; end;
  begin update public.checklist_items set label = 'Whatever' where id = v_item; raise exception 'operator renamed item';
  exception when insufficient_privilege then null; end;
  begin update public.checklist_items set required = false where id = v_item; raise exception 'operator made item optional';
  exception when insufficient_privilege then null; end;
  begin insert into public.properties (tenant_id, name) values ('0a000000-0000-0000-0000-00000000000a', 'Sneaky Villa'); raise exception 'operator created property';
  exception when insufficient_privilege then null; end;
  begin insert into public.licenses (tenant_id, property_id, license_type, expires_on)
    values ('0a000000-0000-0000-0000-00000000000a', (select id from k where name = 'pool'), 'business', '2027-03-31'); raise exception 'operator created licence';
  exception when insufficient_privilege then null; end;
  update public.properties set name = 'Renamed by operator' where id = (select id from k where name = 'pool');
  assert (select name from public.properties where id = (select id from k where name = 'pool')) = 'Villa Sandcastle', 'operator cannot edit property';
  insert into public.documents (tenant_id, property_id, license_id, checklist_item_id, kind, storage_path, file_name, mime_type, size_bytes)
  values ('0a000000-0000-0000-0000-00000000000a', (select id from k where name = 'pool'), (select id from k where name = 'lic'), v_item,
          'signage_photo', '0a000000-0000-0000-0000-00000000000a/1111/pool.jpg', 'pool.jpg', 'image/jpeg', 120000);
  begin insert into public.documents (tenant_id, property_id, kind, storage_path, file_name, mime_type, size_bytes)
    values ('0a000000-0000-0000-0000-00000000000a', (select id from k where name = 'pool'), 'other', '0b000000-0000-0000-0000-00000000000b/x/a.pdf', 'a.pdf', 'application/pdf', 10);
    raise exception 'document path outside the organisation folder';
  exception when check_violation then null; end;
  begin insert into public.documents (tenant_id, property_id, kind, storage_path, file_name, mime_type, size_bytes)
    values ('0a000000-0000-0000-0000-00000000000a', (select id from k where name = 'pool'), 'other', '0a000000-0000-0000-0000-00000000000a/x/a.exe', 'a.exe', 'application/x-msdownload', 10);
    raise exception 'executable accepted';
  exception when check_violation then null; end;
  delete from public.documents where file_name = 'pool.jpg';
  assert (select count(*) from public.documents where file_name = 'pool.jpg') = 1, 'operator cannot delete documents';
end $$;

-- Vale (viewer) reads everything but changes nothing.
select pg_temp.as_user('c0000000-0000-0000-0000-000000000004');
do $$ declare v_item uuid := (select id from public.checklist_items where license_id = (select id from k where name = 'lic') and template_code = 'fee_paid'); begin
  assert (select count(*) from public.properties) = 2, 'viewer sees properties';
  assert (select count(*) from public.license_overview) = 2, 'viewer sees dashboard';
  assert (select required_done from public.license_overview where license_id = (select id from k where name = 'lic')) = 1, 'progress updated';
  update public.checklist_items set done = true where id = v_item;
  assert not (select done from public.checklist_items where id = v_item), 'viewer cannot tick';
  begin insert into public.documents (tenant_id, property_id, kind, storage_path, file_name, mime_type, size_bytes)
    values ('0a000000-0000-0000-0000-00000000000a', (select id from k where name = 'pool'), 'other', '0a000000-0000-0000-0000-00000000000a/v/a.pdf', 'a.pdf', 'application/pdf', 10);
    raise exception 'viewer uploaded';
  exception when insufficient_privilege then null; end;
end $$;

-- Xena (other organisation) sees nothing of Island Villas and cannot attach anything to it.
select pg_temp.as_user('c0000000-0000-0000-0000-000000000005');
do $$ declare v_mine uuid; begin
  assert (select count(*) from public.properties) = 0, 'outsider sees no properties';
  assert (select count(*) from public.licenses) = 0, 'outsider sees no licences';
  assert (select count(*) from public.checklist_items) = 0, 'outsider sees no checklist';
  assert (select count(*) from public.documents) = 0, 'outsider sees no documents';
  assert (select count(*) from public.license_overview) = 0, 'outsider dashboard empty';
  begin insert into public.properties (tenant_id, name) values ('0a000000-0000-0000-0000-00000000000a', 'Planted'); raise exception 'outsider wrote into org A';
  exception when insufficient_privilege then null; end;
  -- A licence in her own organisation pointing at a property of org A: blocked by the composite key.
  insert into public.properties (tenant_id, name, has_pool) values ('0b000000-0000-0000-0000-00000000000b', 'Bistro', false) returning id into v_mine;
  begin insert into public.licenses (tenant_id, property_id, license_type, expires_on)
    values ('0b000000-0000-0000-0000-00000000000b', (select id from k where name = 'pool'), 'business', '2027-03-31');
    raise exception 'cross-tenant licence';
  exception when foreign_key_violation then null; end;
  insert into public.licenses (tenant_id, property_id, license_type, expires_on) values ('0b000000-0000-0000-0000-00000000000b', v_mine, 'business', '2027-03-31');
  assert (select filing_deadline from public.license_overview) = '2027-04-30', 'business licence filing deadline';
  assert (select label from public.checklist_items where template_code = 'renewal_form') = 'Renewal form completed', 'checklist in the creator language';
  update public.checklist_items set done = true where license_id in (select id from k);
  delete from public.properties where id = (select id from k where name = 'pool');
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.properties where id = (select id from k where name = 'pool')) = 1, 'outsider could not delete';
  assert (select count(*) from public.checklist_items where license_id = (select id from k where name = 'lic') and done) = 1, 'outsider could not tick';
end $$;

-- Every change is in the audit log, with who did it.
do $$ begin
  assert (select count(*) from public.audit_log where action = 'properties.insert' and tenant_id = '0a000000-0000-0000-0000-00000000000a') = 2, 'property creations audited';
  assert (select data ->> 'license_number' from public.audit_log where action = 'licenses.update') = 'ACC-2026-0142', 'licence edit audited with the change';
  assert (select actor_id from public.audit_log where action = 'checklist_items.update' and tenant_id = '0a000000-0000-0000-0000-00000000000a' limit 1)
         = 'c0000000-0000-0000-0000-000000000003', 'checklist tick audited with the operator';
  assert (select count(*) from public.audit_log where action = 'documents.insert') = 1, 'upload audited';
end $$;

-- Admin removes the villa: licences, checklist and document rows go with it, and the deletion is audited.
set role authenticated;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000002');
delete from public.properties where id = (select id from k where name = 'pool');
reset role;
do $$ begin
  assert (select count(*) from public.licenses where property_id = (select id from k where name = 'pool')) = 0, 'licences cascade';
  assert (select count(*) from public.documents where property_id = (select id from k where name = 'pool')) = 0, 'document rows cascade';
  assert (select count(*) from public.audit_log where action = 'properties.delete') = 1, 'deletion audited';
  -- Deleting a whole organisation does not trip over its own audit trail.
  delete from public.organizations where id = '0b000000-0000-0000-0000-00000000000b';
  assert (select count(*) from public.properties where tenant_id = '0b000000-0000-0000-0000-00000000000b') = 0, 'organisation deletion cascades';
end $$;
