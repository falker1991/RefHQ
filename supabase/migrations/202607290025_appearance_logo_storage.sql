-- Law18Ref v0.5.31 — site-owner appearance logo uploads

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'appearance-logos',
  'appearance-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "site owner uploads appearance logos" on storage.objects;
create policy "site owner uploads appearance logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'appearance-logos' and public.is_site_owner());

drop policy if exists "site owner updates appearance logos" on storage.objects;
create policy "site owner updates appearance logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'appearance-logos' and public.is_site_owner())
  with check (bucket_id = 'appearance-logos' and public.is_site_owner());

drop policy if exists "site owner deletes appearance logos" on storage.objects;
create policy "site owner deletes appearance logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'appearance-logos' and public.is_site_owner());
