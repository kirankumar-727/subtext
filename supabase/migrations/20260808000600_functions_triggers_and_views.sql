-- Subtext Media: invariants, lifecycle helpers, audit/search synchronization, and safe public read models.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((auth.jwt() ->> 'user_role') = 'admin', false);
$$;

comment on function private.is_admin() is 'Returns true only for a JWT carrying the server-issued Subtext admin role. Authentication provisioning is implemented in M3.';

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function private.set_article_update_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create or replace function private.prevent_update_or_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I.%I rows are immutable', tg_table_schema, tg_table_name);
end;
$$;

create or replace function private.assign_revision_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  assigned_number integer;
begin
  update public.articles
  set revision_counter = revision_counter + 1
  where id = new.article_id
  returning revision_counter into assigned_number;

  if assigned_number is null then
    raise exception using errcode = '23503', message = 'Revision article does not exist';
  end if;

  if new.supersedes_revision_id is not null and not exists (
    select 1
    from public.article_revisions prior
    where prior.id = new.supersedes_revision_id
      and prior.article_id = new.article_id
  ) then
    raise exception using errcode = '23514', message = 'Superseded revision must belong to the same article';
  end if;

  new.revision_number := assigned_number;
  return new;
end;
$$;

create or replace function private.set_and_validate_article_path()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  pillar_slug text;
  derived_path text;
begin
  select p.slug
  into pillar_slug
  from public.pillars p
  where p.id = new.primary_pillar_id;

  if pillar_slug is null then
    raise exception using errcode = '23503', message = 'Article pillar does not exist';
  end if;

  if new.category_id is not null and not exists (
    select 1
    from public.categories c
    where c.id = new.category_id
      and c.pillar_id = new.primary_pillar_id
  ) then
    raise exception using errcode = '23514', message = 'Article category must belong to its primary pillar';
  end if;

  derived_path := '/' || pillar_slug || '/' || new.canonical_slug;

  if tg_op = 'UPDATE' and derived_path <> old.canonical_path then
    if exists (select 1 from public.slug_history sh where sh.path = derived_path) then
      raise exception using errcode = '23505', message = 'A historical canonical path cannot be reused';
    end if;

    if exists (select 1 from public.redirects r where r.from_path = derived_path and r.is_active) then
      raise exception using errcode = '23505', message = 'Canonical path conflicts with an active redirect';
    end if;
  end if;

  new.canonical_path := derived_path;
  return new;
end;
$$;

create or replace function private.record_article_path_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_redirect_id uuid;
begin
  if new.canonical_path = old.canonical_path then
    return new;
  end if;

  insert into public.redirects (
    article_id,
    from_path,
    to_path,
    kind,
    http_status,
    created_by
  ) values (
    new.id,
    old.canonical_path,
    new.canonical_path,
    case
      when old.primary_pillar_id <> new.primary_pillar_id then 'pillar_change'::public.redirect_kind
      else 'slug_change'::public.redirect_kind
    end,
    308,
    new.updated_by
  )
  returning id into new_redirect_id;

  insert into public.slug_history (
    article_id,
    pillar_id,
    slug,
    path,
    redirect_id
  ) values (
    new.id,
    old.primary_pillar_id,
    old.canonical_slug,
    old.canonical_path,
    new_redirect_id
  );

  return new;
end;
$$;

create or replace function private.validate_article_revision_pointers()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.current_draft_revision_id is not null and not exists (
    select 1
    from public.article_revisions r
    where r.id = new.current_draft_revision_id
      and r.article_id = new.id
  ) then
    raise exception using errcode = '23514', message = 'Current draft revision must belong to its article';
  end if;

  if new.published_revision_id is not null and not exists (
    select 1
    from public.article_revisions r
    where r.id = new.published_revision_id
      and r.article_id = new.id
  ) then
    raise exception using errcode = '23514', message = 'Published revision must belong to its article';
  end if;

  if new.status in ('published_pending_verification', 'published') then
    if new.published_revision_id is null
      or new.first_published_at is null
      or new.last_published_at is null then
      raise exception using errcode = '23514', message = 'Published articles require a revision and publication timestamps';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_publication_job()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actual_checksum text;
