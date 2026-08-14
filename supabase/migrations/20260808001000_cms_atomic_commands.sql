-- M4 additive contract: atomic CMS commands over the frozen M2 tables.
-- No table, enum, relationship, or existing RLS policy is changed.

create or replace function private.ensure_founder_author()
returns uuid
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  author_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'Admin authorization required';
  end if;

  select a.id into author_id
  from public.authors a
  where a.auth_user_id = current_user_id;

  if author_id is not null then return author_id; end if;

  update public.authors
  set auth_user_id = current_user_id, is_active = true
  where slug = 'subtext-media' and auth_user_id is null
  returning id into author_id;

  if author_id is null then
    insert into public.authors (auth_user_id, name, slug)
    values (current_user_id, 'Subtext Media', 'subtext-media')
    returning id into author_id;
  end if;

  return author_id;
end;
$$;

create or replace function private.attach_revision_relations(
  target_revision_id uuid,
  target_article_id uuid,
  selected_tag_ids uuid[],
  selected_source_ids uuid[],
  cover_media_asset_id uuid
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.article_tags (article_id, tag_id)
  select target_article_id, tag_id
  from unnest(coalesce(selected_tag_ids, '{}'::uuid[])) as tag_id
  on conflict do nothing;

  insert into public.citations (
    revision_id, source_id, ordinal, citation_key, citation_text, is_public
  )
  select
    target_revision_id,
    source.id,
    source_order.ordinality::integer,
    'src-' || source_order.ordinality,
    concat_ws(', ', nullif(source.author_text, ''), source.title, nullif(source.publisher, '')),
    true
  from unnest(coalesce(selected_source_ids, '{}'::uuid[])) with ordinality as source_order(source_id, ordinality)
  join public.sources source on source.id = source_order.source_id;

  if cover_media_asset_id is not null then
    if not exists (
      select 1 from public.media_assets asset
      where asset.id = cover_media_asset_id and asset.processing_status = 'ready'
    ) then
      raise exception using errcode = '23514', message = 'Cover media must be fully processed';
    end if;

    insert into public.article_media (
      revision_id, media_asset_id, role, position, alt_text
    )
    select target_revision_id, asset.id, 'hero', 0, asset.default_alt_text
    from public.media_assets asset
    where asset.id = cover_media_asset_id;
  end if;
end;
$$;

create or replace function public.create_story_draft(
  p_title text,
  p_slug text,
  p_excerpt text,
  p_body_markdown text,
  p_body_plain_text text,
  p_pillar_id uuid,
  p_category_id uuid,
  p_word_count integer,
  p_reading_time_minutes integer
)
returns table (article_id uuid, revision_id uuid, row_version bigint)
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  new_article_id uuid;
  new_revision_id uuid;
  founder_author_id uuid;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'Admin authorization required';
  end if;

  founder_author_id := private.ensure_founder_author();

  insert into public.articles (
    author_id, primary_pillar_id, category_id, canonical_slug, canonical_path,
    created_by, updated_by
  ) values (
    founder_author_id, p_pillar_id, p_category_id, p_slug, '/placeholder/placeholder',
    auth.uid(), auth.uid()
  ) returning id into new_article_id;

  insert into public.article_revisions (
    article_id, revision_kind, title, dek, body_markdown, body_plain_text,
    word_count, reading_time_minutes, created_by
  ) values (
    new_article_id, 'draft', p_title, nullif(p_excerpt, ''), p_body_markdown,
    p_body_plain_text, p_word_count, p_reading_time_minutes, auth.uid()
  ) returning id into new_revision_id;

  update public.articles
  set current_draft_revision_id = new_revision_id, updated_by = auth.uid()
  where id = new_article_id;

  return query
  select a.id, new_revision_id, a.row_version
  from public.articles a where a.id = new_article_id;
end;
$$;

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
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'Admin authorization required';
  end if;

  select * into locked_article from public.articles
  where id = p_article_id for update;

  if not found then raise exception using errcode = 'P0002', message = 'Story not found'; end if;
  if locked_article.row_version <> p_expected_row_version then
    raise exception using errcode = '40001', message = 'Story changed in another session';
  end if;

  update public.articles
  set primary_pillar_id = p_pillar_id,
      category_id = p_category_id,
      canonical_slug = p_slug,
      updated_by = auth.uid()
  where id = p_article_id;

  insert into public.article_revisions (
    article_id, revision_kind, supersedes_revision_id, title, dek,
    body_markdown, body_plain_text, word_count, reading_time_minutes,
    seo_title, seo_description, created_by
  ) values (
    p_article_id, 'draft', locked_article.current_draft_revision_id, p_title,
    nullif(p_excerpt, ''), p_body_markdown, p_body_plain_text, p_word_count,
    p_reading_time_minutes, nullif(p_seo_title, ''), nullif(p_seo_description, ''),
    auth.uid()
  ) returning id into new_revision_id;

  update public.articles
  set current_draft_revision_id = new_revision_id, updated_by = auth.uid()
  where id = p_article_id;

  delete from public.article_tags atg where atg.article_id = p_article_id;
  perform private.attach_revision_relations(
    new_revision_id, p_article_id, p_tag_ids, p_source_ids, p_cover_media_asset_id
  );

  return query
  select a.id, new_revision_id, a.row_version, a.updated_at
  from public.articles a where a.id = p_article_id;
end;
$$;

create or replace function public.request_story_publication(
  p_article_id uuid,
  p_action public.publication_action,
  p_target_revision_id uuid,
  p_idempotency_key uuid
)
returns table (publication_job_id uuid, job_status public.publication_job_status)
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  locked_article public.articles%rowtype;
  selected_revision_id uuid;
  selected_action public.publication_action;
  new_job_id uuid;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'Admin authorization required';
  end if;

  select * into locked_article from public.articles
  where id = p_article_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Story not found'; end if;

  if p_action = 'unpublish' then
    selected_revision_id := null;
    selected_action := 'unpublish';
  elsif p_action = 'rollback' then
    selected_revision_id := p_target_revision_id;
    selected_action := 'rollback';
  else
    selected_revision_id := locked_article.current_draft_revision_id;
    selected_action := case when locked_article.published_revision_id is null then 'publish' else 'republish' end;
  end if;

  if selected_action <> 'unpublish' then
    if selected_revision_id is null then
      raise exception using errcode = '23514', message = 'A target revision is required';
    end if;
    if exists (
      select 1 from private.validate_revision_for_publication(p_article_id, selected_revision_id)
      where severity = 'error'
    ) then
      raise exception using errcode = '23514', message = 'Story has publication validation errors';
    end if;
  end if;

  insert into public.publication_jobs (
    article_id, target_revision_id, action, idempotency_key, initiated_by
  ) values (
    p_article_id, selected_revision_id, selected_action, p_idempotency_key, auth.uid()
  )
  on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into new_job_id;

  update public.articles set status = 'publishing', updated_by = auth.uid()
  where id = p_article_id;

  return query select j.id, j.status from public.publication_jobs j where j.id = new_job_id;
end;
$$;

revoke execute on function private.ensure_founder_author() from public, anon;
revoke execute on function private.attach_revision_relations(uuid, uuid, uuid[], uuid[], uuid) from public, anon;
grant execute on function private.ensure_founder_author() to authenticated, service_role;
grant execute on function private.attach_revision_relations(uuid, uuid, uuid[], uuid[], uuid) to authenticated, service_role;
grant execute on function private.validate_revision_for_publication(uuid, uuid) to authenticated;

revoke execute on function public.create_story_draft(text, text, text, text, text, uuid, uuid, integer, integer) from public, anon;
revoke execute on function public.save_story_draft(uuid, bigint, text, text, text, text, text, uuid, uuid, uuid[], uuid[], uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.request_story_publication(uuid, public.publication_action, uuid, uuid) from public, anon;

grant execute on function public.create_story_draft(text, text, text, text, text, uuid, uuid, integer, integer) to authenticated;
grant execute on function public.save_story_draft(uuid, bigint, text, text, text, text, text, uuid, uuid, uuid[], uuid[], uuid, text, text, integer, integer) to authenticated;
grant execute on function public.request_story_publication(uuid, public.publication_action, uuid, uuid) to authenticated;
