-- Renewly · Phase 4 (billing) for the Supabase project (ref mawdjmefsqlshiksofik).
-- Paste into SQL Editor → Run. One transaction: all or nothing.
-- Adds plans, subscriptions (every existing organisation starts a trial), invoices, payment proofs,
-- limits and suspension enforced in the database, and the private "billing" storage bucket.
begin;

-- >>> supabase/migrations/20261123000007_billing.sql
-- Renewly · Billing (manual payments first; the provider column leaves room for Stripe later).
--
-- How it works:
--   · Every new organisation starts a free trial (billing_settings.trial_days).
--   · The owner chooses a plan → an invoice with a unique transfer reference is issued.
--   · The owner or an admin uploads the payment proof → the invoice is "proof received".
--   · A platform admin (the Renewly operator) approves it → the subscription is active for the invoice period.
--   · A daily job (billing_tick) issues renewal invoices, marks overdue ones and, after the grace period,
--     suspends the organisation. Suspended organisations keep all their data and can read it, but cannot
--     write until a payment is approved.
--   · Plan limits (properties) and suspension are enforced in the database: RLS on every write and a trigger
--     on new properties. The screens only mirror them.
--   · Prices, trial, grace period, discount, bank details and invoice texts live in billing_settings and
--     plans, editable by platform admins; nothing about payments is hard-coded.

-- ---------------------------------------------------------------------------------------------------------
-- Platform admins (the Renewly operator). Added by SQL, never through the API.
-- ---------------------------------------------------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public._require_platform_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Settings and plans
-- ---------------------------------------------------------------------------------------------------------
create table public.billing_settings (
  id                    int primary key default 1 check (id = 1),
  trial_days            int not null default 14 check (trial_days between 0 and 90),
  grace_days            int not null default 10 check (grace_days between 0 and 60),
  invoice_due_days      int not null default 7 check (invoice_due_days between 0 and 60),
  renewal_notice_days   int not null default 7 check (renewal_notice_days between 1 and 30),
  volume_discount_from  int not null default 10 check (volume_discount_from >= 2),
  volume_discount_pct   numeric(5, 2) not null default 10 check (volume_discount_pct between 0 and 90),
  tax_pct               numeric(5, 2) not null default 0 check (tax_pct between 0 and 50),
  tax_label             text not null default '' check (char_length(tax_label) <= 60),
  payee_name            text not null default 'Renewly' check (char_length(payee_name) <= 160),
  payee_address         text not null default '' check (char_length(payee_address) <= 400),
  bank_details          text not null default '' check (char_length(bank_details) <= 2000),
  payment_note          text not null default '' check (char_length(payment_note) <= 1000),
  support_email         text not null default '' check (char_length(support_email) <= 200),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id) on delete set null
);
insert into public.billing_settings (id) values (1);

create table public.plans (
  code           text primary key check (code ~ '^[a-z_]{2,40}$'),
  name_es        text not null,
  name_en        text not null,
  pricing        text not null check (pricing in ('per_unit', 'flat')),
  unit_price     numeric(10, 2) not null check (unit_price >= 0),
  max_properties int check (max_properties is null or max_properties > 0),
  active         boolean not null default true,
  sort           int not null default 0
);
insert into public.plans (code, name_es, name_en, pricing, unit_price, max_properties, sort) values
  ('per_property', 'Por propiedad', 'Per property', 'per_unit', 39, null, 10),
  ('manager',      'Gestor',        'Manager',      'flat',     149, 25,  20);

-- ---------------------------------------------------------------------------------------------------------
-- Subscriptions, invoices, proofs, events
-- ---------------------------------------------------------------------------------------------------------
create type public.subscription_status as enum
  ('trialing', 'pending_payment', 'proof_received', 'active', 'past_due', 'suspended', 'canceled');

create table public.subscriptions (
  tenant_id             uuid primary key references public.organizations (id) on delete cascade,
  plan                  text references public.plans (code),
  quantity              int not null default 1 check (quantity between 1 and 5000),
  status                public.subscription_status not null default 'trialing',
  trial_ends_at         date,
  current_period_start  date,
  current_period_end    date,
  pending_plan          text references public.plans (code),      -- downgrade applied at the next renewal
  pending_quantity      int check (pending_quantity between 1 and 5000),
  cancel_at             date,
  provider              text not null default 'manual' check (provider in ('manual', 'stripe')),
  provider_ref          text,
  suspended_at          timestamptz,
  updated_at            timestamptz not null default now()
);
create index subscriptions_plan on public.subscriptions (plan);
create index subscriptions_pending_plan on public.subscriptions (pending_plan);

