-- Restore the original save_story_draft signature after the temporary multi-media
-- experiment migration. Multi-media drafts use save_story_draft_with_media instead.

drop function if exists public.save_story_draft(
  uuid, bigint, text, text, text, text, text, uuid, uuid, uuid[], uuid[],
  uuid, uuid[], text, text, integer, integer
);

create or replace function public.save_story_draft(
  p_article_id uuid,
  p_expected_row_version bigint,
  p_title text,
  p_slug text,
  p_excerpt text,
  p_body_markdown text,
  p_body_plain_text text,
  p_pillar_id uuid,
  p_category_id uuid,
  p_tag_ids uuid[],
  p_source_ids uuid[],
  p_cover_media_asset_id uuid,
  p_seo_title text,
  p_seo_description text,
  p_word_count integer,
  p_reading_time_minutes integer
)
returns table (article_id uuid, revision_id uuid, row_version bigint, saved_at timestamptz)
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  locked_article public.articles%rowtype;
  new_revision_id uuid;
  saved_row_version bigint;
  saved_at timestamptz;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'Admin authorization required';
  end if;

  select article.* into locked_article from public.articles as article
  where article.id = p_article_id for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Story not found';
  end if;

  if locked_article.row_version <> p_expected_row_version then
    raise exception using errcode = '40001', message = 'Story changed in another session';
  end if;

  insert into public.article_revisions (
    article_id, revision_kind, supersedes_revision_id, title, dek,
    body_markdown, body_plain_text, word_count, reading_time_minutes,
    seo_title, seo_description, created_by
  )
  values (
    p_article_id, 'draft', locked_article.current_draft_revision_id, p_title,
    nullif(p_excerpt, ''), p_body_markdown, p_body_plain_text, p_word_count,
    p_reading_time_minutes, nullif(p_seo_title, ''), nullif(p_seo_description, ''),
    auth.uid()
  )
  returning id into new_revision_id;

  update public.articles as article
  set primary_pillar_id = p_pillar_id, category_id = p_category_id,
      canonical_slug = p_slug, current_draft_revision_id = new_revision_id,
      updated_by = auth.uid()
  where article.id = p_article_id
  returning article.row_version, article.updated_at into saved_row_version, saved_at;

  delete from public.article_tags where article_id = p_article_id;

  insert into public.article_tags (article_id, tag_id)
  select p_article_id, selected_tag.tag_id
  from unnest(coalesce(p_tag_ids, '{}'::uuid[])) as selected_tag(tag_id)
  on conflict do nothing;

  insert into public.citations (
    revision_id, source_id, ordinal, citation_key, citation_text, is_public
  )
  select new_revision_id, selected_source.source_id,
         selected_source.ordinal::integer, 'src-' || selected_source.ordinal,
         concat_ws(', ', nullif(source.author_text, ''), source.title, nullif(source.publisher, '')),
         true
  from unnest(coalesce(p_source_ids, '{}'::uuid[]))
    with ordinality as selected_source(source_id, ordinal)
  join public.sources as source on source.id = selected_source.source_id;

  if p_cover_media_asset_id is not null then
    insert into public.article_media (revision_id, media_asset_id, role, position)
    values (new_revision_id, p_cover_media_asset_id, 'hero', 0);
  end if;

  return query select p_article_id, new_revision_id, saved_row_version, saved_at;
end;
$$;