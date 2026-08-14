-- Subtext Media: authors and controlled taxonomy.

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text not null,
  slug text not null unique,
  bio_markdown text,
  bio_plain_text text,
  website_url text,
  avatar_media_asset_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authors_name_length check (char_length(name) between 1 and 120),
  constraint authors_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint authors_website_url_format check (
    website_url is null or website_url ~ '^https://'
  )
);

comment on table public.authors is 'Public byline identities. auth_user_id is nullable until the single founder identity is linked.';
comment on column public.authors.auth_user_id is 'Supabase Auth user UUID; intentionally no auth.users FK so editorial identity survives account recovery.';
comment on column public.authors.avatar_media_asset_id is 'Deferred FK to media_assets, added after the media table exists.';

create table public.pillars (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pillars_name_length check (char_length(name) between 1 and 80),
  constraint pillars_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint pillars_sort_order_nonnegative check (sort_order >= 0)
);

comment on table public.pillars is 'Top-level editorial pillars such as History, Business, Psychology, and Society.';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  pillar_id uuid not null references public.pillars(id) on update restrict on delete restrict,
  name text not null,
  slug text not null,
  description text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_length check (char_length(name) between 1 and 80),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint categories_sort_order_nonnegative check (sort_order >= 0),
  constraint categories_pillar_slug_unique unique (pillar_id, slug),
  constraint categories_pillar_name_unique unique (pillar_id, name)
);

comment on table public.categories is 'Second-level controlled taxonomy. Every category belongs to exactly one pillar.';

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_name_length check (char_length(name) between 1 and 80),
  constraint tags_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

comment on table public.tags is 'Cross-pillar discovery terms. Tags do not control canonical URLs.';

create index categories_pillar_sort_idx
  on public.categories (pillar_id, sort_order, name)
  where is_active;

create index pillars_active_sort_idx
  on public.pillars (sort_order, name)
  where is_active;

create index tags_active_name_idx
  on public.tags (name)
  where is_active;
