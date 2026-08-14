-- M5 additive contract: durable worker commands over frozen publication tables.

create or replace function private.enforce_editorial_redirect_status()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.kind in ('slug_change', 'pillar_change') then new.http_status := 301; end if;
  return new;
end;
$$;

create trigger redirects_enforce_editorial_status
before insert or update of kind, http_status on public.redirects
for each row execute function private.enforce_editorial_redirect_status();

update public.redirects set http_status = 301
where kind in ('slug_change', 'pillar_change') and http_status <> 301;

create or replace function private.append_publication_event_internal(
  target_job_id uuid,
  event_step text,
  event_level public.publication_event_level,
  event_message text,
  event_details jsonb default null
)
returns bigint
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  next_sequence integer;
  event_id bigint;
begin
  perform 1 from public.publication_jobs where id = target_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Publication job not found'; end if;
  select coalesce(max(sequence), -1) + 1 into next_sequence
  from public.publication_events where publication_job_id = target_job_id;
  insert into public.publication_events(publication_job_id, sequence, step, level, message, details)
  values(target_job_id, next_sequence, event_step, event_level, event_message, event_details)
  returning id into event_id;
  return event_id;
end;
$$;

create or replace function private.record_publication_job_created()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  perform private.append_publication_event_internal(
    new.id, 'job_created', 'info', 'Publication job created.',
    jsonb_build_object('action', new.action, 'target_revision_id', new.target_revision_id)
  );
  return new;
end;
$$;

create trigger publication_jobs_record_created
after insert on public.publication_jobs
for each row execute function private.record_publication_job_created();

create or replace function public.append_publication_event(
  p_job_id uuid,
  p_step text,
  p_level public.publication_event_level,
  p_message text,
  p_details jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Worker authorization required';
  end if;
  return private.append_publication_event_internal(p_job_id, p_step, p_level, p_message, p_details);
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
      (j.status in ('queued', 'failed') and j.available_at <= clock_timestamp())
      or (j.status in ('processing', 'committed', 'verifying') and j.lease_expires_at <= clock_timestamp())
    )
      and (j.status in ('processing', 'committed', 'verifying') or j.attempt_count < j.max_attempts)
    order by j.available_at, j.created_at
    for update skip locked
    limit least(greatest(batch_size, 1), 10)
  loop
    update public.publication_jobs j
    set status = case when j.status in ('queued', 'failed') then 'processing'::public.publication_job_status else j.status end,
        worker_id = claiming_worker_id,
        leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + make_interval(secs => greatest(lease_seconds, 30)),
        attempt_count = case
          when j.status in ('committed', 'verifying') then j.attempt_count
          when j.status = 'processing' and j.attempt_count >= j.max_attempts then j.attempt_count
          else j.attempt_count + 1
        end,
        error_code = null,
        error_detail = null,
        updated_at = clock_timestamp()
    where j.id = candidate_id
    returning j.* into claimed;

    perform private.append_publication_event_internal(
      claimed.id,
      'job_claimed',
      'info',
      'Publication job claimed by worker.',
      jsonb_build_object('worker_id', claiming_worker_id, 'attempt', claimed.attempt_count)
    );
    return next claimed;
  end loop;
end;
$$;

create or replace function public.extend_publication_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Worker authorization required';
  end if;
  update public.publication_jobs
  set lease_expires_at = clock_timestamp() + make_interval(secs => greatest(p_lease_seconds, 30)),
      updated_at = clock_timestamp()
  where id = p_job_id and status = 'processing' and worker_id = p_worker_id;
  return found;
end;
$$;

