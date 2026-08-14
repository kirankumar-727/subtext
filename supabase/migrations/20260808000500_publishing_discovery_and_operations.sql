-- Subtext Media: publishing jobs/events, redirects, curated collections, search, settings, and audit.

create table public.redirects (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on update restrict on delete restrict,
  from_path text not null unique,
  to_path text not null,
  kind public.redirect_kind not null default 'manual',
  http_status smallint not null default 308,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint redirects_from_path_format check (from_path ~ '^/[^?#[:space:]]+$'),
  constraint redirects_to_path_format check (to_path ~ '^/[^?#[:space:]]+$'),
  constraint redirects_not_self check (from_path <> to_path),
  constraint redirects_status_valid check (http_status in (301, 308))
);

comment on table public.redirects is 'Permanent internal path redirects. Automatic slug/pillar changes and founder-created redirects share one registry.';

create table public.slug_history (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  pillar_id uuid not null references public.pillars(id) on update restrict on delete restrict,
  slug text not null,
  path text not null unique,
  redirect_id uuid not null unique references public.redirects(id) on update restrict on delete restrict,
  replaced_at timestamptz not null default now(),
  constraint slug_history_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint slug_history_path_format check (
    path ~ '^/[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint slug_history_article_path_unique unique (article_id, path)
);

comment on table public.slug_history is 'Immutable canonical path history linked one-to-one with the redirect created for that prior path.';

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  description text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_settings_key_format check (key ~ '^[a-z][a-z0-9]*(?:\.[a-z0-9]+)*$'),
  constraint site_settings_value_not_null check (jsonb_typeof(value) is not null)
);

comment on table public.site_settings is 'Typed-by-convention global publication configuration. Only rows marked public can be read anonymously.';

create table public.featured_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  status public.collection_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint featured_collections_name_length check (char_length(name) between 1 and 120),
  constraint featured_collections_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint featured_collections_window_valid check (
    starts_at is null or ends_at is null or starts_at < ends_at
  )
);

comment on table public.featured_collections is 'Founder-curated, optionally time-bounded editorial groupings used by the homepage and collection pages.';

create table public.featured_collection_items (
  collection_id uuid not null references public.featured_collections(id) on update restrict on delete cascade,
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  position integer not null,
  label text,
  created_at timestamptz not null default now(),
  primary key (collection_id, article_id),
  constraint featured_collection_items_position_nonnegative check (position >= 0),
  constraint featured_collection_items_position_unique unique (collection_id, position),
  constraint featured_collection_items_label_length check (label is null or char_length(label) <= 80)
);

comment on table public.featured_collection_items is 'Ordered many-to-many placement of articles inside featured collections.';

create table public.publication_jobs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  target_revision_id uuid references public.article_revisions(id) on update restrict on delete restrict,
  action public.publication_action not null,
  status public.publication_job_status not null default 'queued',
  idempotency_key uuid not null unique,
  expected_content_checksum text,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  worker_id text,
  initiated_by uuid,
  error_code text,
  error_detail jsonb,
  committed_at timestamptz,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_jobs_attempt_count_nonnegative check (attempt_count >= 0),
  constraint publication_jobs_max_attempts_positive check (max_attempts > 0),
  constraint publication_jobs_attempt_count_bounded check (attempt_count <= max_attempts),
  constraint publication_jobs_revision_action_valid check (
    (action = 'unpublish' and target_revision_id is null)
    or (action <> 'unpublish' and target_revision_id is not null)
  ),
  constraint publication_jobs_expected_checksum_format check (
    expected_content_checksum is null or expected_content_checksum ~ '^[0-9a-f]{64}$'
  ),
  constraint publication_jobs_lease_valid check (
    (leased_at is null and lease_expires_at is null and worker_id is null)
    or (leased_at is not null and lease_expires_at > leased_at and worker_id is not null)
  )
);

comment on table public.publication_jobs is 'Durable idempotent publication queue. Jobs target one immutable revision except unpublish actions.';

