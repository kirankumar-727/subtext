-- Restore search projection synchronization after staging schema drift.
-- Safe to re-run: trigger definitions are recreated and the backfill is idempotent.

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
    delete from public.search_projection
    where article_id = target_article_id;
    return;
  end if;

  insert into public.search_projection (
    article_id, revision_id, author_id, pillar_id, category_id, slug,
    canonical_path, title, dek, body_plain_text, author_name, pillar_name,
    category_name, tags, tag_text, published_at, projection_updated_at
  )
  select
    a.id, r.id, au.id, p.id, c.id, a.canonical_slug,
    a.canonical_path, r.title, r.dek, r.body_plain_text, au.name, p.name,
    c.name, coalesce(tag_data.tags, '{}'::text[]),
    coalesce(tag_data.tag_text, ''),
    coalesce(a.last_published_at, a.first_published_at), clock_timestamp()
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
    where atg.article_id = a.id and t.is_active
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
    select a.id
    from public.articles a
    where a.author_id = coalesce(new.id, old.id)
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
    select a.id
    from public.articles a
    where a.primary_pillar_id = coalesce(new.id, old.id)
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
    select a.id
    from public.articles a
    where a.category_id = coalesce(new.id, old.id)
  loop
    perform private.refresh_search_projection(affected_article_id);
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists articles_refresh_search on public.articles;
create trigger articles_refresh_search
after insert or update or delete on public.articles
for each row execute function private.refresh_search_from_article();

drop trigger if exists article_tags_refresh_search on public.article_tags;
create trigger article_tags_refresh_search
after insert or update or delete on public.article_tags
for each row execute function private.refresh_search_from_article_tag();

drop trigger if exists tags_refresh_search on public.tags;
create trigger tags_refresh_search
after update of name, slug, is_active on public.tags
for each row execute function private.refresh_search_from_tag();

drop trigger if exists authors_refresh_search on public.authors;
create trigger authors_refresh_search
after update of name, slug, is_active on public.authors
for each row execute function private.refresh_search_from_author();

drop trigger if exists pillars_refresh_search on public.pillars;
create trigger pillars_refresh_search
after update of name, slug, is_active on public.pillars
for each row execute function private.refresh_search_from_pillar();

drop trigger if exists categories_refresh_search on public.categories;
create trigger categories_refresh_search
after update of name, slug, is_active on public.categories
for each row execute function private.refresh_search_from_category();

-- Reconcile already-published rows after restoring the synchronization functions.
select private.refresh_search_projection(a.id)
from public.articles a
where a.status in ('published_pending_verification', 'published')
  and a.published_revision_id is not null;
