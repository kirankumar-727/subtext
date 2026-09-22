-- Publication engine reconstruction: restore durable job invariants and pin
-- immutable revision checksums at enqueue/claim time.

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
    select r.content_checksum into actual_checksum
    from public.article_revisions r
    where r.id = new.target_revision_id
      and r.article_id = new.article_id;

    if actual_checksum is null then
      raise exception using errcode = '23514',
        message = 'Publication target revision must belong to the job article';
    end if;

    if new.expected_content_checksum is null then
      new.expected_content_checksum := actual_checksum;
    elsif new.expected_content_checksum <> actual_checksum then
      raise exception using errcode = '23514',
        message = 'Publication checksum does not match the immutable revision';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists publication_jobs_validate_target on public.publication_jobs;
create trigger publication_jobs_validate_target
before insert or update of article_id, target_revision_id, expected_content_checksum
on public.publication_jobs
for each row execute function private.validate_publication_job();

create or replace function private.validate_publication_job_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = old.status then return new; end if;

  if not (
    (old.status = 'queued' and new.status in ('processing','cancelled'))
    or (old.status = 'processing' and new.status in ('committed','failed','dead_letter','cancelled'))
    or (old.status = 'committed' and new.status in ('verifying','failed'))
    or (old.status = 'verifying' and new.status in ('succeeded','failed'))
    or (old.status = 'failed' and new.status in ('queued','processing','dead_letter','cancelled'))
  ) then
    raise exception using errcode = '23514',
      message = format('Invalid publication job transition: %s -> %s', old.status, new.status);
  end if;

  if new.status in ('succeeded','dead_letter','cancelled') and new.completed_at is null then
    new.completed_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists publication_jobs_validate_transition on public.publication_jobs;
create trigger publication_jobs_validate_transition
before update of status on public.publication_jobs
for each row execute function private.validate_publication_job_transition();

drop trigger if exists publication_jobs_audit on public.publication_jobs;
create trigger publication_jobs_audit
after insert or delete or update on public.publication_jobs
for each row execute function private.audit_mutation();

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
  expected_checksum text;
  new_job_id uuid;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'Admin authorization required';
  end if;

  select * into locked_article from public.articles
  where id = p_article_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Story not found';
  end if;

  if p_action = 'unpublish' then
    selected_revision_id := null;
    selected_action := 'unpublish';
  elsif p_action = 'rollback' then
    selected_revision_id := p_target_revision_id;
    selected_action := 'rollback';
  else
    selected_revision_id := locked_article.current_draft_revision_id;
    selected_action := case
      when locked_article.published_revision_id is null then 'publish'
      else 'republish'
    end;
  end if;

  if selected_action <> 'unpublish' then
    select r.content_checksum into expected_checksum
    from public.article_revisions r
    where r.id = selected_revision_id
      and r.article_id = p_article_id;

    if expected_checksum is null then
      raise exception using errcode = '23514', message = 'A valid target revision is required';
    end if;

    if exists (
      select 1
      from private.validate_revision_for_publication(p_article_id, selected_revision_id)
      where severity = 'error'
    ) then
      raise exception using errcode = '23514', message = 'Story has publication validation errors';
    end if;

    if not exists (
      select 1 from public.citations c
      where c.revision_id = selected_revision_id and c.is_public
    ) then
      raise exception using errcode = '23514', message = 'At least one public citation is required';
    end if;

    if exists (
      select 1 from public.article_revisions r
      where r.id = selected_revision_id
        and nullif(btrim(r.seo_description), '') is null
    ) then
      raise exception using errcode = '23514', message = 'SEO description is required';
    end if;
  end if;

  insert into public.publication_jobs (
    article_id, target_revision_id, action, idempotency_key,
    expected_content_checksum, initiated_by
  ) values (
    p_article_id, selected_revision_id, selected_action, p_idempotency_key,
    expected_checksum, auth.uid()
  )
  on conflict (idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into new_job_id;

  update public.articles
  set status = 'publishing', updated_by = auth.uid()
  where id = p_article_id;

  return query
  select j.id, j.status
  from public.publication_jobs j
  where j.id = new_job_id;
end;
$$;

create or replace function public.claim_publication_jobs(
  claiming_worker_id text,
  batch_size integer default 1,
  lease_seconds integer default 120
)
returns setof public.publication_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  candidate_id uuid;
  claimed public.publication_jobs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Only the service role may claim publication jobs';
  end if;

  for candidate_id in
    select j.id
    from public.publication_jobs j
    where (
      (j.status in ('queued','failed') and j.available_at <= clock_timestamp())
      or (j.status in ('processing','committed','verifying') and j.lease_expires_at <= clock_timestamp())
    )
      and (j.status in ('processing','committed','verifying') or j.attempt_count < j.max_attempts)
    order by j.available_at, j.created_at
    for update skip locked
    limit least(greatest(batch_size,1),10)
  loop
    update public.publication_jobs j
    set status = case when j.status in ('queued','failed')
      then 'processing'::public.publication_job_status else j.status end,
        worker_id = claiming_worker_id,
        leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + make_interval(secs => greatest(lease_seconds,30)),
        attempt_count = case
          when j.status in ('committed','verifying') then j.attempt_count
          else j.attempt_count + 1
        end,
        expected_content_checksum = case
          when j.action = 'unpublish' then null
          when j.expected_content_checksum is not null then j.expected_content_checksum
          else (
            select r.content_checksum
            from public.article_revisions r
            where r.id = j.target_revision_id and r.article_id = j.article_id
          )
        end,
        error_code = null,
        error_detail = null,
        updated_at = clock_timestamp()
    where j.id = candidate_id
    returning j.* into claimed;

    if claimed.target_revision_id is not null and claimed.expected_content_checksum is null then
      raise exception using errcode = '23514', message = 'Publication job target revision checksum is unavailable';
    end if;

    perform private.append_publication_event_internal(
      claimed.id, 'job_claimed', 'info',
      'Publication job claimed by worker.',
      jsonb_build_object('worker_id', claiming_worker_id, 'attempt', claimed.attempt_count)
    );
    return next claimed;
  end loop;
end;
$$;

revoke execute on function public.request_story_publication(uuid,public.publication_action,uuid,uuid) from public,anon;
grant execute on function public.request_story_publication(uuid,public.publication_action,uuid,uuid) to authenticated;
revoke execute on function public.claim_publication_jobs(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_publication_jobs(text,integer,integer) to service_role;