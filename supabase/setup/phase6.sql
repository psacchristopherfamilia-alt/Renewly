-- Renewly · Phase 6 for the Supabase project (ref mawdjmefsqlshiksofik). Paste into SQL Editor → Run.
begin;
-- Renewly · The Department of Tourism Regulations opened its 2027 Accommodation License Platform on
-- 20 Nov 2026 (NewslineTCI). Renewals of accommodation licences are filed there.
update public.license_types
   set portal_name = 'Accommodation License Platform (Tourism Regulations)',
       portal_url  = 'https://regcitz.gov.tc/WebUIFramework/login',
       notes = notes || ' Desde el ciclo 2027 la solicitud se presenta en la plataforma en línea del Departamento.'
 where code = 'accommodation';
insert into supabase_migrations.schema_migrations (version, name) values ('20261123000010', 'dtr_portal')
on conflict (version) do nothing;
commit;

-- Check: should show the new portal
select portal_name, portal_url from public.license_types where code = 'accommodation';
