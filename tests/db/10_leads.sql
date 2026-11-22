\set ON_ERROR_STOP 1
-- Leads are private to the platform: neither visitors nor signed-in users can read or write them directly.
insert into public.leads (name, email, properties, ip_hash) values ('Ana', 'ana@villa.tc', 4, 'h');
do $$ begin
  begin perform 1 from public.leads; exception when others then null; end;
end $$;
set role anon;
do $$ begin
  begin perform count(*) from public.leads; raise exception 'anon read leads';
  exception when insufficient_privilege then null; end;
  begin insert into public.leads (name, email, properties, ip_hash) values ('Bot', 'b@b.co', 1, 'x'); raise exception 'anon wrote leads';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
do $$ begin
  begin perform count(*) from public.leads; raise exception 'authenticated read leads';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