create sequence public.invoice_number_seq;

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.organizations (id) on delete cascade,
  number           text not null unique,
  reference        text not null unique,                          -- goes in the bank transfer description
  kind             text not null default 'subscription' check (kind in ('subscription', 'proration')),
  plan             text not null references public.plans (code),
  quantity         int not null check (quantity >= 1),
  unit_price       numeric(10, 2) not null,
  subtotal         numeric(10, 2) not null,
  discount         numeric(10, 2) not null default 0,
  tax              numeric(10, 2) not null default 0,
  total            numeric(10, 2) not null check (total >= 0),
  currency         text not null default 'USD',
  period_start     date not null,
  period_end       date not null check (period_end >= period_start),
  issued_on        date not null default current_date,
  due_on           date not null,
  status           text not null default 'open' check (status in ('open', 'proof_received', 'paid', 'void')),
  paid_at          timestamptz,
  paid_method      text check (paid_method in ('transfer', 'deposit', 'cash', 'cheque', 'stripe')),
  paid_reference   text check (char_length(paid_reference) <= 120),
  approved_by      uuid references auth.users (id) on delete set null,
  rejected_reason  text check (char_length(rejected_reason) <= 500),
  created_at       timestamptz not null default now(),
  unique (id, tenant_id)
);
create index invoices_tenant on public.invoices (tenant_id, issued_on desc);
create index invoices_open on public.invoices (status, due_on) where status in ('open', 'proof_received');
create index invoices_plan on public.invoices (plan);
create index invoices_approved_by on public.invoices (approved_by);

create table public.payment_proofs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  invoice_id   uuid not null,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 200),
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes   int not null check (size_bytes between 1 and 10485760),
  note         text not null default '' check (char_length(note) <= 500),
  uploaded_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete cascade,
  check (storage_path like tenant_id::text || '/%')
);
create index payment_proofs_invoice on public.payment_proofs (invoice_id);
create index payment_proofs_tenant on public.payment_proofs (tenant_id);
create index payment_proofs_uploaded_by on public.payment_proofs (uploaded_by);

-- What happened, for emails (sent by the daily job) and for the history. dedupe_key makes each notice unique.
create table public.billing_events (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references public.organizations (id) on delete cascade,
  invoice_id   uuid references public.invoices (id) on delete cascade,
  kind         text not null check (kind in ('trial_started', 'trial_ending', 'invoice_issued', 'proof_received', 'payment_approved',
                                             'proof_rejected', 'due_soon', 'past_due', 'suspended', 'reactivated', 'canceled', 'plan_changed')),
  dedupe_key   text not null,
  data         jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  notified_at  timestamptz,
  unique (tenant_id, dedupe_key)
);
create index billing_events_pending on public.billing_events (created_at) where notified_at is null;
create index billing_events_invoice on public.billing_events (invoice_id);

-- ---------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------
create or replace function public._billing_event(p_tenant uuid, p_kind text, p_key text, p_invoice uuid default null, p_data jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.billing_events (tenant_id, invoice_id, kind, dedupe_key, data)
  values (p_tenant, p_invoice, p_kind, p_key, coalesce(p_data, '{}'))
  on conflict (tenant_id, dedupe_key) do nothing;
$$;

-- Monthly price of a plan for a quantity: per-unit plans get the volume discount from the threshold.
create or replace function public.plan_price(p_plan text, p_quantity int)
returns table (unit_price numeric, subtotal numeric, discount numeric, tax numeric, total numeric)
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.plans where code = p_plan),
       s as (select * from public.billing_settings where id = 1),
       a as (
         select p.unit_price,
                case p.pricing when 'per_unit' then p.unit_price * greatest(p_quantity, 1) else p.unit_price end as subtotal,
                case when p.pricing = 'per_unit' and p_quantity >= s.volume_discount_from
                     then round(p.unit_price * p_quantity * s.volume_discount_pct / 100, 2) else 0 end as discount,
                s.tax_pct
         from p, s)
  select unit_price, subtotal, discount, round((subtotal - discount) * tax_pct / 100, 2),
         subtotal - discount + round((subtotal - discount) * tax_pct / 100, 2)
  from a
$$;
grant execute on function public.plan_price(text, int) to authenticated;

create or replace function public._issue_invoice(p_tenant uuid, p_plan text, p_quantity int, p_start date, p_end date,
                                                 p_due date, p_kind text default 'subscription', p_factor numeric default 1)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_price record; v_ref text;