create or replace function public.commit_publication_job(
  p_job_id uuid,
  p_worker_id text
)
returns table (
  article_id uuid,
  publication_action public.publication_action,
  canonical_path text,
  pillar_slug text,
  category_slug text,
  content_checksum text,
  target_revision_id uuid,
  already_committed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  job public.publication_jobs%rowtype;
  article public.articles%rowtype;
  revision public.article_revisions%rowtype;
  result_pillar_slug text;
  result_category_slug text;
  was_committed boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Worker authorization required';
  end if;
  select * into job from public.publication_jobs where id = p_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Publication job not found'; end if;
  if job.status = 'succeeded' then
    was_committed := true;
  elsif job.status in ('committed', 'verifying') and job.worker_id is not distinct from p_worker_id then
    was_committed := true;
  elsif job.status <> 'processing' or job.worker_id is distinct from p_worker_id then
    raise exception using errcode = '55000', message = 'Worker does not own this publication job';
  else
    was_committed := job.committed_at is not null;
  end if;

  select * into article from public.articles where id = job.article_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Article not found'; end if;

  if not was_committed then
    if job.action = 'unpublish' then
      update public.articles
      set status = 'unpublished', updated_by = job.initiated_by
      where id = article.id;
    else
      select r.* into revision from public.article_revisions r
      where r.id = job.target_revision_id and r.article_id = article.id;
      if not found then raise exception using errcode = '23514', message = 'Target revision is invalid'; end if;
      if revision.content_checksum is distinct from job.expected_content_checksum then
        raise exception using errcode = '23514', message = 'Target revision checksum changed';
      end if;
      if job.action in ('publish', 'republish') and article.current_draft_revision_id is distinct from revision.id then
        raise exception using errcode = '55000', message = 'Publication request is stale';
      end if;
      if not exists (
        select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where c.oid = 'public.article_revisions'::regclass
          and t.tgname = 'article_revisions_immutable' and not t.tgisinternal
      ) then
        raise exception using errcode = '55000', message = 'Revision immutability guard is missing';
      end if;
      if exists (
        select 1 from private.validate_revision_for_publication(article.id, revision.id)
        where severity = 'error'
      ) then
        raise exception using errcode = '23514', message = 'Publication validation failed';
      end if;
      if not exists (
        select 1 from public.citations c join public.sources s on s.id = c.source_id
        where c.revision_id = revision.id and c.is_public
      ) then
        raise exception using errcode = '23514', message = 'At least one public citation is required';
      end if;
      if nullif(btrim(revision.seo_description), '') is null then
        raise exception using errcode = '23514', message = 'SEO description is required';
      end if;

      update public.articles
      set published_revision_id = revision.id,
          status = 'published_pending_verification',
          first_published_at = coalesce(first_published_at, clock_timestamp()),
          last_published_at = clock_timestamp(),
          scheduled_for = null,
          updated_by = job.initiated_by
      where id = article.id;
    end if;

    update public.publication_jobs
    set status = 'committed', committed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = job.id;
    perform private.append_publication_event_internal(job.id, 'database_committed', 'info',
      case when job.action = 'unpublish' then 'Article removed from public projection.' else 'Immutable revision promoted to public projection.' end,
      jsonb_build_object('action', job.action, 'revision_id', job.target_revision_id));
  end if;

  select * into article from public.articles where id = job.article_id;
  select p.slug, c.slug into result_pillar_slug, result_category_slug
  from public.pillars p
  left join public.categories c on c.id = article.category_id
  where p.id = article.primary_pillar_id;

  return query select
    article.id, job.action, article.canonical_path, result_pillar_slug,
    result_category_slug, case when job.action = 'unpublish' then null else job.expected_content_checksum end,
    job.target_revision_id, was_committed;
end;
$$;

create or replace function public.mark_publication_job_verifying(p_job_id uuid, p_worker_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode='42501',message='Worker authorization required'; end if;
  update public.publication_jobs set status='verifying', updated_at=clock_timestamp()
  where id=p_job_id and status='committed' and worker_id=p_worker_id;
  if not found then raise exception using errcode='55000',message='Job is not ready for verification'; end if;
  perform private.append_publication_event_internal(p_job_id,'verification_started','info','Public projection verification started.',null);
end;
$$;

create or replace function public.succeed_publication_job(p_job_id uuid, p_worker_id text, p_details jsonb default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare job public.publication_jobs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode='42501',message='Worker authorization required'; end if;
  select * into job from public.publication_jobs where id=p_job_id for update;
  if job.status='succeeded' then return; end if;
  if job.status<>'verifying' or job.worker_id is distinct from p_worker_id then raise exception using errcode='55000',message='Job is not being verified by this worker'; end if;
  update public.publication_jobs set status='succeeded',verified_at=clock_timestamp(),completed_at=clock_timestamp(),lease_expires_at=null,leased_at=null,worker_id=null,updated_at=clock_timestamp() where id=p_job_id;
  if job.action <> 'unpublish' then
    update public.articles set status='published',updated_by=job.initiated_by
    where id=job.article_id and published_revision_id=job.target_revision_id and status='published_pending_verification';
  end if;
  perform private.append_publication_event_internal(p_job_id,'publication_succeeded','info','Publication verified successfully.',p_details);
end;
$$;

create or replace function public.fail_publication_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_error_detail jsonb,
  p_retryable boolean
)
returns table (final_status public.publication_job_status, next_attempt_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare job public.publication_jobs%rowtype; retry_at timestamptz; terminal boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode='42501',message='Worker authorization required'; end if;
  select * into job from public.publication_jobs where id=p_job_id for update;
  if not found then raise exception using errcode='P0002',message='Publication job not found'; end if;
  if job.status in ('succeeded','dead_letter','cancelled') then return query select job.status,job.available_at; return; end if;
  if job.worker_id is distinct from p_worker_id then raise exception using errcode='55000',message='Worker does not own this job'; end if;
  terminal := (not p_retryable) or job.attempt_count >= job.max_attempts;
  retry_at := case when terminal then null else clock_timestamp() + make_interval(secs => least(3600, 30 * (2 ^ greatest(job.attempt_count - 1, 0))::integer)) end;
  update public.publication_jobs set status='failed',error_code=left(p_error_code,120),error_detail=p_error_detail,available_at=coalesce(retry_at,available_at),lease_expires_at=null,leased_at=null,worker_id=null,updated_at=clock_timestamp() where id=job.id;
  if terminal then
    update public.publication_jobs set status='dead_letter',completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=job.id;
  end if;
  if job.committed_at is null then
    update public.articles
    set status = case when published_revision_id is null then 'draft'::public.article_status else 'published'::public.article_status end,
        updated_by = job.initiated_by
    where id=job.article_id and status='publishing';
  end if;
  perform private.append_publication_event_internal(job.id,
    case when terminal then 'publication_failed' else 'retry_scheduled' end,
    'error', case when terminal then 'Publication failed permanently.' else 'Publication failed; retry scheduled.' end,
    jsonb_build_object('error_code',p_error_code,'retryable',p_retryable,'next_attempt_at',retry_at));
  return query select case when terminal then 'dead_letter'::public.publication_job_status else 'failed'::public.publication_job_status end,retry_at;
end;
$$;

revoke execute on function public.append_publication_event(uuid,text,public.publication_event_level,text,jsonb) from public,anon,authenticated;
revoke execute on function public.extend_publication_job_lease(uuid,text,integer) from public,anon,authenticated;
revoke execute on function public.commit_publication_job(uuid,text) from public,anon,authenticated;
revoke execute on function public.mark_publication_job_verifying(uuid,text) from public,anon,authenticated;
revoke execute on function public.succeed_publication_job(uuid,text,jsonb) from public,anon,authenticated;
revoke execute on function public.fail_publication_job(uuid,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.append_publication_event(uuid,text,public.publication_event_level,text,jsonb) to service_role;
grant execute on function public.extend_publication_job_lease(uuid,text,integer) to service_role;
grant execute on function public.commit_publication_job(uuid,text) to service_role;
grant execute on function public.mark_publication_job_verifying(uuid,text) to service_role;
grant execute on function public.succeed_publication_job(uuid,text,jsonb) to service_role;
grant execute on function public.fail_publication_job(uuid,text,text,jsonb,boolean) to service_role;
