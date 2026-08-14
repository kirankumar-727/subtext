-- Subtext Media: deny-by-default grants and complete RLS policy surface.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on schema private from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema private to service_role;
grant usage on schema private to authenticated;

-- Every Subtext base table is protected, including tables exposed only through safe views.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'authors',
    'pillars',
    'categories',
    'tags',
    'articles',
    'article_revisions',
    'article_tags',
    'sources',
    'source_notes',
    'citations',
    'media_assets',
    'media_variants',
    'article_media',
    'redirects',
    'slug_history',
    'site_settings',
    'featured_collections',
    'featured_collection_items',
    'publication_jobs',
    'publication_events',
    'search_projection',
    'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

-- Mutable founder-managed tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'authors',
    'pillars',
    'categories',
    'tags',
    'articles',
    'article_tags',
    'sources',
    'source_notes',
    'media_assets',
    'redirects',
    'site_settings',
    'featured_collections',
    'featured_collection_items',
    'publication_jobs'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      table_name || '_admin_all',
      table_name
    );
  end loop;
end;
$$;

-- Immutable or append-only founder-managed tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'article_revisions',
    'citations',
    'media_variants',
    'article_media',
    'publication_events'
  ] loop
    execute format('grant select, insert on public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_admin()))',
      table_name || '_admin_select',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
      table_name || '_admin_insert',
      table_name
    );
  end loop;
end;
$$;

grant select on public.slug_history, public.search_projection, public.audit_logs to authenticated;

create policy slug_history_admin_select
on public.slug_history for select to authenticated
using ((select private.is_admin()));

create policy search_projection_admin_select
on public.search_projection for select to authenticated
using ((select private.is_admin()));

create policy audit_logs_admin_select
on public.audit_logs for select to authenticated
using ((select private.is_admin()));

-- Public taxonomy and bylines.
grant select on public.authors, public.pillars, public.categories, public.tags to anon, authenticated;

create policy authors_public_select
on public.authors for select to anon, authenticated
using (is_active);

create policy pillars_public_select
on public.pillars for select to anon, authenticated
using (is_active);

create policy categories_public_select
on public.categories for select to anon, authenticated
using (is_active);

create policy tags_public_select
on public.tags for select to anon, authenticated
using (is_active);

-- Published-row policies provide defense in depth even though anonymous clients use safe views.
create policy articles_public_select
on public.articles for select to anon, authenticated
using (status in ('published_pending_verification', 'published'));

create policy article_revisions_public_select
on public.article_revisions for select to anon, authenticated
using (
  exists (
    select 1
    from public.articles a
    where a.published_revision_id = article_revisions.id
      and a.status in ('published_pending_verification', 'published')
  )
);

create policy article_tags_public_select
on public.article_tags for select to anon, authenticated
using (
  exists (
    select 1
    from public.articles a
    join public.tags t on t.id = article_tags.tag_id
    where a.id = article_tags.article_id
      and a.status in ('published_pending_verification', 'published')
      and t.is_active
  )
);

create policy sources_public_select
on public.sources for select to anon, authenticated
using (
  exists (
    select 1
    from public.citations c
    join public.articles a on a.published_revision_id = c.revision_id
    where c.source_id = sources.id
      and c.is_public
      and a.status in ('published_pending_verification', 'published')
  )
);

create policy citations_public_select
on public.citations for select to anon, authenticated
using (
  is_public
  and exists (
    select 1
    from public.articles a
    where a.published_revision_id = citations.revision_id
      and a.status in ('published_pending_verification', 'published')
  )
);

create policy media_assets_public_select
on public.media_assets for select to anon, authenticated
using (
  processing_status = 'ready'
  and rights_status not in ('unknown', 'restricted')
  and exists (
    select 1
    from public.article_media am
    join public.articles a on a.published_revision_id = am.revision_id
    where am.media_asset_id = media_assets.id
      and a.status in ('published_pending_verification', 'published')
  )
);

create policy media_variants_public_select
on public.media_variants for select to anon, authenticated
using (
  is_public
  and exists (
    select 1
    from public.media_assets ma
    where ma.id = media_variants.media_asset_id
      and ma.processing_status = 'ready'
      and ma.rights_status not in ('unknown', 'restricted')
      and exists (
        select 1
        from public.article_media am
        join public.articles a on a.published_revision_id = am.revision_id
        where am.media_asset_id = ma.id
          and a.status in ('published_pending_verification', 'published')
      )
  )
);

create policy article_media_public_select
on public.article_media for select to anon, authenticated
using (
  exists (
    select 1
    from public.articles a
    where a.published_revision_id = article_media.revision_id
      and a.status in ('published_pending_verification', 'published')
  )
);

grant select on public.redirects, public.site_settings, public.featured_collections,
  public.featured_collection_items, public.search_projection to anon, authenticated;

create policy redirects_public_select
on public.redirects for select to anon, authenticated
using (is_active);

create policy site_settings_public_select
on public.site_settings for select to anon, authenticated
using (is_public);

create policy featured_collections_public_select
on public.featured_collections for select to anon, authenticated
using (
  status = 'published'
  and (starts_at is null or starts_at <= clock_timestamp())
  and (ends_at is null or ends_at > clock_timestamp())
);

create policy featured_collection_items_public_select
on public.featured_collection_items for select to anon, authenticated
using (
  exists (
    select 1
    from public.featured_collections fc
    join public.articles a on a.id = featured_collection_items.article_id
    where fc.id = featured_collection_items.collection_id
      and fc.status = 'published'
      and (fc.starts_at is null or fc.starts_at <= clock_timestamp())
      and (fc.ends_at is null or fc.ends_at > clock_timestamp())
      and a.status in ('published_pending_verification', 'published')
  )
);

create policy search_projection_public_select
on public.search_projection for select to anon, authenticated
using (true);

-- Safe view and RPC access. Views expose only intentional public columns.
grant select on
  public.published_articles,
  public.published_citations,
  public.published_media,
  public.public_redirects,
  public.public_site_settings,
  public.published_featured_collections
  to anon, authenticated;

grant execute on function public.search_published_articles(text, text, integer, integer)
  to anon, authenticated;

grant execute on function public.claim_publication_jobs(text, integer, integer)
  to service_role;

grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.sha256_text(text) to authenticated, service_role;
grant execute on function private.validate_revision_for_publication(uuid, uuid) to service_role;
grant execute on all functions in schema private to service_role;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