begin
  if new.target_revision_id is not null then
    select r.content_checksum
    into actual_checksum
    from public.article_revisions r
    where r.id = new.target_revision_id
      and r.article_id = new.article_id;

    if actual_checksum is null then
      raise exception using errcode = '23514', message = 'Publication target revision must belong to the job article';
    end if;

    if new.expected_content_checksum is null then
      new.expected_content_checksum := actual_checksum;
    elsif new.expected_content_checksum <> actual_checksum then
      raise exception using errcode = '23514', message = 'Publication checksum does not match the immutable revision';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_publication_job_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'queued' and new.status in ('processing', 'cancelled'))
    or (old.status = 'processing' and new.status in ('committed', 'failed', 'dead_letter', 'cancelled'))
    or (old.status = 'committed' and new.status in ('verifying', 'failed'))
    or (old.status = 'verifying' and new.status in ('succeeded', 'failed'))
    or (old.status = 'failed' and new.status in ('queued', 'processing', 'dead_letter', 'cancelled'))
  ) then
    raise exception using
      errcode = '23514',
      message = format('Invalid publication job transition: %s -> %s', old.status, new.status);
  end if;

  if new.status in ('succeeded', 'dead_letter', 'cancelled') and new.completed_at is null then
    new.completed_at := clock_timestamp();
  end if;

  return new;
end;
$$;

create or replace function private.compact_audit_snapshot(value jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select value
    - 'body_markdown'
    - 'body_plain_text'
    - 'bio_markdown'
    - 'bio_plain_text'
    - 'note_markdown'
    - 'quoted_text'
    - 'processing_error';
$$;

create or replace function private.audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  old_row jsonb;
  new_row jsonb;
  identity jsonb;
begin
  if current_setting('subtext.suppress_audit', true) = 'on' then
    return coalesce(new, old);
  end if;

  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  identity := case
    when coalesce(new_row, old_row) ? 'id'
      then jsonb_build_object('id', coalesce(new_row, old_row) -> 'id')
    when tg_table_name = 'site_settings'
      then jsonb_build_object('key', coalesce(new_row, old_row) -> 'key')
    when tg_table_name = 'article_tags'
      then jsonb_build_object(
        'article_id', coalesce(new_row, old_row) -> 'article_id',
        'tag_id', coalesce(new_row, old_row) -> 'tag_id'
      )
    when tg_table_name = 'featured_collection_items'
      then jsonb_build_object(
        'collection_id', coalesce(new_row, old_row) -> 'collection_id',
        'article_id', coalesce(new_row, old_row) -> 'article_id'
      )
    else jsonb_build_object('row', coalesce(new_row, old_row))
  end;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_pk,
    old_values,
    new_values,
    request_id
  ) values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    identity,
    case when old_row is null then null else private.compact_audit_snapshot(old_row) end,
    case when new_row is null then null else private.compact_audit_snapshot(new_row) end,
    nullif(current_setting('request.id', true), '')::uuid
  );

  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_search_projection(target_article_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.articles a
    where a.id = target_article_id
      and a.status in ('published_pending_verification', 'published')
      and a.published_revision_id is not null
  ) then
    delete from public.search_projection where article_id = target_article_id;
    return;
  end if;

  insert into public.search_projection (
    article_id,
    revision_id,
    author_id,
    pillar_id,
    category_id,
    slug,
    canonical_path,
    title,
    dek,
    body_plain_text,
    author_name,
    pillar_name,
    category_name,
    tags,
    tag_text,
    published_at,
    projection_updated_at
  )
  select
    a.id,
    r.id,
    au.id,
    p.id,
    c.id,
    a.canonical_slug,
    a.canonical_path,
    r.title,
    r.dek,
    r.body_plain_text,
    au.name,
    p.name,
    c.name,
    coalesce(tag_data.tags, '{}'::text[]),
    coalesce(tag_data.tag_text, ''),
    coalesce(a.last_published_at, a.first_published_at),
    clock_timestamp()
  from public.articles a
  join public.article_revisions r on r.id = a.published_revision_id
  join public.authors au on au.id = a.author_id
  join public.pillars p on p.id = a.primary_pillar_id
  left join public.categories c on c.id = a.category_id
  left join lateral (
    select
      array_agg(t.name order by t.name) as tags,
      string_agg(t.name, ' ' order by t.name) as tag_text
    from public.article_tags atg
    join public.tags t on t.id = atg.tag_id
    where atg.article_id = a.id
      and t.is_active
  ) tag_data on true
  where a.id = target_article_id
    and a.status in ('published_pending_verification', 'published')
  on conflict (article_id) do update set
    revision_id = excluded.revision_id,
    author_id = excluded.author_id,
    pillar_id = excluded.pillar_id,
    category_id = excluded.category_id,
    slug = excluded.slug,
    canonical_path = excluded.canonical_path,
    title = excluded.title,
    dek = excluded.dek,
    body_plain_text = excluded.body_plain_text,
    author_name = excluded.author_name,
    pillar_name = excluded.pillar_name,
    category_name = excluded.category_name,
    tags = excluded.tags,
    tag_text = excluded.tag_text,
    published_at = excluded.published_at,
    projection_updated_at = excluded.projection_updated_at;