begin
  select * into v_price from public.plan_price(p_plan, p_quantity);
  loop
    v_ref := 'RNW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    exit when not exists (select 1 from public.invoices where reference = v_ref);
  end loop;
  insert into public.invoices (tenant_id, number, reference, kind, plan, quantity, unit_price, subtotal, discount, tax, total,
                               period_start, period_end, due_on)
  values (p_tenant, 'RNW-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0'),
          v_ref, p_kind, p_plan, p_quantity, v_price.unit_price,
          round(v_price.subtotal * p_factor, 2), round(v_price.discount * p_factor, 2), round(v_price.tax * p_factor, 2),
          round(v_price.total * p_factor, 2), p_start, p_end, p_due)
  returning id into v_id;
  perform public._billing_event(p_tenant, 'invoice_issued', 'invoice_issued:' || v_id, v_id, '{}');
  return v_id;
end $$;

-- How many (non-sample) properties the organisation may have now.
create or replace function public.property_limit(p_tenant uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
           when s.status in ('suspended', 'canceled') then 0
           when s.plan is null then coalesce((select max(max_properties) from public.plans where active), 25)   -- trial
           when p.pricing = 'per_unit' then s.quantity
           else p.max_properties
         end
  from public.subscriptions s left join public.plans p on p.code = s.plan
  where s.tenant_id = p_tenant
$$;

create or replace function public.tenant_writable(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select status not in ('suspended', 'canceled') from public.subscriptions where tenant_id = p_tenant), true)
$$;

create or replace function public.properties_in_use(p_tenant uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.properties where tenant_id = p_tenant and not is_sample and archived_at is null
$$;

revoke all on function public._billing_event(uuid, text, text, uuid, jsonb), public._issue_invoice(uuid, text, int, date, date, date, text, numeric),
  public._require_platform_admin() from public, anon, authenticated;
revoke all on function public.property_limit(uuid), public.tenant_writable(uuid), public.properties_in_use(uuid) from public, anon;
grant execute on function public.property_limit(uuid), public.tenant_writable(uuid), public.properties_in_use(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------
-- Trial for every organisation (new and existing)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public._start_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_days int := (select trial_days from public.billing_settings where id = 1);
begin
  insert into public.subscriptions (tenant_id, status, trial_ends_at) values (new.id, 'trialing', current_date + v_days)
  on conflict (tenant_id) do nothing;
  perform public._billing_event(new.id, 'trial_started', 'trial_started', null, jsonb_build_object('ends', current_date + v_days));
  return new;
end $$;
create trigger organizations_trial after insert on public.organizations for each row execute function public._start_trial();
revoke all on function public._start_trial() from public, anon, authenticated;

insert into public.subscriptions (tenant_id, status, trial_ends_at)
select o.id, 'trialing', current_date + (select trial_days from public.billing_settings where id = 1)
from public.organizations o on conflict (tenant_id) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- Plan limit and suspension on writes
-- ---------------------------------------------------------------------------------------------------------
create or replace function public._enforce_property_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.tenant_writable(new.tenant_id) then raise exception 'subscription_suspended' using errcode = '42501'; end if;
  if not new.is_sample and public.properties_in_use(new.tenant_id) >= public.property_limit(new.tenant_id) then
    raise exception 'plan_limit' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger properties_plan_limit before insert on public.properties for each row execute function public._enforce_property_limit();
revoke all on function public._enforce_property_limit() from public, anon, authenticated;

-- Writes on tenant data require a non-suspended subscription (reads are always allowed).
drop policy properties_insert on public.properties;
drop policy properties_update on public.properties;
drop policy properties_delete on public.properties;
create policy properties_insert on public.properties for insert to authenticated
  with check (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));
create policy properties_update on public.properties for update to authenticated
  using (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id))
  with check (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));
create policy properties_delete on public.properties for delete to authenticated
  using (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));

drop policy licenses_insert on public.licenses;
drop policy licenses_update on public.licenses;
drop policy licenses_delete on public.licenses;
create policy licenses_insert on public.licenses for insert to authenticated
  with check (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));
create policy licenses_update on public.licenses for update to authenticated
  using (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id))
  with check (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));
create policy licenses_delete on public.licenses for delete to authenticated
  using (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));

drop policy checklist_insert on public.checklist_items;
drop policy checklist_update on public.checklist_items;
drop policy checklist_delete on public.checklist_items;
create policy checklist_insert on public.checklist_items for insert to authenticated
  with check (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));
create policy checklist_update on public.checklist_items for update to authenticated
  using (public.has_role(tenant_id, 'operator') and public.tenant_writable(tenant_id))
  with check (public.has_role(tenant_id, 'operator') and public.tenant_writable(tenant_id));
create policy checklist_delete on public.checklist_items for delete to authenticated
  using (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));

