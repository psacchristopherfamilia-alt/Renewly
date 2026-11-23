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
