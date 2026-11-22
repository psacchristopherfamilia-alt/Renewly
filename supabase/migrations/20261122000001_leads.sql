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
