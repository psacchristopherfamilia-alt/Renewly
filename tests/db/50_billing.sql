\set ON_ERROR_STOP 1
-- Billing end to end: trial, plan limits, pricing, proof, approval, renewal, overdue, suspension, reactivation,
-- cancellation, proration, isolation and platform-only actions.
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', 'olga@bay.tc',  '{"full_name":"Olga"}'),
  ('e0000000-0000-0000-0000-000000000002', 'adri@bay.tc',  '{"full_name":"Adri"}'),
  ('e0000000-0000-0000-0000-000000000003', 'opal@bay.tc',  '{"full_name":"Opal"}'),
  ('e0000000-0000-0000-0000-000000000004', 'pat@renewly.tc', '{"full_name":"Pat Platform"}'),
  ('e0000000-0000-0000-0000-000000000005', 'zed@zed.tc',   '{"full_name":"Zed"}');
insert into public.platform_admins (user_id) values ('e0000000-0000-0000-0000-000000000004');
grant usage on schema public to service_role;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  select null::void;
$$;
create temp table k (name text primary key, id uuid);
grant all on k to authenticated, service_role;
set role authenticated;

-- Olga creates Bay Villas: a 14-day trial starts by itself.
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
insert into k values ('org', public.create_organization('Bay Villas'));
do $$ declare v_org uuid := (select id from k where name = 'org'); begin
  assert (select status from public.subscriptions where tenant_id = v_org) = 'trialing', 'trial started';
  assert (select trial_ends_at from public.subscriptions where tenant_id = v_org) = current_date + 14, 'trial length from settings';
  assert public.property_limit(v_org) = 25, 'trial limit';
  -- Pricing: 39 per property, 10% off from 10 properties; manager flat 149.
  assert (select total from public.plan_price('per_property', 3)) = 117, '3 × 39';
  assert (select total from public.plan_price('per_property', 12)) = 421.20, '12 × 39 − 10%';
  assert (select discount from public.plan_price('per_property', 12)) = 46.80, 'discount shown';
  assert (select total from public.plan_price('manager', 1)) = 149, 'manager flat';
end $$;

-- Team: Adri admin, Opal operator.
reset role;
insert into public.memberships (tenant_id, user_id, role) values
  ((select id from k where name = 'org'), 'e0000000-0000-0000-0000-000000000002', 'admin'),
  ((select id from k where name = 'org'), 'e0000000-0000-0000-0000-000000000003', 'operator');
set role authenticated;

