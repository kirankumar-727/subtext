-- Keep public media metadata useful to the public renderer without turning the
-- published projection into a Storage path directory. The privileged signer
-- resolves the variant UUID to its key through service-role access instead.

drop view if exists public.published_media;

create view public.published_media
with (security_barrier = true)
as
select
  am.id as article_media_id,
  a.id as article_id,
  am.revision_id,
  am.role,
  am.position,
  coalesce(am.alt_text, ma.default_alt_text) as alt_text,
  coalesce(am.caption, ma.default_caption) as caption,
  coalesce(am.credit_override, ma.credit_text) as credit_text,
  ma.id as media_asset_id,
  ma.kind,
  ma.width as original_width,
  ma.height as original_height,
  ma.focal_x,
  ma.focal_y,
  mv.id as variant_id,
  mv.variant_name,
  mv.mime_type,
  mv.format,
  mv.width,
  mv.height,
  mv.byte_size,
  mv.checksum_sha256
from public.article_media am
join public.articles a on a.published_revision_id = am.revision_id
join public.authors au on au.id = a.author_id and au.is_active
join public.pillars p on p.id = a.primary_pillar_id and p.is_active
join public.media_assets ma on ma.id = am.media_asset_id
join public.media_variants mv on mv.media_asset_id = ma.id and mv.is_public
where a.status in ('published_pending_verification', 'published')
  and ma.processing_status = 'ready'
  and ma.rights_status not in ('unknown', 'restricted');

comment on view public.published_media is
  'Public derivative metadata only; Storage object paths are resolved only by the privileged public-media signer.';

grant select on public.published_media to anon, authenticated;
