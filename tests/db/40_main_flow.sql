\set ON_ERROR_STOP 1
-- Phase 3: preloaded example, bulk import, reminders and the tour flag.
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001', 'mia@ivm.tc', '{"full_name":"Mia"}'),
  ('d0000000-0000-0000-0000-000000000002', 'oz@ivm.tc',  '{"full_name":"Oz"}');
insert into public.organizations (id, name) values ('0c000000-0000-0000-0000-00000000000c', 'IVM');
insert into public.memberships (tenant_id, user_id, role) values
  ('0c000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-000000000001', 'owner'),
  ('0c000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-000000000002', 'operator');
grant usage on schema public to service_role;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  select null::void;
$$;

do $$ begin
  assert public.next_expiry('accommodation', '2026-11-23') = '2026-12-31', 'next accommodation expiry';
  assert public.next_expiry('accommodation', '2027-01-02') = '2027-12-31', 'rolls to next year';
  assert public.next_expiry('business', '2026-11-23') = '2027-03-31', 'next business expiry';
end $$;

set role authenticated;

-- The operator cannot load the example, import or clear: only admins and owners shape the portfolio.
select pg_temp.as_user('d0000000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.load_sample_data('0c000000-0000-0000-0000-00000000000c'); raise exception 'operator loaded sample';
  exception when insufficient_privilege then null; end;
  begin perform public.import_properties('0c000000-0000-0000-0000-00000000000c', '[{"name":"X Villa"}]'); raise exception 'operator imported';
  exception when insufficient_privilege then null; end;
  update public.profiles set tour_done_at = now() where id = auth.uid();
  assert (select tour_done_at from public.profiles where id = auth.uid()) is not null, 'tour flag saved';
end $$;

-- The owner loads the example: 6 properties, checklists partly done, idempotent.
select pg_temp.as_user('d0000000-0000-0000-0000-000000000001');
do $$ begin
  assert public.load_sample_data('0c000000-0000-0000-0000-00000000000c') = 6, 'six sample properties';
  assert public.load_sample_data('0c000000-0000-0000-0000-00000000000c') = 0, 'loading twice adds nothing';
  assert (select count(*) from public.license_overview where is_sample) = 6, 'sample in the dashboard';
  assert (select required_done from public.license_overview where property_name = 'Turtle Cove Suites') = 6, 'Turtle Cove complete';
  assert (select required_items - required_done from public.license_overview where property_name = 'Ocean Club West 4B') = 5, 'Ocean Club has 5 pending';
end $$;

-- Import: all or nothing, with the failing row number.
do $$ begin
  begin
    perform public.import_properties('0c000000-0000-0000-0000-00000000000c',
      '[{"name":"Good Villa","license_type":"accommodation"},{"name":"x","license_type":"accommodation"}]');
    raise exception 'bad row accepted';
  exception when check_violation then
    assert sqlerrm like 'import_row_2:%', 'error names the row: ' || sqlerrm;
  end;
  assert (select count(*) from public.properties where name = 'Good Villa') = 0, 'nothing imported when one row fails';
  begin perform public.import_properties('0c000000-0000-0000-0000-00000000000c', '[{"name":"Typo Villa","license_type":"acommodation"}]');
    raise exception 'unknown licence type accepted';
  exception when foreign_key_violation then null; end;
  assert public.import_properties('0c000000-0000-0000-0000-00000000000c', '[
    {"name":"Coral Villa","island":"north_caicos","area":"Whitby","owner_name":"J. Smith","has_pool":"true","license_type":"accommodation","expires_on":"2026-12-31","license_number":"A-1","fee_estimate":"1450"},
    {"name":"Reef Bar","license_type":"business"},
    {"name":"Land Lot 7"}]') = 3, 'three rows imported';
  assert (select count(*) from public.checklist_items c join public.licenses l on l.id = c.license_id join public.properties p on p.id = l.property_id
          where p.name = 'Coral Villa') = 6, 'imported villa with pool gets its checklist';
  assert (select expires_on from public.licenses l join public.properties p on p.id = l.property_id where p.name = 'Reef Bar') = public.next_expiry('business'), 'missing expiry uses the official date';
  assert (select count(*) from public.licenses l join public.properties p on p.id = l.property_id where p.name = 'Land Lot 7') = 0, 'row without licence type adds only the property';
end $$;
reset role;

-- Reminders (service role): due ones only, never for the sample, never twice.
set role service_role;
do $$ begin
  -- Coral Villa: deadline Dec 2 2026. Seven days before → d7.
  assert (select kind from public.due_reminders('2026-11-25') where property_name = 'Coral Villa') = 'd7', 'd7 due';
  assert (select jsonb_array_length(recipients) from public.due_reminders('2026-11-25') where property_name = 'Coral Villa') = 1, 'only owners/admins receive';
  assert (select count(*) from public.due_reminders('2026-11-25') where property_name like '%Sandcastle%') = 0, 'sample never emails';
  assert (select count(*) from public.due_reminders('2026-11-24') where property_name = 'Coral Villa') = 0, 'no reminder on off days';
  perform public.mark_reminder_sent((select license_id from public.due_reminders('2026-11-25') where property_name = 'Coral Villa'), '2026-12-02', 'd7', 1);
  assert (select count(*) from public.due_reminders('2026-11-25') where property_name = 'Coral Villa') = 0, 'not sent twice';
  assert (select kind from public.due_reminders('2026-12-05') where property_name = 'Coral Villa') = 'overdue', 'overdue after the deadline';
  perform public.mark_reminder_sent((select license_id from public.due_reminders('2026-12-05') where property_name = 'Coral Villa'), '2026-12-02', 'overdue', 1);
  assert (select count(*) from public.due_reminders('2026-12-06') where property_name = 'Coral Villa') = 0, 'overdue only once';
end $$;
reset role;

set role authenticated;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform * from public.due_reminders(current_date); raise exception 'signed-in user read reminders of every organisation';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.reminder_log) = 2, 'members see their reminder history';
  -- Clearing the example removes only sample rows.
  assert public.clear_sample_data('0c000000-0000-0000-0000-00000000000c') = 6, 'sample cleared';
  assert (select count(*) from public.properties) = 3, 'imported properties kept';
end $$;
reset role;