-- Only the owner chooses the plan; admins see invoices; operators do not.
select pg_temp.as_user('e0000000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.choose_plan((select id from k where name = 'org'), 'manager', 1); raise exception 'admin chose plan';
  exception when insufficient_privilege then null; end;
end $$;

select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
do $$ declare v_org uuid := (select id from k where name = 'org'); v_inv uuid; begin
  insert into public.properties (tenant_id, name) values (v_org, 'P1'), (v_org, 'P2'), (v_org, 'P3');
  begin perform public.choose_plan(v_org, 'per_property', 2); raise exception 'quantity below usage accepted';
  exception when check_violation then null; end;
  v_inv := public.choose_plan(v_org, 'per_property', 3);
  insert into k values ('inv1', v_inv);
  assert (select total from public.invoices where id = v_inv) = 117, 'invoice total';
  assert (select reference from public.invoices where id = v_inv) ~ '^RNW-[0-9A-F]{4}-[0-9A-F]{4}$', 'unique transfer reference';
  assert (select number from public.invoices where id = v_inv) ~ '^RNW-\d{4}-\d{5}$', 'invoice number';
  assert (select period_start from public.invoices where id = v_inv) = current_date + 15, 'paid period starts after the trial';
  assert (select due_on from public.invoices where id = v_inv) = current_date + 14, 'due at trial end';
  assert (select status from public.subscriptions where tenant_id = v_org) = 'trialing', 'still trialing';
  assert public.property_limit(v_org) = 3, 'plan quantity is now the limit';
  begin insert into public.properties (tenant_id, name) values (v_org, 'P4'); raise exception 'plan limit not enforced';
  exception when check_violation then null; end;
  -- The example never counts against the plan.
  assert public.load_sample_data(v_org) = 6, 'sample loads past the limit';
end $$;

select pg_temp.as_user('e0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from public.invoices) = 0, 'operator cannot see invoices';
  assert (select count(*) from public.subscriptions) = 1, 'operator sees subscription status';
  begin perform public.submit_payment_proof((select id from k where name = 'inv1'), (select id from k where name = 'org')::text || '/x/p.pdf', 'p.pdf', 'application/pdf', 10);
    raise exception 'operator uploaded a proof';
  exception when insufficient_privilege then null; end;
end $$;

-- Another organisation cannot see or touch Bay Villas billing.
select pg_temp.as_user('e0000000-0000-0000-0000-000000000005');
insert into k values ('org_z', public.create_organization('Zed Co'));
do $$ begin
  assert (select count(*) from public.invoices) = 0, 'no foreign invoices';
  assert (select count(*) from public.subscriptions) = 1, 'only own subscription';
  begin perform public.submit_payment_proof((select id from k where name = 'inv1'), (select id from k where name = 'org')::text || '/x/p.pdf', 'p.pdf', 'application/pdf', 10);
    raise exception 'outsider uploaded a proof';
  exception when insufficient_privilege then null; end;
  begin perform public.platform_approve_payment((select id from k where name = 'inv1'), 'transfer', 'x'); raise exception 'customer approved a payment';
  exception when insufficient_privilege then null; end;
  begin perform public.platform_overview(); raise exception 'customer read platform numbers';
  exception when insufficient_privilege then null; end;
  begin perform public.platform_update_settings('{"bank_details":"hacked"}'); raise exception 'customer changed bank details';
  exception when insufficient_privilege then null; end;
  begin update public.subscriptions set status = 'active'; raise exception 'direct subscription update';
  exception when insufficient_privilege then null; end;
end $$;

-- Adri (admin) uploads the proof; Pat (platform) rejects, Adri uploads again, Pat approves.
select pg_temp.as_user('e0000000-0000-0000-0000-000000000002');
select public.submit_payment_proof((select id from k where name = 'inv1'), (select id from k where name = 'org')::text || '/a/proof.pdf', 'proof.pdf', 'application/pdf', 2048, 'Transfer from FirstCaribbean');
do $$ begin
  assert (select status from public.invoices where id = (select id from k where name = 'inv1')) = 'proof_received', 'proof received';
  begin perform public.submit_payment_proof((select id from k where name = 'inv1'), 'e0000000-0000-0000-0000-000000000005/x/p.pdf', 'p.pdf', 'application/pdf', 10);
    raise exception 'proof stored outside the organisation folder';
  exception when check_violation then null; end;
end $$;

select pg_temp.as_user('e0000000-0000-0000-0000-000000000004');
do $$ begin
  assert (select count(*) from public.invoices) >= 1, 'platform admin sees all invoices';
  assert (select proofs_waiting from jsonb_to_record(public.platform_overview()) as x(proofs_waiting int)) = 1, 'proof waiting';
  perform public.platform_reject_proof((select id from k where name = 'inv1'), 'Amount does not match');
  assert (select status from public.invoices where id = (select id from k where name = 'inv1')) = 'open', 'back to open';
  assert (select rejected_reason from public.invoices where id = (select id from k where name = 'inv1')) = 'Amount does not match', 'reason kept';
end $$;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000002');
select public.submit_payment_proof((select id from k where name = 'inv1'), (select id from k where name = 'org')::text || '/b/proof2.pdf', 'proof2.pdf', 'application/pdf', 2048);
select pg_temp.as_user('e0000000-0000-0000-0000-000000000004');
do $$ declare v_org uuid := (select id from k where name = 'org'); begin
  begin perform public.platform_approve_payment((select id from k where name = 'inv1'), 'bitcoin', ''); raise exception 'invalid method accepted';
  exception when invalid_parameter_value then null; end;
  perform public.platform_approve_payment((select id from k where name = 'inv1'), 'transfer', 'FCIB-88231');
  assert (select status from public.invoices where id = (select id from k where name = 'inv1')) = 'paid', 'paid';
  assert (select status from public.subscriptions where tenant_id = v_org) = 'trialing', 'paid in advance: trial continues';
  assert (select current_period_end from public.subscriptions where tenant_id = v_org) = (current_date + 15 + interval '1 month' - interval '1 day')::date, 'period set';
  assert (select mrr from jsonb_to_record(public.platform_overview()) as x(mrr numeric)) = 0, 'no MRR while trialing';
end $$;
reset role;

-- Time passes (daily job as service role): the trial ends → active; renewal invoice before the period ends;
-- unpaid → past due → suspended after the grace period; writes blocked; reading still works.
set role service_role;
do $$ declare v_org uuid := (select id from k where name = 'org'); v_end date; begin
  perform public.billing_tick(current_date + 11);
  assert (select count(*) from public.billing_events where tenant_id = v_org and kind = 'trial_ending') = 1, 'trial ending notice';
  perform public.billing_tick(current_date + 15);
  assert (select status from public.subscriptions where tenant_id = v_org) = 'active', 'active after the trial';
  v_end := (select current_period_end from public.subscriptions where tenant_id = v_org);
  perform public.billing_tick(v_end - 7);
  assert (select count(*) from public.invoices where tenant_id = v_org and period_start = v_end + 1) = 1, 'renewal invoice issued';
  perform public.billing_tick(v_end - 7);
  assert (select count(*) from public.invoices where tenant_id = v_org and period_start = v_end + 1) = 1, 'not issued twice';
  perform public.billing_tick(v_end - 3);
  assert (select count(*) from public.billing_events where tenant_id = v_org and kind = 'due_soon') = 1, 'due soon notice';
  perform public.billing_tick(v_end + 1);
  assert (select status from public.subscriptions where tenant_id = v_org) = 'past_due', 'past due';
  perform public.billing_tick(v_end + 10);
  assert (select status from public.subscriptions where tenant_id = v_org) = 'past_due', 'still within grace';
  perform public.billing_tick(v_end + 11);
  assert (select status from public.subscriptions where tenant_id = v_org) = 'suspended', 'suspended after 10 days of grace';
  assert (select count(*) from public.pending_billing_notices() where tenant_id = v_org and kind in ('invoice_issued', 'due_soon', 'past_due', 'suspended')) >= 4, 'notices queued';
end $$;
reset role;

set role authenticated;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
do $$ declare v_org uuid := (select id from k where name = 'org'); v_done int; begin
  assert (select count(*) from public.properties where tenant_id = v_org) = 9, 'suspended org still reads its data';
  v_done := (select count(*) from public.checklist_items where tenant_id = v_org and done);
  begin insert into public.properties (tenant_id, name) values (v_org, 'Blocked'); raise exception 'write while suspended';
  exception when insufficient_privilege then null; end;
  update public.properties set name = 'Renamed' where tenant_id = v_org and name = 'P1';
  assert (select count(*) from public.properties where name = 'Renamed') = 0, 'update blocked while suspended';
  update public.checklist_items set done = true where tenant_id = v_org;
  assert (select count(*) from public.checklist_items where tenant_id = v_org and done) = v_done, 'checklist frozen while suspended';
  insert into k values ('inv2', (select id from public.invoices where tenant_id = v_org and status = 'open' order by period_start limit 1));
end $$;
-- Paying reactivates.
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
select public.submit_payment_proof((select id from k where name = 'inv2'), (select id from k where name = 'org')::text || '/c/proof3.pdf', 'proof3.pdf', 'image/jpeg', 4096);
select pg_temp.as_user('e0000000-0000-0000-0000-000000000004');
select public.platform_approve_payment((select id from k where name = 'inv2'), 'deposit', '');
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
do $$ declare v_org uuid := (select id from k where name = 'org'); begin
  assert (select status from public.subscriptions where tenant_id = v_org) in ('active', 'past_due'), 'reactivated by payment';
  assert (select suspended_at from public.subscriptions where tenant_id = v_org) is null, 'suspension cleared';
  update public.properties set name = 'P1b' where tenant_id = v_org and name = 'P1';
  assert (select count(*) from public.properties where name = 'P1b') = 1, 'writes work again';
end $$;
reset role;

-- Proration: an active subscription upgrading mid-period pays only the difference for the days left.
do $$ declare v_org uuid := (select id from k where name = 'org'); begin
  update public.subscriptions set status = 'active', current_period_start = current_date - 10, current_period_end = current_date + 19 where tenant_id = v_org;
end $$;
set role authenticated;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
do $$ declare v_org uuid := (select id from k where name = 'org'); v_inv uuid; begin
  v_inv := public.choose_plan(v_org, 'per_property', 5);   -- 117 → 195 a month, 20 of 30 days left
  assert (select kind from public.invoices where id = v_inv) = 'proration', 'proration invoice';
  assert (select total from public.invoices where id = v_inv) = 52.00, 'prorated amount: (195 − 117) × 20/30 = 52';
  assert public.property_limit(v_org) = 5, 'upgrade applies now';
  -- Downgrade waits for the renewal.
  assert public.choose_plan(v_org, 'per_property', 4) is null, 'no invoice for a downgrade';
  assert (select pending_quantity from public.subscriptions where tenant_id = v_org) = 4, 'downgrade scheduled';
  assert public.property_limit(v_org) = 5, 'limit unchanged until renewal';
  -- Cancel at the end of the period, and the operator sees the event later.
  perform public.cancel_subscription(v_org, true);
  assert (select cancel_at from public.subscriptions where tenant_id = v_org) = current_date + 19, 'cancels at period end';
end $$;
reset role;
set role service_role;
do $$ declare v_org uuid := (select id from k where name = 'org'); begin
  perform public.billing_tick(current_date + 20);
  assert (select status from public.subscriptions where tenant_id = v_org) = 'canceled', 'canceled after the period';
  assert public.property_limit(v_org) = 0, 'canceled: no new properties';
end $$;
reset role;

-- Platform: settings and plans editable only by platform admins; MRR, customers list.
set role authenticated;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000004');
do $$ begin
  perform public.platform_update_settings('{"bank_details":"FirstCaribbean · Acc 0000 · Renewly Ltd","grace_days":"7","volume_discount_pct":"15"}');
  assert (select grace_days from public.billing_settings) = 7, 'grace updated';
  assert (select total from public.plan_price('per_property', 10)) = 331.50, '15% discount applied';
  assert (select count(*) from public.platform_customers() where organization in ('Bay Villas', 'Zed Co')) = 2, 'customers listed';
  perform public.platform_set_suspended((select id from k where name = 'org_z'), true);
  assert (select status from public.subscriptions where tenant_id = (select id from k where name = 'org_z')) = 'suspended', 'manual suspend';
  perform public.platform_set_suspended((select id from k where name = 'org_z'), false);
  assert (select status from public.subscriptions where tenant_id = (select id from k where name = 'org_z')) = 'trialing', 'manual reactivate';
end $$;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000005');
do $$ begin
  assert (select bank_details from public.billing_settings) like 'FirstCaribbean%', 'customers read bank details to pay';
  begin perform * from public.billing_tick(current_date); raise exception 'customer ran the billing job';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.audit_log where action like 'billing.%') >= 6, 'billing actions audited';
end $$;