drop policy documents_insert on public.documents;
drop policy documents_delete on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (public.has_role(tenant_id, 'operator') and public.tenant_writable(tenant_id));
create policy documents_delete on public.documents for delete to authenticated
  using (public.has_role(tenant_id, 'admin') and public.tenant_writable(tenant_id));

-- ---------------------------------------------------------------------------------------------------------
-- Customer actions (owner chooses the plan; owner or admin uploads proofs)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.choose_plan(p_tenant uuid, p_plan text, p_quantity int default 1) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.subscriptions; v_p public.plans; v_set public.billing_settings;
  v_qty int; v_used int := public.properties_in_use(p_tenant); v_inv uuid; v_today date := current_date;
  v_old numeric; v_new numeric; v_days int; v_left int; v_start date;
begin
  perform public._require_user();
  if not public.has_role(p_tenant, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_p from public.plans where code = p_plan and active;
  if v_p.code is null then raise exception 'invalid_plan' using errcode = '22023'; end if;
  v_qty := case v_p.pricing when 'per_unit' then greatest(coalesce(p_quantity, 1), 1) else 1 end;
  if (v_p.pricing = 'per_unit' and v_qty < v_used) or (v_p.max_properties is not null and v_used > v_p.max_properties) then
    raise exception 'quantity_below_usage' using errcode = '23514';
  end if;
  select * into v_set from public.billing_settings where id = 1;
  select * into v_s from public.subscriptions where tenant_id = p_tenant for update;

  if v_s.status = 'active' and v_s.current_period_end >= v_today then
    -- Mid-period change: upgrades apply now with a prorated invoice; downgrades wait for the renewal.
    select total into v_old from public.plan_price(v_s.plan, v_s.quantity);
    select total into v_new from public.plan_price(p_plan, v_qty);
    if v_new > v_old then
      v_days := v_s.current_period_end - v_s.current_period_start + 1;
      v_left := v_s.current_period_end - v_today + 1;
      update public.subscriptions set plan = p_plan, quantity = v_qty, pending_plan = null, pending_quantity = null, updated_at = now()
       where tenant_id = p_tenant;
      v_inv := public._issue_invoice(p_tenant, p_plan, v_qty, v_today, v_s.current_period_end, v_today + v_set.invoice_due_days,
                                     'proration', (1 - v_old / v_new) * v_left / v_days);   -- amounts are rounded once, at the end
    else
      update public.subscriptions set pending_plan = p_plan, pending_quantity = v_qty, updated_at = now() where tenant_id = p_tenant;
    end if;
  else
    -- No paid period running: void open invoices and issue a new one for the next month.
    update public.invoices set status = 'void' where tenant_id = p_tenant and status in ('open', 'proof_received');
    v_start := case when v_s.status = 'trialing' and v_s.trial_ends_at >= v_today then v_s.trial_ends_at + 1 else v_today end;
    update public.subscriptions set plan = p_plan, quantity = v_qty, pending_plan = null, pending_quantity = null,
           status = case when status in ('trialing', 'suspended') then status else 'pending_payment' end, updated_at = now()
     where tenant_id = p_tenant;
    v_inv := public._issue_invoice(p_tenant, p_plan, v_qty, v_start, (v_start + interval '1 month' - interval '1 day')::date,
                                   case when v_s.status = 'trialing' and v_s.trial_ends_at >= v_today then v_s.trial_ends_at
                                        else v_today + v_set.invoice_due_days end);
  end if;
  perform public._audit(p_tenant, 'billing.plan_chosen', 'subscription', p_tenant::text, jsonb_build_object('plan', p_plan, 'quantity', v_qty));
  perform public._billing_event(p_tenant, 'plan_changed', 'plan_changed:' || now()::text, v_inv, jsonb_build_object('plan', p_plan, 'quantity', v_qty));
  return v_inv;
end $$;

create or replace function public.submit_payment_proof(p_invoice uuid, p_path text, p_file_name text, p_mime text, p_size int, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices; v_id uuid;
begin
  perform public._require_user();
  select * into v_inv from public.invoices where id = p_invoice for update;
  if v_inv.id is null or not public.has_role(v_inv.tenant_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_inv.status not in ('open', 'proof_received') then raise exception 'invoice_closed' using errcode = '22023'; end if;
  insert into public.payment_proofs (tenant_id, invoice_id, storage_path, file_name, mime_type, size_bytes, note, uploaded_by)
  values (v_inv.tenant_id, v_inv.id, p_path, left(p_file_name, 200), p_mime, p_size, left(coalesce(p_note, ''), 500), auth.uid())
  returning id into v_id;
  update public.invoices set status = 'proof_received', rejected_reason = null where id = v_inv.id;
  update public.subscriptions set status = 'proof_received', updated_at = now()
   where tenant_id = v_inv.tenant_id and status in ('pending_payment', 'past_due');
  perform public._audit(v_inv.tenant_id, 'billing.proof_uploaded', 'invoice', v_inv.number, '{}');
  perform public._billing_event(v_inv.tenant_id, 'proof_received', 'proof_received:' || v_id, v_inv.id, '{}');
  return v_id;
end $$;

create or replace function public.cancel_subscription(p_tenant uuid, p_cancel boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_user();
  if not public.has_role(p_tenant, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.subscriptions
     set cancel_at = case when p_cancel then coalesce(current_period_end, current_date) end, updated_at = now()
   where tenant_id = p_tenant;
  perform public._audit(p_tenant, case when p_cancel then 'billing.cancel_requested' else 'billing.cancel_withdrawn' end, 'subscription', p_tenant::text, '{}');
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Platform admin actions
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.platform_approve_payment(p_invoice uuid, p_method text, p_reference text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices; v_s public.subscriptions;
begin
  perform public._require_platform_admin();
  select * into v_inv from public.invoices where id = p_invoice for update;
  if v_inv.id is null or v_inv.status not in ('open', 'proof_received') then raise exception 'invoice_closed' using errcode = '22023'; end if;
  if p_method not in ('transfer', 'deposit', 'cash', 'cheque') then raise exception 'invalid_method' using errcode = '22023'; end if;
  update public.invoices set status = 'paid', paid_at = now(), paid_method = p_method, paid_reference = left(nullif(p_reference, ''), 120),
         approved_by = auth.uid(), rejected_reason = null where id = v_inv.id;
  select * into v_s from public.subscriptions where tenant_id = v_inv.tenant_id for update;
  if v_inv.kind = 'subscription' then
    update public.subscriptions
       set status = (case when v_inv.period_start > current_date and status = 'trialing' then 'trialing' else 'active' end)::public.subscription_status,
           current_period_start = v_inv.period_start, current_period_end = v_inv.period_end,
           plan = v_inv.plan, quantity = v_inv.quantity, suspended_at = null, updated_at = now()
     where tenant_id = v_inv.tenant_id;
  else
    update public.subscriptions set status = 'active', suspended_at = null, updated_at = now()
     where tenant_id = v_inv.tenant_id and current_period_end >= current_date;
  end if;
  -- Other unpaid invoices left from before are no longer due once a later period is paid.
  update public.invoices set status = 'void'
   where tenant_id = v_inv.tenant_id and status in ('open', 'proof_received') and kind = 'subscription' and period_end < v_inv.period_start;
  perform public._audit(v_inv.tenant_id, 'billing.payment_approved', 'invoice', v_inv.number,
                        jsonb_build_object('total', v_inv.total, 'method', p_method));
  perform public._billing_event(v_inv.tenant_id, 'payment_approved', 'payment_approved:' || v_inv.id, v_inv.id, '{}');
  if v_s.status = 'suspended' then
    perform public._billing_event(v_inv.tenant_id, 'reactivated', 'reactivated:' || v_inv.id, v_inv.id, '{}');
  end if;
end $$;

create or replace function public.platform_reject_proof(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices;
begin
  perform public._require_platform_admin();
  select * into v_inv from public.invoices where id = p_invoice for update;
  if v_inv.id is null or v_inv.status <> 'proof_received' then raise exception 'invoice_closed' using errcode = '22023'; end if;
  update public.invoices set status = 'open', rejected_reason = left(coalesce(p_reason, ''), 500) where id = v_inv.id;
  update public.subscriptions
     set status = case when current_period_end >= current_date then 'active'
                       when v_inv.due_on < current_date then 'past_due' else 'pending_payment' end::public.subscription_status,
         updated_at = now()
   where tenant_id = v_inv.tenant_id and status = 'proof_received';
  perform public._audit(v_inv.tenant_id, 'billing.proof_rejected', 'invoice', v_inv.number, jsonb_build_object('reason', p_reason));
  perform public._billing_event(v_inv.tenant_id, 'proof_rejected', 'proof_rejected:' || v_inv.id || ':' || now()::text, v_inv.id,
                                jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.platform_set_suspended(p_tenant uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_platform_admin();
  update public.subscriptions
     set status = case when p_suspended then 'suspended'
                       when current_period_end >= current_date then 'active'
                       when trial_ends_at >= current_date and plan is null then 'trialing'
                       else 'pending_payment' end::public.subscription_status,
         suspended_at = case when p_suspended then now() end, updated_at = now()
   where tenant_id = p_tenant;
  perform public._audit(p_tenant, case when p_suspended then 'billing.suspended_by_platform' else 'billing.reactivated_by_platform' end, 'subscription', p_tenant::text, '{}');
  perform public._billing_event(p_tenant, case when p_suspended then 'suspended' else 'reactivated' end,
                                case when p_suspended then 'suspended:' else 'reactivated:' end || now()::text, null, '{}');
end $$;

create or replace function public.platform_update_settings(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_platform_admin();
  update public.billing_settings set
    trial_days = coalesce((p ->> 'trial_days')::int, trial_days),
    grace_days = coalesce((p ->> 'grace_days')::int, grace_days),
    invoice_due_days = coalesce((p ->> 'invoice_due_days')::int, invoice_due_days),
    renewal_notice_days = coalesce((p ->> 'renewal_notice_days')::int, renewal_notice_days),
    volume_discount_from = coalesce((p ->> 'volume_discount_from')::int, volume_discount_from),
    volume_discount_pct = coalesce((p ->> 'volume_discount_pct')::numeric, volume_discount_pct),
    tax_pct = coalesce((p ->> 'tax_pct')::numeric, tax_pct),
    tax_label = coalesce(p ->> 'tax_label', tax_label),
    payee_name = coalesce(p ->> 'payee_name', payee_name),
    payee_address = coalesce(p ->> 'payee_address', payee_address),
    bank_details = coalesce(p ->> 'bank_details', bank_details),
    payment_note = coalesce(p ->> 'payment_note', payment_note),
    support_email = coalesce(p ->> 'support_email', support_email),
    updated_at = now(), updated_by = auth.uid()
  where id = 1;
end $$;

create or replace function public.platform_update_plan(p_code text, p_unit_price numeric, p_max_properties int, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_platform_admin();
  update public.plans set unit_price = p_unit_price, max_properties = p_max_properties, active = p_active where code = p_code;
  if not found then raise exception 'invalid_plan' using errcode = '22023'; end if;
end $$;

-- Numbers for the operator dashboard.
create or replace function public.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public._require_platform_admin();
  select jsonb_build_object(
    'mrr', coalesce((select sum(pp.total) from public.subscriptions s, lateral public.plan_price(s.plan, s.quantity) pp
                      where s.status in ('active', 'proof_received', 'past_due') and s.plan is not null), 0),
    'active', (select count(*) from public.subscriptions where status = 'active'),
    'trialing', (select count(*) from public.subscriptions where status = 'trialing'),
    'pending', (select count(*) from public.subscriptions where status in ('pending_payment', 'proof_received')),
    'past_due', (select count(*) from public.subscriptions where status = 'past_due'),
    'suspended', (select count(*) from public.subscriptions where status = 'suspended'),
    'canceled_30d', (select count(*) from public.billing_events where kind = 'canceled' and created_at > now() - interval '30 days'),
    'open_amount', coalesce((select sum(total) from public.invoices where status in ('open', 'proof_received')), 0),
    'overdue_amount', coalesce((select sum(total) from public.invoices where status = 'open' and due_on < current_date), 0),
    'proofs_waiting', (select count(*) from public.invoices where status = 'proof_received'),
    'paid_30d', coalesce((select sum(total) from public.invoices where status = 'paid' and paid_at > now() - interval '30 days'), 0)
  ) into r;
  return r;
end $$;

create or replace function public.platform_customers()
returns table (tenant_id uuid, organization text, owner_email text, status public.subscription_status, plan text, quantity int,
               properties int, trial_ends_at date, current_period_end date, cancel_at date, open_total numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_platform_admin();
  return query
  select s.tenant_id, o.name,
         (select pr.email from public.memberships m join public.profiles pr on pr.id = m.user_id
           where m.tenant_id = s.tenant_id and m.role = 'owner' order by m.created_at limit 1),
         s.status, s.plan, s.quantity, public.properties_in_use(s.tenant_id), s.trial_ends_at, s.current_period_end, s.cancel_at,
         coalesce((select sum(i.total) from public.invoices i where i.tenant_id = s.tenant_id and i.status in ('open', 'proof_received')), 0)
  from public.subscriptions s join public.organizations o on o.id = s.tenant_id
  order by o.name;
end $$;

revoke all on function public.choose_plan(uuid, text, int), public.submit_payment_proof(uuid, text, text, text, int, text),
  public.cancel_subscription(uuid, boolean), public.platform_approve_payment(uuid, text, text), public.platform_reject_proof(uuid, text),
  public.platform_set_suspended(uuid, boolean), public.platform_update_settings(jsonb), public.platform_update_plan(text, numeric, int, boolean),
  public.platform_overview(), public.platform_customers() from public, anon;
grant execute on function public.choose_plan(uuid, text, int), public.submit_payment_proof(uuid, text, text, text, int, text),
  public.cancel_subscription(uuid, boolean), public.platform_approve_payment(uuid, text, text), public.platform_reject_proof(uuid, text),
  public.platform_set_suspended(uuid, boolean), public.platform_update_settings(jsonb), public.platform_update_plan(text, numeric, int, boolean),
  public.platform_overview(), public.platform_customers() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Daily job (service role): renewals, trial end, overdue, suspension, cancellation, and the notices to email.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.billing_tick(p_today date default current_date) returns int
language plpgsql security definer set search_path = '' as $$
declare s record; v_set public.billing_settings; n int := 0; v_next_start date; v_plan text; v_qty int; v_oldest date;
begin
  select * into v_set from public.billing_settings where id = 1;
  for s in select * from public.subscriptions for update loop
    -- Trial ending soon (3 days) and trial over.
    if s.status = 'trialing' and s.trial_ends_at - p_today = 3 then
      perform public._billing_event(s.tenant_id, 'trial_ending', 'trial_ending:' || s.trial_ends_at, null, jsonb_build_object('ends', s.trial_ends_at));
    end if;
    if s.status = 'trialing' and s.trial_ends_at < p_today then
      if s.current_period_end is not null and s.current_period_end >= p_today then
        update public.subscriptions set status = 'active', updated_at = now() where tenant_id = s.tenant_id;
      elsif exists (select 1 from public.invoices where tenant_id = s.tenant_id and status = 'proof_received') then
        update public.subscriptions set status = 'proof_received', updated_at = now() where tenant_id = s.tenant_id;
      else
        update public.subscriptions set status = 'pending_payment', updated_at = now() where tenant_id = s.tenant_id;
      end if;
      n := n + 1;
      continue;
    end if;

    -- Cancellation at the end of the paid period.
    if s.cancel_at is not null and s.cancel_at < p_today and s.status <> 'canceled' then
      update public.subscriptions set status = 'canceled', updated_at = now() where tenant_id = s.tenant_id;
      update public.invoices set status = 'void' where tenant_id = s.tenant_id and status in ('open', 'proof_received');
      perform public._billing_event(s.tenant_id, 'canceled', 'canceled:' || s.cancel_at, null, '{}');
      n := n + 1;
      continue;
    end if;

    -- Renewal invoice a few days before the paid period ends (applying a scheduled downgrade).
    if s.status in ('active', 'proof_received', 'past_due') and s.current_period_end is not null and s.cancel_at is null
       and s.current_period_end - p_today <= v_set.renewal_notice_days and s.plan is not null then
      v_next_start := s.current_period_end + 1;
      if not exists (select 1 from public.invoices where tenant_id = s.tenant_id and kind = 'subscription'
                       and period_start = v_next_start and status <> 'void') then
        v_plan := coalesce(s.pending_plan, s.plan); v_qty := coalesce(s.pending_quantity, s.quantity);
        perform public._issue_invoice(s.tenant_id, v_plan, v_qty, v_next_start,
                                      (v_next_start + interval '1 month' - interval '1 day')::date, s.current_period_end);
        update public.subscriptions set plan = v_plan, quantity = v_qty, pending_plan = null, pending_quantity = null where tenant_id = s.tenant_id;
        n := n + 1;
      end if;
    end if;

    -- Paid period over without a newer payment → past due.
    if s.status = 'active' and s.current_period_end < p_today then
      update public.subscriptions set status = 'past_due', updated_at = now() where tenant_id = s.tenant_id;
      perform public._billing_event(s.tenant_id, 'past_due', 'past_due:' || s.current_period_end, null, '{}');
      n := n + 1;
    end if;

    -- Reminders: 3 days before an invoice is due.
    perform public._billing_event(s.tenant_id, 'due_soon', 'due_soon:' || i.id, i.id, jsonb_build_object('due_on', i.due_on))
      from public.invoices i where i.tenant_id = s.tenant_id and i.status = 'open' and i.due_on - p_today = 3;

    -- Suspension after the grace period: the oldest unpaid invoice (no proof under review) is too old,
    -- or the trial ended long ago without choosing a plan.
    select min(due_on) into v_oldest from public.invoices where tenant_id = s.tenant_id and status = 'open';
    if s.status in ('pending_payment', 'past_due')
       and ((v_oldest is not null and v_oldest + v_set.grace_days < p_today)
            or (v_oldest is null and s.plan is null and s.trial_ends_at + v_set.grace_days < p_today)
            or (v_oldest is null and s.current_period_end is not null and s.current_period_end + v_set.grace_days < p_today
                and not exists (select 1 from public.invoices where tenant_id = s.tenant_id and status = 'proof_received'))) then
      update public.subscriptions set status = 'suspended', suspended_at = now(), updated_at = now() where tenant_id = s.tenant_id;
      perform public._billing_event(s.tenant_id, 'suspended', 'suspended:' || coalesce(v_oldest, s.trial_ends_at), null, '{}');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Notices not yet emailed, with the owners (and admins) who should get them. Service role only.
create or replace function public.pending_billing_notices()
returns table (id bigint, tenant_id uuid, organization text, kind text, data jsonb, invoice_number text, invoice_reference text,
               invoice_total numeric, invoice_due date, recipients jsonb)
language sql stable security definer set search_path = '' as $$
  select e.id, e.tenant_id, o.name, e.kind, e.data, i.number, i.reference, i.total, i.due_on,
         (select coalesce(jsonb_agg(jsonb_build_object('email', p.email, 'name', p.full_name, 'locale', p.locale)), '[]')
            from public.memberships m join public.profiles p on p.id = m.user_id
           where m.tenant_id = e.tenant_id and m.role in ('owner', 'admin'))
  from public.billing_events e join public.organizations o on o.id = e.tenant_id
  left join public.invoices i on i.id = e.invoice_id
  where e.notified_at is null and e.kind not in ('trial_started', 'plan_changed') and e.created_at > now() - interval '7 days'
  order by e.id
$$;

create or replace function public.mark_billing_notice_sent(p_id bigint) returns void
language sql security definer set search_path = '' as $$
  update public.billing_events set notified_at = now() where id = p_id;
$$;
revoke all on function public.billing_tick(date), public.pending_billing_notices(), public.mark_billing_notice_sent(bigint) from public, anon, authenticated;
grant execute on function public.billing_tick(date), public.pending_billing_notices(), public.mark_billing_notice_sent(bigint) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- Row Level Security: customers read their own billing (owner and admin); platform admins read everything.
-- All writes go through the functions above.
-- ---------------------------------------------------------------------------------------------------------
alter table public.billing_settings enable row level security;
alter table public.plans            enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.invoices         enable row level security;
alter table public.payment_proofs   enable row level security;
alter table public.billing_events   enable row level security;
revoke all on public.billing_settings, public.plans, public.subscriptions, public.invoices, public.payment_proofs, public.billing_events
  from anon, authenticated;
grant select on public.billing_settings, public.plans, public.subscriptions, public.invoices, public.payment_proofs, public.billing_events
  to authenticated;

create policy billing_settings_read on public.billing_settings for select to authenticated using (true);
create policy plans_read on public.plans for select to authenticated using (active or public.is_platform_admin());
-- Every member sees the subscription status (to know if the account is suspended); billing details are for admins.
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.is_member(tenant_id) or public.is_platform_admin());
create policy invoices_read on public.invoices for select to authenticated
  using (public.has_role(tenant_id, 'admin') or public.is_platform_admin());
create policy payment_proofs_read on public.payment_proofs for select to authenticated
  using (public.has_role(tenant_id, 'admin') or public.is_platform_admin());
create policy billing_events_read on public.billing_events for select to authenticated
  using (public.has_role(tenant_id, 'admin') or public.is_platform_admin());

-- Platform admins see customer organisation names (for the billing dashboard and invoices).
drop policy organizations_read on public.organizations;
create policy organizations_read on public.organizations for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());

-- >>> supabase/migrations/20261123000008_billing_storage.sql
-- Renewly · Private storage for payment proofs: billing/<tenant_id>/<random id>/<file name>.
-- Upload and read: owners and admins of that organisation; read: platform admins. Nobody deletes proofs
-- through the API (they are part of the payment record).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('billing', 'billing', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy billing_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'billing' and (public.has_role(public._path_tenant(name), 'admin') or public.is_platform_admin()));
create policy billing_objects_insert on storage.objects for insert to authenticated
  -- Suspended organisations can still upload: paying is how they get reactivated.
  with check (bucket_id = 'billing' and public.has_role(public._path_tenant(name), 'admin'));

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261123000007', 'billing'), ('20261123000008', 'billing_storage')
on conflict (version) do nothing;
commit;

-- Make yourself platform admin: replace the email with the one you use to sign in to Renewly, then run this line.
-- insert into public.platform_admins (user_id) select id from auth.users where email = 'TU-CORREO@ejemplo.com';

-- Check: should list the 6 billing tables
select string_agg(tablename, ', ' order by tablename) as billing_tables from pg_tables where schemaname = 'public'
  and tablename in ('billing_settings', 'plans', 'subscriptions', 'invoices', 'payment_proofs', 'billing_events');
