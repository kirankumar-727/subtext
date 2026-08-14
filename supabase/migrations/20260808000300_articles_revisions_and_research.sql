-- Subtext Media: stable article identities, immutable revisions, taxonomy joins, and research provenance.

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on update restrict on delete restrict,
  primary_pillar_id uuid not null references public.pillars(id) on update restrict on delete restrict,
  category_id uuid references public.categories(id) on update restrict on delete restrict,
  canonical_slug text not null,
  canonical_path text not null,
  status public.article_status not null default 'draft',
  current_draft_revision_id uuid,
  published_revision_id uuid,
  revision_counter integer not null default 0,
  first_published_at timestamptz,
  last_published_at timestamptz,
  scheduled_for timestamptz,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  constraint articles_slug_format check (
    canonical_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint articles_path_format check (
    canonical_path ~ '^/[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint articles_canonical_path_unique unique (canonical_path),
  constraint articles_current_draft_revision_unique unique (current_draft_revision_id),
  constraint articles_published_revision_unique unique (published_revision_id),
  constraint articles_revision_counter_nonnegative check (revision_counter >= 0),
  constraint articles_publication_dates_valid check (
    first_published_at is null
    or last_published_at is null
    or first_published_at <= last_published_at
  ),
  constraint articles_schedule_state_valid check (
    (status = 'scheduled' and scheduled_for is not null)
    or (status <> 'scheduled')
  ),
  constraint articles_archive_state_valid check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived')
  )
);

comment on table public.articles is 'Stable article identities and lifecycle pointers. Reader-visible content always comes from published_revision_id.';
comment on column public.articles.canonical_path is 'Derived /{pillar}/{slug} path maintained by a trigger.';
comment on column public.articles.row_version is 'Optimistic-concurrency token incremented on meaningful article updates.';
comment on column public.articles.revision_counter is 'Atomic per-article sequence source for immutable revision numbers.';

create table public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  revision_number integer not null,
  revision_kind public.revision_kind not null default 'draft',
  supersedes_revision_id uuid references public.article_revisions(id) on update restrict on delete restrict,
  title text not null,
  dek text,
  body_markdown text not null,
  body_plain_text text not null,
  word_count integer not null,
  reading_time_minutes integer not null,
  seo_title text,
  seo_description text,
  social_title text,
  social_description text,
  change_summary text,
  is_material_update boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  content_checksum text generated always as (
    private.sha256_text(
      title || E'\n--dek--\n' || coalesce(dek, '') || E'\n--body--\n' || body_markdown
    )
  ) stored not null,
  constraint article_revisions_number_positive check (revision_number > 0),
  constraint article_revisions_title_length check (char_length(title) between 1 and 180),
  constraint article_revisions_dek_length check (dek is null or char_length(dek) <= 360),
  constraint article_revisions_body_present check (char_length(btrim(body_markdown)) > 0),
  constraint article_revisions_word_count_nonnegative check (word_count >= 0),
  constraint article_revisions_reading_time_positive check (reading_time_minutes > 0),
  constraint article_revisions_seo_title_length check (
    seo_title is null or char_length(seo_title) <= 120
  ),
  constraint article_revisions_seo_description_length check (
    seo_description is null or char_length(seo_description) <= 320
  ),
  constraint article_revisions_article_number_unique unique (article_id, revision_number)
);

comment on table public.article_revisions is 'Immutable snapshots of all reader-visible article content and deterministic metadata.';
comment on column public.article_revisions.content_checksum is 'Generated SHA-256 fingerprint of title, dek, and canonical Markdown.';
comment on column public.article_revisions.supersedes_revision_id is 'Optional lineage pointer to the prior immutable revision.';

alter table public.articles
  add constraint articles_current_draft_revision_fk
  foreign key (current_draft_revision_id)
  references public.article_revisions(id)
  on update restrict
  on delete restrict
  deferrable initially deferred;

alter table public.articles
  add constraint articles_published_revision_fk
  foreign key (published_revision_id)
  references public.article_revisions(id)
  on update restrict
  on delete restrict
  deferrable initially deferred;

create table public.article_tags (
  article_id uuid not null references public.articles(id) on update restrict on delete cascade,
  tag_id uuid not null references public.tags(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  primary key (article_id, tag_id)
);

comment on table public.article_tags is 'Many-to-many relationship between stable articles and discovery tags.';

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  source_type public.source_type not null,
  title text not null,
  author_text text,
  publisher text,
  publication_date date,
  url text,
  archive_url text,
  isbn text,
  doi text,
  accessed_at date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_fingerprint text generated always as (
    private.sha256_text(
      lower(title) || E'\n' || lower(coalesce(author_text, '')) || E'\n'
      || lower(coalesce(url, '')) || E'\n' || lower(coalesce(doi, ''))
    )
  ) stored not null,
  constraint sources_title_length check (char_length(title) between 1 and 500),
  constraint sources_url_format check (url is null or url ~ '^https?://'),
  constraint sources_archive_url_format check (archive_url is null or archive_url ~ '^https?://'),
  constraint sources_doi_length check (doi is null or char_length(doi) <= 200),
  constraint sources_fingerprint_unique unique (source_fingerprint)
);

comment on table public.sources is 'Normalized bibliographic and web source records reusable across article revisions.';
comment on column public.sources.source_fingerprint is 'Generated deduplication fingerprint; not a security credential.';

create table public.source_notes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on update restrict on delete cascade,
  note_markdown text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_notes_body_present check (char_length(btrim(note_markdown)) > 0)
);

comment on table public.source_notes is 'Private founder research notes. This table is never readable by anonymous users.';

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.article_revisions(id) on update restrict on delete restrict,
  source_id uuid not null references public.sources(id) on update restrict on delete restrict,
  ordinal integer not null,
  citation_key text not null,
  citation_text text not null,
  locator text,
  public_note text,
  quoted_text text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  constraint citations_ordinal_positive check (ordinal > 0),
  constraint citations_key_format check (citation_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]*$'),
  constraint citations_text_present check (char_length(btrim(citation_text)) > 0),
  constraint citations_revision_ordinal_unique unique (revision_id, ordinal),
  constraint citations_revision_key_unique unique (revision_id, citation_key)
);

comment on table public.citations is 'Ordered links from an immutable revision to normalized sources, with public locator/quotation data.';

create index articles_status_published_idx
  on public.articles (status, last_published_at desc)
  where status in ('published_pending_verification', 'published');

create index articles_pillar_status_idx
  on public.articles (primary_pillar_id, status, last_published_at desc);

create index articles_category_status_idx
  on public.articles (category_id, status, last_published_at desc)
  where category_id is not null;

create index articles_author_status_idx
  on public.articles (author_id, status, last_published_at desc);

create index article_revisions_article_created_idx
  on public.article_revisions (article_id, created_at desc);

create index article_revisions_supersedes_idx
  on public.article_revisions (supersedes_revision_id)
  where supersedes_revision_id is not null;

create index article_tags_tag_article_idx
  on public.article_tags (tag_id, article_id);

create index source_notes_source_idx
  on public.source_notes (source_id, created_at desc);

create index citations_source_idx
  on public.citations (source_id);

create index citations_revision_public_idx
  on public.citations (revision_id, ordinal)
  where is_public;
