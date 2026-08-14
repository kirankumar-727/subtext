-- Subtext Media: migration-managed Storage buckets and object policies.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values
  (
    'media-originals',
    'media-originals',
    false,
    26214400,
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'audio/mpeg',
      'audio/mp4',
      'video/mp4',
      'application/pdf'
    ]::text[]
  ),
  (
    'media-public',
    'media-public',
    true,
    10485760,
    array[
      'image/jpeg',
      'image/webp',
      'image/avif',
      'audio/mpeg',
      'audio/mp4',
      'video/mp4',
      'application/pdf'
    ]::text[]
  )
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy media_buckets_admin_select
on storage.buckets for select to authenticated
using (
  id in ('media-originals', 'media-public')
  and (select private.is_admin())
);

create policy media_public_bucket_anon_select
on storage.buckets for select to anon
using (id = 'media-public');

create policy media_originals_admin_select
on storage.objects for select to authenticated
using (
  bucket_id = 'media-originals'
  and (select private.is_admin())
);

create policy media_originals_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'media-originals'
  and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$'
  and name !~ '(^|/)\.\.(/|$)'
  and (select private.is_admin())
);

create policy media_originals_admin_delete_unreferenced
on storage.objects for delete to authenticated
using (
  bucket_id = 'media-originals'
  and (select private.is_admin())
  and not exists (
    select 1
    from public.media_assets ma
    where ma.original_storage_key = name
  )
);

create policy media_public_anon_select
on storage.objects for select to anon, authenticated
using (bucket_id = 'media-public');

create policy media_public_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'media-public'
  and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$'
  and name !~ '(^|/)\.\.(/|$)'
  and (select private.is_admin())
);

create policy media_public_admin_delete_unreferenced
on storage.objects for delete to authenticated
using (
  bucket_id = 'media-public'
  and (select private.is_admin())
  and not exists (
    select 1
    from public.media_variants mv
    where mv.storage_key = name
  )
);
