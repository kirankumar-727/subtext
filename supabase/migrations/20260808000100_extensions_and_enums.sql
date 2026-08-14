-- Subtext Media: foundational schemas, extension, and enum contracts.

create schema if not exists private;
comment on schema private is 'Non-API helper functions and authorization primitives for Subtext Media.';

revoke all on schema private from public, anon, authenticated;

grant usage on schema private to service_role;

create extension if not exists pg_trgm with schema extensions;

create or replace function private.sha256_text(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select encode(sha256(convert_to(value, 'UTF8')), 'hex');
$$;

comment on function private.sha256_text(text) is 'Immutable SHA-256 text helper used by generated integrity fingerprints.';

create type public.article_status as enum (
  'draft',
  'scheduled',
  'publishing',
  'published_pending_verification',
  'published',
  'unpublished',
  'archived'
);

create type public.revision_kind as enum (
  'draft',
  'publication',
  'correction',
  'rollback',
  'import'
);

create type public.source_type as enum (
  'book',
  'journal_article',
  'news_article',
  'website',
  'report',
  'archive',
  'interview',
  'dataset',
  'video',
  'other'
);

create type public.media_kind as enum (
  'image',
  'audio',
  'video',
  'document'
);

create type public.media_processing_status as enum (
  'pending',
  'processing',
  'ready',
  'failed'
);

create type public.media_rights_status as enum (
  'unknown',
  'owned',
  'licensed',
  'public_domain',
  'creative_commons',
  'permission_granted',
  'restricted'
);

create type public.media_role as enum (
  'hero',
  'inline',
  'gallery',
  'social'
);

create type public.publication_action as enum (
  'publish',
  'republish',
  'rollback',
  'unpublish',
  'schedule'
);

create type public.publication_job_status as enum (
  'queued',
  'processing',
  'committed',
  'verifying',
  'succeeded',
  'failed',
  'dead_letter',
  'cancelled'
);

create type public.publication_event_level as enum (
  'info',
  'warning',
  'error'
);

create type public.redirect_kind as enum (
  'slug_change',
  'pillar_change',
  'manual',
  'unpublish'
);

create type public.collection_status as enum (
  'draft',
  'published',
  'archived'
);
