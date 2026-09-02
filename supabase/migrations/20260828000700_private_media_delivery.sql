-- SubText CMS: keep derivative bytes private and issue access only for the
-- currently published, rights-cleared projection.
--
-- Storage's public bucket flag bypasses database-row authorization. The
-- delivery bucket is therefore private even for variants whose metadata says
-- is_public = true. Public pages ask the controlled application route for a
-- variant ID; the route verifies the published projection with the server-only
-- service-role boundary and requests a short-lived signed URL. Editors retain
-- authenticated access for previews and rights remediation.

update storage.buckets
set public = false
where id = 'media-public';

drop policy if exists media_public_bucket_anon_select on storage.buckets;
revoke select on storage.buckets, storage.objects from anon;
drop policy if exists media_public_anon_select on storage.objects;

-- No anonymous Storage SELECT policy is intentional. Public requests are
-- authorized by the application route and the service-role Storage client;
-- allowing anon SELECT here would also allow object listing through the Storage
-- API, even if the bucket itself were private.

create policy media_public_admin_select
on storage.objects for select to authenticated
using (
  bucket_id = 'media-public'
  and (select private.is_admin())
);

comment on table storage.buckets is
  'Media delivery is private. Public bytes are exposed only through signed URLs authorized by the published media projection.';
