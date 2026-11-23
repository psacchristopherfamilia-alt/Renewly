-- Renewly · Private storage for inspection photos, insurance, receipts and other documents.
-- Files live at documents/<tenant_id>/<random id>/<file name>. The first folder decides who may touch them:
--   read: any member of that organisation · upload: operator and up · delete: admin and up.
-- Files are never public: the app serves them with short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Tenant id from the first folder of an object path, or null when it is not a valid uuid.
create or replace function public._path_tenant(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end $$;
grant execute on function public._path_tenant(text) to authenticated;

create policy documents_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_member(public._path_tenant(name)));
create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.has_role(public._path_tenant(name), 'operator'));
create policy documents_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.has_role(public._path_tenant(name), 'admin'));