end;
$$;

create or replace function private.refresh_search_from_article()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.refresh_search_projection(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_search_from_article_tag()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.refresh_search_projection(coalesce(new.article_id, old.article_id));
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_search_from_tag()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  affected_article_id uuid;
begin
  for affected_article_id in
    select atg.article_id
    from public.article_tags atg
    where atg.tag_id = coalesce(new.id, old.id)
  loop
    perform private.refresh_search_projection(affected_article_id);
  end loop;
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_search_from_author()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  affected_article_id uuid;
begin
  for affected_article_id in
    select a.id from public.articles a where a.author_id = coalesce(new.id, old.id)
  loop
    perform private.refresh_search_projection(affected_article_id);
  end loop;
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_search_from_pillar()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  affected_article_id uuid;
begin
  for affected_article_id in
    select a.id from public.articles a where a.primary_pillar_id = coalesce(new.id, old.id)
  loop
    perform private.refresh_search_projection(affected_article_id);
  end loop;
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_search_from_category()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  affected_article_id uuid;
begin
  for affected_article_id in
    select a.id from public.articles a where a.category_id = coalesce(new.id, old.id)
  loop
    perform private.refresh_search_projection(affected_article_id);
  end loop;
  return coalesce(new, old);
end;
$$;

create or replace function public.search_published_articles(
  search_query text,
  pillar_slug text default null,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  article_id uuid,
  canonical_path text,
  title text,
  dek text,
  author_name text,
  pillar_name text,
  category_name text,
  tags text[],
  published_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with query_input as (
    select websearch_to_tsquery('english'::regconfig, btrim(search_query)) as query
  )
  select
    sp.article_id,
    sp.canonical_path,
    sp.title,
    sp.dek,
    sp.author_name,
    sp.pillar_name,
    sp.category_name,
    sp.tags,
    sp.published_at,
    greatest(
      ts_rank_cd(sp.search_vector, qi.query),
      similarity(sp.title, search_query) * 0.35,
      similarity(sp.slug, search_query) * 0.25
    )::real as rank
  from public.search_projection sp
  cross join query_input qi
  join public.pillars p on p.id = sp.pillar_id
  where btrim(search_query) <> ''
    and (sp.search_vector @@ qi.query or sp.title % search_query or sp.slug % search_query)
    and (pillar_slug is null or p.slug = pillar_slug)
  order by rank desc, sp.published_at desc
  limit least(greatest(result_limit, 1), 50)
  offset greatest(result_offset, 0);
$$;

comment on function public.search_published_articles(text, text, integer, integer) is 'Ranked published-only PostgreSQL FTS plus trigram fallback with an optional pillar filter.';

create or replace function public.claim_publication_jobs(
  claiming_worker_id text,
  batch_size integer default 1,
  lease_seconds integer default 60
)
returns setof public.publication_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Only the service role may claim publication jobs';
  end if;

  return query
  with candidates as (
    select j.id
    from public.publication_jobs j
    where j.status in ('queued', 'failed')
      and j.available_at <= clock_timestamp()
      and (j.lease_expires_at is null or j.lease_expires_at <= clock_timestamp())
      and j.attempt_count < j.max_attempts
    order by j.available_at, j.created_at
    for update skip locked
    limit least(greatest(batch_size, 1), 10)
  )
  update public.publication_jobs j
  set
    status = 'processing',
    worker_id = claiming_worker_id,
    leased_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + make_interval(secs => greatest(lease_seconds, 10)),
    attempt_count = j.attempt_count + 1,
    updated_at = clock_timestamp()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function private.validate_revision_for_publication(
  target_article_id uuid,
  target_revision_id uuid
)
returns table (
  code text,
  severity text,
  message text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.article_revisions r
    where r.id = target_revision_id and r.article_id = target_article_id
  ) then
    return query select 'revision_mismatch', 'error', 'Revision does not belong to the article';
    return;
  end if;

  if exists (
    select 1 from public.articles a
    join public.categories c on c.id = a.category_id
    where a.id = target_article_id and c.pillar_id <> a.primary_pillar_id
  ) then
    return query select 'category_pillar_mismatch', 'error', 'Category does not belong to the article pillar';
  end if;

  return query
  select 'media_not_ready', 'error', 'All linked media must be processed successfully'
  where exists (
    select 1
    from public.article_media am
    join public.media_assets ma on ma.id = am.media_asset_id
    where am.revision_id = target_revision_id
      and ma.processing_status <> 'ready'
  );

  return query
  select 'media_rights_unresolved', 'error', 'All linked media require cleared publication rights'
  where exists (
    select 1
    from public.article_media am
    join public.media_assets ma on ma.id = am.media_asset_id
    where am.revision_id = target_revision_id
      and ma.rights_status in ('unknown', 'restricted')
  );

  return query
  select 'image_alt_missing', 'error', 'Every placed image requires alternative text'
  where exists (
    select 1
    from public.article_media am
    join public.media_assets ma on ma.id = am.media_asset_id
    where am.revision_id = target_revision_id
      and ma.kind = 'image'
      and nullif(btrim(coalesce(am.alt_text, ma.default_alt_text)), '') is null
  );

  return query
  select 'public_variant_missing', 'error', 'Every placed asset requires at least one public derivative'
  where exists (
    select 1
    from public.article_media am
    where am.revision_id = target_revision_id
      and not exists (
        select 1 from public.media_variants mv
        where mv.media_asset_id = am.media_asset_id and mv.is_public
      )
  );

  return query
  select 'citations_missing', 'warning', 'Research-driven stories should include at least one public citation'
  where not exists (
    select 1 from public.citations c
    where c.revision_id = target_revision_id and c.is_public
  );

  return query
  select 'seo_description_missing', 'warning', 'An explicit SEO description is recommended'
  where exists (
    select 1 from public.article_revisions r
    where r.id = target_revision_id and nullif(btrim(r.seo_description), '') is null
  );
end;
$$;

-- Safe reader-facing views. Base tables remain protected independently by RLS.
create view public.published_articles
with (security_barrier = true)
as
select
  a.id,
  a.canonical_slug,
  a.canonical_path,
  a.first_published_at,
  a.last_published_at,
  r.id as revision_id,
  r.title,
  r.dek,
  r.body_markdown,
  r.word_count,
  r.reading_time_minutes,
  r.seo_title,
  r.seo_description,
  r.social_title,
  r.social_description,
  r.content_checksum,
  au.id as author_id,
  au.name as author_name,
  au.slug as author_slug,
  p.id as pillar_id,
  p.name as pillar_name,
  p.slug as pillar_slug,
  c.id as category_id,
  c.name as category_name,
  c.slug as category_slug,
  coalesce(
    (
      select array_agg(t.name order by t.name)
      from public.article_tags atg
      join public.tags t on t.id = atg.tag_id
      where atg.article_id = a.id and t.is_active
    ),
    '{}'::text[]
  ) as tags
from public.articles a
join public.article_revisions r on r.id = a.published_revision_id
join public.authors au on au.id = a.author_id and au.is_active
join public.pillars p on p.id = a.primary_pillar_id and p.is_active
left join public.categories c on c.id = a.category_id and c.is_active
where a.status in ('published_pending_verification', 'published');

comment on view public.published_articles is 'Safe published article read model; excludes drafts, internal fields, and body_plain_text.';

create view public.published_citations
with (security_barrier = true)
as
select
  c.id,
  a.id as article_id,
  c.revision_id,
  c.ordinal,
  c.citation_key,
  c.citation_text,
  c.locator,
  c.public_note,
  c.quoted_text,
  s.id as source_id,
  s.source_type,
  s.title as source_title,
  s.author_text,
  s.publisher,
  s.publication_date,
  s.url,
  s.archive_url,
  s.isbn,
  s.doi,
  s.accessed_at
from public.citations c
join public.articles a on a.published_revision_id = c.revision_id
join public.sources s on s.id = c.source_id
where a.status in ('published_pending_verification', 'published')
  and c.is_public;

comment on view public.published_citations is 'Public citation snapshots and safe source metadata for currently published revisions.';

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
  mv.storage_key,
  mv.mime_type,
  mv.format,
  mv.width,
  mv.height,
  mv.byte_size,
  mv.checksum_sha256
from public.article_media am
join public.articles a on a.published_revision_id = am.revision_id
join public.media_assets ma on ma.id = am.media_asset_id
join public.media_variants mv on mv.media_asset_id = ma.id and mv.is_public
where a.status in ('published_pending_verification', 'published')
  and ma.processing_status = 'ready'
  and ma.rights_status not in ('unknown', 'restricted');

comment on view public.published_media is 'Public derivative metadata only; private original object keys and rights notes are never selected.';

create view public.public_redirects
with (security_barrier = true)
as
select from_path, to_path, http_status
from public.redirects
where is_active;

create view public.public_site_settings
with (security_barrier = true)
as
select key, value, updated_at
from public.site_settings
where is_public;

create view public.published_featured_collections
with (security_barrier = true)
as
select
  fc.id,
  fc.name,
  fc.slug,
  fc.description,
  fci.position,
  fci.label,
  pa.id as article_id,
  pa.canonical_path,
  pa.title,
  pa.dek,
  pa.pillar_name,
  pa.category_name,
  pa.first_published_at
from public.featured_collections fc
join public.featured_collection_items fci on fci.collection_id = fc.id
join public.published_articles pa on pa.id = fci.article_id
where fc.status = 'published'
  and (fc.starts_at is null or fc.starts_at <= clock_timestamp())
  and (fc.ends_at is null or fc.ends_at > clock_timestamp());

-- Updated-at triggers.
create trigger authors_set_updated_at before update on public.authors
for each row execute function private.set_updated_at();
create trigger pillars_set_updated_at before update on public.pillars
for each row execute function private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
for each row execute function private.set_updated_at();
create trigger tags_set_updated_at before update on public.tags
for each row execute function private.set_updated_at();
create trigger sources_set_updated_at before update on public.sources
for each row execute function private.set_updated_at();
create trigger source_notes_set_updated_at before update on public.source_notes
for each row execute function private.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets
for each row execute function private.set_updated_at();
create trigger redirects_set_updated_at before update on public.redirects
for each row execute function private.set_updated_at();
create trigger site_settings_set_updated_at before update on public.site_settings
for each row execute function private.set_updated_at();
create trigger featured_collections_set_updated_at before update on public.featured_collections
for each row execute function private.set_updated_at();
create trigger publication_jobs_set_updated_at before update on public.publication_jobs
for each row execute function private.set_updated_at();

create trigger articles_set_update_metadata
before update on public.articles
for each row execute function private.set_article_update_metadata();

-- Invariant and lifecycle triggers.
create trigger articles_set_and_validate_path
before insert or update of canonical_slug, primary_pillar_id, category_id
on public.articles
for each row execute function private.set_and_validate_article_path();

create trigger articles_record_path_history
after update of canonical_slug, primary_pillar_id on public.articles
for each row when (old.canonical_path is distinct from new.canonical_path)
execute function private.record_article_path_history();

create constraint trigger articles_validate_revision_pointers
after insert or update of current_draft_revision_id, published_revision_id, status,
  first_published_at, last_published_at
on public.articles
deferrable initially deferred
for each row execute function private.validate_article_revision_pointers();

create trigger article_revisions_assign_number
before insert on public.article_revisions
for each row execute function private.assign_revision_number();

create trigger article_revisions_immutable
before update or delete on public.article_revisions
for each row execute function private.prevent_update_or_delete();

create trigger citations_immutable
before update or delete on public.citations
for each row execute function private.prevent_update_or_delete();

create trigger article_media_immutable
before update or delete on public.article_media
for each row execute function private.prevent_update_or_delete();

create trigger media_variants_immutable
before update or delete on public.media_variants
for each row execute function private.prevent_update_or_delete();

create trigger slug_history_immutable
before update or delete on public.slug_history
for each row execute function private.prevent_update_or_delete();

create trigger publication_events_immutable
before update or delete on public.publication_events
for each row execute function private.prevent_update_or_delete();

create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function private.prevent_update_or_delete();

create trigger publication_jobs_validate_target
before insert or update of article_id, target_revision_id, expected_content_checksum
on public.publication_jobs
for each row execute function private.validate_publication_job();

create trigger publication_jobs_validate_transition
before update of status on public.publication_jobs
for each row execute function private.validate_publication_job_transition();

-- Search synchronization triggers.
create trigger articles_refresh_search
after insert or update or delete on public.articles
for each row execute function private.refresh_search_from_article();

create trigger article_tags_refresh_search
after insert or update or delete on public.article_tags
for each row execute function private.refresh_search_from_article_tag();

create trigger tags_refresh_search
after update of name, slug, is_active on public.tags
for each row execute function private.refresh_search_from_tag();

create trigger authors_refresh_search
after update of name, slug, is_active on public.authors
for each row execute function private.refresh_search_from_author();

create trigger pillars_refresh_search
after update of name, slug, is_active on public.pillars
for each row execute function private.refresh_search_from_pillar();

create trigger categories_refresh_search
after update of name, slug, is_active on public.categories
for each row execute function private.refresh_search_from_category();

-- Audit triggers for every mutable/editorial aggregate. Audit tables themselves are excluded.
create trigger authors_audit after insert or update or delete on public.authors
for each row execute function private.audit_mutation();
create trigger pillars_audit after insert or update or delete on public.pillars
for each row execute function private.audit_mutation();
create trigger categories_audit after insert or update or delete on public.categories
for each row execute function private.audit_mutation();
create trigger tags_audit after insert or update or delete on public.tags
for each row execute function private.audit_mutation();
create trigger articles_audit after insert or update or delete on public.articles
for each row execute function private.audit_mutation();
create trigger article_revisions_audit after insert on public.article_revisions
for each row execute function private.audit_mutation();
create trigger article_tags_audit after insert or update or delete on public.article_tags
for each row execute function private.audit_mutation();
create trigger sources_audit after insert or update or delete on public.sources
for each row execute function private.audit_mutation();
create trigger source_notes_audit after insert or update or delete on public.source_notes
for each row execute function private.audit_mutation();
create trigger citations_audit after insert on public.citations
for each row execute function private.audit_mutation();
create trigger media_assets_audit after insert or update or delete on public.media_assets
for each row execute function private.audit_mutation();
create trigger media_variants_audit after insert on public.media_variants
for each row execute function private.audit_mutation();
create trigger article_media_audit after insert on public.article_media
for each row execute function private.audit_mutation();
create trigger redirects_audit after insert or update or delete on public.redirects
for each row execute function private.audit_mutation();
create trigger site_settings_audit after insert or update or delete on public.site_settings
for each row execute function private.audit_mutation();
create trigger featured_collections_audit after insert or update or delete on public.featured_collections
for each row execute function private.audit_mutation();
create trigger featured_collection_items_audit after insert or update or delete on public.featured_collection_items
for each row execute function private.audit_mutation();
create trigger publication_jobs_audit after insert or update or delete on public.publication_jobs
for each row execute function private.audit_mutation();
