create or replace function public.save_story_draft_with_media(
  p_article_id uuid,p_expected_row_version bigint,p_title text,p_slug text,p_excerpt text,
  p_body_markdown text,p_body_plain_text text,p_pillar_id uuid,p_category_id uuid,
  p_tag_ids uuid[],p_source_ids uuid[],p_cover_media_asset_id uuid,p_media_asset_ids uuid[],
  p_seo_title text,p_seo_description text,p_word_count integer,p_reading_time_minutes integer
)
returns table (article_id uuid, revision_id uuid, row_version bigint, saved_at timestamptz)
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare locked_article public.articles%rowtype; new_revision_id uuid;
begin
  if not private.is_admin() then raise exception using errcode='42501',message='Admin authorization required'; end if;
  select * into locked_article from public.articles where id=p_article_id for update;
  if not found then raise exception using errcode='P0002',message='Story not found'; end if;
  if locked_article.row_version<>p_expected_row_version then raise exception using errcode='40001',message='Story changed in another session'; end if;
  if exists (select 1 from public.media_assets asset where asset.id=any(coalesce(p_media_asset_ids,'{}'::uuid[])) and asset.processing_status<>'ready')
    or (p_cover_media_asset_id is not null and not exists(select 1 from public.media_assets asset where asset.id=p_cover_media_asset_id and asset.processing_status='ready'))
    then raise exception using errcode='23514',message='Selected media must be fully processed'; end if;
  if exists (select 1 from unnest(coalesce(p_media_asset_ids,'{}'::uuid[])) selected_id left join public.media_assets asset on asset.id=selected_id where asset.id is null)
    then raise exception using errcode='23503',message='Selected media asset does not exist'; end if;
  update public.articles set primary_pillar_id=p_pillar_id,category_id=p_category_id,canonical_slug=p_slug,updated_by=auth.uid() where id=p_article_id;
  insert into public.article_revisions(article_id,revision_kind,supersedes_revision_id,title,dek,body_markdown,body_plain_text,word_count,reading_time_minutes,seo_title,seo_description,created_by)
  values(p_article_id,'draft',locked_article.current_draft_revision_id,p_title,nullif(p_excerpt,''),p_body_markdown,p_body_plain_text,p_word_count,p_reading_time_minutes,nullif(p_seo_title,''),nullif(p_seo_description,''),auth.uid())
  returning id into new_revision_id;
  update public.articles set current_draft_revision_id=new_revision_id,updated_by=auth.uid() where id=p_article_id;
  delete from public.article_tags where article_id=p_article_id;
  perform private.attach_revision_relations(new_revision_id,p_article_id,p_tag_ids,p_source_ids,null);
  if p_cover_media_asset_id is not null then
    insert into public.article_media(revision_id,media_asset_id,role,position,alt_text)
    select new_revision_id,asset.id,'hero',0,asset.default_alt_text from public.media_assets asset where asset.id=p_cover_media_asset_id;
  end if;
  insert into public.article_media(revision_id,media_asset_id,role,position,alt_text)
  select new_revision_id,selected.media_asset_id,'inline',row_number() over(order by selected.ord)::integer-1,asset.default_alt_text
  from (select media_id as media_asset_id,ord from unnest(coalesce(p_media_asset_ids,'{}'::uuid[])) with ordinality as media_id(media_id,ord) where media_id<>p_cover_media_asset_id) selected
  join public.media_assets asset on asset.id=selected.media_asset_id;
  return query select a.id,new_revision_id,a.row_version,a.updated_at from public.articles a where a.id=p_article_id;
end;
$$;
revoke execute on function public.save_story_draft_with_media(uuid,bigint,text,text,text,text,text,uuid,uuid,uuid[],uuid[],uuid,uuid[],text,text,integer,integer) from public,anon;
grant execute on function public.save_story_draft_with_media(uuid,bigint,text,text,text,text,text,uuid,uuid,uuid[],uuid[],uuid,uuid[],text,text,integer,integer) to authenticated;