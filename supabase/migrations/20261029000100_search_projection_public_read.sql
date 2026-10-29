-- PROPOSED (Remediation Phase 1, 2026-10-29): restore anon read access to
-- public.search_projection.
--
-- Status: NOT APPLIED to any shared/remote database. This file exists so the
-- change is reviewable and exercised only by the repository's ephemeral local
-- validation (db:validate and related scripts). Applying it to the live
-- Supabase project requires explicit approval (recovery plan Gate 3).
--
-- Why: audit 2026-10-28 confirmed schema drift. The repository chain creates
-- this grant and policy in 20260808000700_row_level_security_and_grants.sql,
-- but the live project has neither the anon SELECT grant nor the
-- search_projection_public_select policy. The public application's
-- /api/internal/publication verification route reads search_projection with
-- the anon role; without access its projection check fails, the worker
-- receives 422 render_rejected, and every publish/republish dead-letters.
--
-- Idempotency: GRANT is a no-op when the grant already exists, and the policy
-- is created only when absent, so this migration is safe on fresh local
-- replays (where 20260808000700 already created both) and on the drifted live
-- database (where both are missing), including repeated application.

grant select on public.search_projection to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'search_projection'
      and policyname = 'search_projection_public_select'
  ) then
    create policy search_projection_public_select
    on public.search_projection for select to anon, authenticated
    using (true);
  end if;
end $$;
