-- Subtext Media: private originals, deterministic derivatives, and revision-scoped media use.

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  kind public.media_kind not null default 'image',
  original_filename text not null,
  original_storage_key text not null unique,
  checksum_sha256 text not null,
  mime_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  duration_seconds numeric(12, 3),
  default_alt_text text,
  default_caption text,
  creator_text text,
  credit_text text,
  source_url text,
  rights_status public.media_rights_status not null default 'unknown',
  rights_details text,
  rights_expires_at date,
  focal_x numeric(5, 4),
  focal_y numeric(5, 4),
  processing_status public.media_processing_status not null default 'pending',
  processing_error text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_filename_present check (char_length(btrim(original_filename)) > 0),
  constraint media_assets_storage_key_format check (
    original_storage_key ~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$'
    and original_storage_key !~ '(^|/)\.\.(/|$)'
  ),
  constraint media_assets_checksum_format check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint media_assets_mime_type_format check (mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  constraint media_assets_byte_size_positive check (byte_size > 0),
  constraint media_assets_dimensions_valid check (
    (width is null and height is null)
    or (width > 0 and height > 0)
  ),
  constraint media_assets_duration_nonnegative check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint media_assets_source_url_format check (
    source_url is null or source_url ~ '^https?://'
  ),
  constraint media_assets_focal_x_range check (focal_x is null or focal_x between 0 and 1),
  constraint media_assets_focal_y_range check (focal_y is null or focal_y between 0 and 1),
  constraint media_assets_processing_error_valid check (
    processing_status = 'failed' or processing_error is null
  )
);

comment on table public.media_assets is 'Private master asset metadata, provenance, rights, focal point, and processing state.';
comment on column public.media_assets.original_storage_key is 'Logical key in the private media-originals bucket; never exposed through public views.';
comment on column public.media_assets.checksum_sha256 is 'Lowercase SHA-256 checksum of original bytes for integrity and deduplication.';

create unique index media_assets_checksum_unique_idx
  on public.media_assets (checksum_sha256, byte_size);

create index authors_avatar_media_asset_idx
  on public.authors (avatar_media_asset_id)
  where avatar_media_asset_id is not null;

create table public.media_variants (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references public.media_assets(id) on update restrict on delete restrict,
  variant_name text not null,
  storage_key text not null unique,
  mime_type text not null,
  format text not null,
  width integer,
  height integer,
  byte_size bigint not null,
  checksum_sha256 text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  constraint media_variants_name_format check (variant_name ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint media_variants_storage_key_format check (
    storage_key ~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$'
    and storage_key !~ '(^|/)\.\.(/|$)'
  ),
  constraint media_variants_mime_type_format check (mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  constraint media_variants_format check (format ~ '^[a-z0-9]+$'),
  constraint media_variants_dimensions_valid check (
    (width is null and height is null)
    or (width > 0 and height > 0)
  ),
  constraint media_variants_byte_size_positive check (byte_size > 0),
  constraint media_variants_checksum_format check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint media_variants_asset_name_unique unique (media_asset_id, variant_name)
);

comment on table public.media_variants is 'Pre-generated immutable delivery variants. Public variants map to media-public Storage objects.';

create table public.article_media (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.article_revisions(id) on update restrict on delete restrict,
  media_asset_id uuid not null references public.media_assets(id) on update restrict on delete restrict,
  role public.media_role not null,
  position integer not null default 0,
  alt_text text,
  caption text,
  credit_override text,
  created_at timestamptz not null default now(),
  constraint article_media_position_nonnegative check (position >= 0),
  constraint article_media_revision_role_position_unique unique (revision_id, role, position)
);

comment on table public.article_media is 'Revision-scoped placement, accessibility text, caption, credit, and order for media assets.';

create unique index article_media_one_hero_per_revision_idx
  on public.article_media (revision_id)
  where role = 'hero';

create index article_media_asset_idx
  on public.article_media (media_asset_id, revision_id);

create index media_variants_asset_public_idx
  on public.media_variants (media_asset_id, variant_name)
  where is_public;

create index media_assets_processing_idx
  on public.media_assets (processing_status, created_at)
  where processing_status <> 'ready';

alter table public.authors
  add constraint authors_avatar_media_asset_fk
  foreign key (avatar_media_asset_id)
  references public.media_assets(id)
  on update restrict
  on delete set null;
