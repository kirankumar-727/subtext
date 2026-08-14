-- Destructive development rollback for Milestone 2.
-- This intentionally refuses to remove Storage bucket metadata while objects exist.

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id in ('media-originals', 'media-public')
  ) then
    raise exception 'Cannot roll back Subtext media buckets while Storage objects exist';
  end if;
end;
$$;

drop policy if exists media_buckets_admin_select on storage.buckets;
drop policy if exists media_public_bucket_anon_select on storage.buckets;
drop policy if exists media_originals_admin_select on storage.objects;
drop policy if exists media_originals_admin_insert on storage.objects;
drop policy if exists media_originals_admin_delete_unreferenced on storage.objects;
drop policy if exists media_public_anon_select on storage.objects;
drop policy if exists media_public_admin_insert on storage.objects;
drop policy if exists media_public_admin_delete_unreferenced on storage.objects;

delete from storage.buckets where id in ('media-originals', 'media-public');

drop view if exists public.published_featured_collections cascade;
drop view if exists public.public_site_settings cascade;
drop view if exists public.public_redirects cascade;
drop view if exists public.published_media cascade;
drop view if exists public.published_citations cascade;
drop view if exists public.published_articles cascade;

drop function if exists public.append_publication_event(uuid, text, public.publication_event_level, text, jsonb) cascade;
drop function if exists public.extend_publication_job_lease(uuid, text, integer) cascade;
drop function if exists public.commit_publication_job(uuid, text) cascade;
drop function if exists public.mark_publication_job_verifying(uuid, text) cascade;
drop function if exists public.succeed_publication_job(uuid, text, jsonb) cascade;
drop function if exists public.fail_publication_job(uuid, text, text, jsonb, boolean) cascade;
drop function if exists public.create_story_draft(text, text, text, text, text, uuid, uuid, integer, integer) cascade;
drop function if exists public.save_story_draft(uuid, bigint, text, text, text, text, text, uuid, uuid, uuid[], uuid[], uuid, text, text, integer, integer) cascade;
drop function if exists public.request_story_publication(uuid, public.publication_action, uuid, uuid) cascade;
drop function if exists public.claim_publication_jobs(text, integer, integer) cascade;
drop function if exists public.search_published_articles(text, text, integer, integer) cascade;

drop table if exists
  public.audit_logs,
  public.search_projection,
  public.publication_events,
  public.publication_jobs,
  public.featured_collection_items,
  public.featured_collections,
  public.site_settings,
  public.slug_history,
  public.redirects,
  public.article_media,
  public.media_variants,
  public.media_assets,
  public.citations,
  public.source_notes,
  public.sources,
  public.article_tags,
  public.article_revisions,
  public.articles,
  public.tags,
  public.categories,
  public.pillars,
  public.authors
cascade;

drop schema if exists private cascade;

drop type if exists public.collection_status;
drop type if exists public.redirect_kind;
drop type if exists public.publication_event_level;
drop type if exists public.publication_job_status;
drop type if exists public.publication_action;
drop type if exists public.media_role;
drop type if exists public.media_rights_status;
drop type if exists public.media_processing_status;
drop type if exists public.media_kind;
drop type if exists public.source_type;
drop type if exists public.revision_kind;
drop type if exists public.article_status;
