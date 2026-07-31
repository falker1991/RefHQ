-- Law18Ref v0.8.0: organization-controlled logos.

alter table public.organizations
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos',
  'organization-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "organization admins upload organization logos" on storage.objects;
create policy "organization admins upload organization logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'organization-logos'
    and (
      public.is_site_owner()
      or public.has_org_role(
        ((storage.foldername(name))[1])::uuid,
        array['organization_admin']::public.membership_role[]
      )
    )
  );

drop policy if exists "organization admins update organization logos" on storage.objects;
create policy "organization admins update organization logos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'organization-logos'
    and (
      public.is_site_owner()
      or public.has_org_role(
        ((storage.foldername(name))[1])::uuid,
        array['organization_admin']::public.membership_role[]
      )
    )
  )
  with check (
    bucket_id = 'organization-logos'
    and (
      public.is_site_owner()
      or public.has_org_role(
        ((storage.foldername(name))[1])::uuid,
        array['organization_admin']::public.membership_role[]
      )
    )
  );

drop policy if exists "organization admins delete organization logos" on storage.objects;
create policy "organization admins delete organization logos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'organization-logos'
    and (
      public.is_site_owner()
      or public.has_org_role(
        ((storage.foldername(name))[1])::uuid,
        array['organization_admin']::public.membership_role[]
      )
    )
  );