create table public.publication_events (
  id bigint generated always as identity primary key,
  publication_job_id uuid not null references public.publication_jobs(id) on update restrict on delete restrict,
  sequence integer not null,
  step text not null,
  level public.publication_event_level not null default 'info',
  message text not null,
  details jsonb,
  occurred_at timestamptz not null default now(),
  constraint publication_events_sequence_nonnegative check (sequence >= 0),
  constraint publication_events_step_format check (step ~ '^[a-z][a-z0-9_]*$'),
  constraint publication_events_message_present check (char_length(btrim(message)) > 0),
  constraint publication_events_job_sequence_unique unique (publication_job_id, sequence)
);

comment on table public.publication_events is 'Append-only step log for a publication job, including verification and retry diagnostics.';

create table public.search_projection (
  article_id uuid primary key references public.articles(id) on update restrict on delete cascade,
  revision_id uuid not null unique references public.article_revisions(id) on update restrict on delete restrict,
  author_id uuid not null references public.authors(id) on update restrict on delete restrict,
  pillar_id uuid not null references public.pillars(id) on update restrict on delete restrict,
  category_id uuid references public.categories(id) on update restrict on delete restrict,
  slug text not null,
  canonical_path text not null unique,
  title text not null,
  dek text,
  body_plain_text text not null,
  author_name text not null,
  pillar_name text not null,
  category_name text,
  tags text[] not null default '{}',
  tag_text text not null default '',
  published_at timestamptz not null,
  projection_updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(dek, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(author_name, '') || ' ' || coalesce(pillar_name, '') || ' ' || coalesce(category_name, '') || ' ' || coalesce(tag_text, '')), 'B')
    || setweight(to_tsvector('english'::regconfig, coalesce(body_plain_text, '')), 'C')
  ) stored not null,
  constraint search_projection_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

comment on table public.search_projection is 'Published-only denormalized search read model rebuilt from an article published revision and taxonomy.';
comment on column public.search_projection.search_vector is 'Generated weighted English/simple full-text vector; title has the highest weight.';

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_table text not null,
  entity_pk jsonb not null,
  old_values jsonb,
  new_values jsonb,
  request_id uuid,
  metadata jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_logs_action_format check (action ~ '^[a-z][a-z0-9_]*$'),
  constraint audit_logs_entity_table_format check (entity_table ~ '^[a-z][a-z0-9_]*$'),
  constraint audit_logs_entity_pk_object check (jsonb_typeof(entity_pk) = 'object')
);

comment on table public.audit_logs is 'Append-only security and editorial mutation trail. Large article bodies are excluded from snapshots.';

create index redirects_active_from_path_idx
  on public.redirects (from_path)
  where is_active;

create index slug_history_article_replaced_idx
  on public.slug_history (article_id, replaced_at desc);

create index site_settings_public_key_idx
  on public.site_settings (key)
  where is_public;

create index featured_collections_public_window_idx
  on public.featured_collections (status, starts_at, ends_at)
  where status = 'published';

create index featured_collection_items_article_idx
  on public.featured_collection_items (article_id, collection_id);

create index publication_jobs_claim_idx
  on public.publication_jobs (available_at, created_at)
  where status in ('queued', 'failed');

create index publication_jobs_lease_idx
  on public.publication_jobs (lease_expires_at)
  where status = 'processing';

create index publication_jobs_article_created_idx
  on public.publication_jobs (article_id, created_at desc);

create index publication_events_job_time_idx
  on public.publication_events (publication_job_id, occurred_at);

create index search_projection_vector_idx
  on public.search_projection using gin (search_vector);

create index search_projection_title_trgm_idx
  on public.search_projection using gin (title extensions.gin_trgm_ops);

create index search_projection_slug_trgm_idx
  on public.search_projection using gin (slug extensions.gin_trgm_ops);

create index search_projection_pillar_published_idx
  on public.search_projection (pillar_id, published_at desc);

create index search_projection_author_published_idx
  on public.search_projection (author_id, published_at desc);

create index search_projection_category_published_idx
  on public.search_projection (category_id, published_at desc)
  where category_id is not null;

create index audit_logs_entity_time_idx
  on public.audit_logs (entity_table, occurred_at desc);

create index audit_logs_actor_time_idx
  on public.audit_logs (actor_id, occurred_at desc)
  where actor_id is not null;
