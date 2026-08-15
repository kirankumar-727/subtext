# Subtext Media

Premium, research-driven documentary publishing. Everything has a subtext.

## 📂 Repository

This is a private npm-workspaces/Turborepo monorepo with three architectural boundaries:

- `apps/public` — public reader application (`subtext.media`)
- `apps/admin` — private founder workspace (`admin.subtext.media`)
- `supabase` — database, authentication hooks, Storage policy, and publishing worker foundation

Shared packages:

- `packages/ui` — shared design tokens and framework-neutral React UI
- `packages/env` — typed public/server environment contracts
- `packages/supabase` — browser, request-scoped server, and privileged server clients
- `packages/typescript-config` — strict shared TypeScript settings
- `packages/eslint-config` — shared flat ESLint settings

## ⚙️ Requirements

- Node.js 22.23.2 (see `.nvmrc` and `.node-version`)
- npm 11+
- Docker-compatible runtime only when running Supabase locally
- Supabase CLI is installed as a project development dependency

## 💻 Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` only where needed. Never commit real values.
3. Run `npm run dev` for both applications, or use `npm run dev:public` / `npm run dev:admin`.
4. Open the public application at `http://localhost:3000` and admin at `http://localhost:3001`.

Supabase local services will become runnable with `npm run supabase:start` when Docker is available.

## 🔗 Quality commands

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check` — complete local/CI quality gate

## 🔻 Environment contract

The root `.env.example` documents every planned variable. Public variables use the
`NEXT_PUBLIC_` prefix. `SUPABASE_SECRET_KEY`, founder admission data, signing keys, and
cron/revalidation secrets are server-only and must never enter a browser bundle.

## 🌐 Vercel projects

Create two projects from the same GitHub repository:

| Vercel project | Root directory | Production domain     |
| -------------- | -------------- | --------------------- |
| Subtext Public | `apps/public`  | `subtext.media`       |
| Subtext Admin  | `apps/admin`   | `admin.subtext.media` |

Enable source files outside each Root Directory so workspace packages and the root lockfile are available. Use npm and the detected Next.js settings. Configure separate Preview and Production environment values. Cloudflare remains authoritative DNS; keep Vercel application records DNS-only unless a proxied design is tested explicitly.

Vercel Hobby may be used only while the deployment is eligible under Vercel's non-commercial terms. Upgrade the existing projects before commercial use.

##🎯 Database contract

All database changes are ordered SQL migrations in `supabase/migrations`. Dashboard schema edits are prohibited.

- `npm run db:validate` — applies every migration to ephemeral PostgreSQL, validates constraints/RLS/behavior, tests destructive rollback, and reapplies migrations.
- `npm run db:generate` — regenerates TypeScript types, the ER diagram, dependency graph, schema reference, and machine-readable snapshot.
- `npm run db:check-generated` — fails when generated artifacts do not match the final migration schema.
- `npm run supabase:start` / `npm run supabase:reset` — run the complete Supabase stack when Docker is available.
- `npm run supabase:types:local` — optional parity check against Supabase CLI-generated types after the local stack is running.

Generated artifacts:

- `packages/supabase/src/database.types.ts`
- `docs/database/er-diagram.md`, `.mmd`, `.dot`, and `.svg`
- `docs/database/dependency-graph.md`, `.mmd`, `.dot`, and `.svg`
- `docs/database/schema-reference.md`
- `docs/database/schema.snapshot.json`

The rollback SQL in `supabase/rollbacks` is destructive and intended for migration verification before production. It refuses to remove media bucket metadata while Storage objects exist.

## 🈴 Authentication contract

Google OAuth is the only identity path. Signed Supabase Auth hooks enforce exact-email admission and issue the `user_role=admin` RLS claim only to the configured founder. Next.js Proxy performs early session refresh/rejection; protected layouts, APIs, server actions, and privileged-client gateways repeat authorization on the server.

- `npm run auth:validate` — application authorization and PostgreSQL RLS integration tests
- `npm run auth:check:functions` — Deno type-check for both signed Auth hook functions
- `npm run auth:test:functions` — Standard Webhooks signature and founder-policy tests
- `npm run auth:generate` — regenerate the authentication flow diagram
- `npm run auth:configure` — validate production Auth configuration; append `-- --apply` to update Supabase through its Management API
- `npm run auth:verify-source` — enforce API/action/privileged-client source boundaries
- `npm run auth:verify-bundles` — verify browser bundles contain no privileged credentials or server configuration

See `docs/authentication/` for setup, session lifecycle, failure handling, RLS interaction, and the generated flow diagram.

## 📲 Launch validation

- `npm run launch:env:test` — fail-closed environment contract tests
- `npm run launch:env -- --target=<public|admin|supabase-functions|operator|all>` — validate private production configuration without printing values
- `npm run launch:domain-audit` — inspect DNS/origin routing without credentials
- `npm run launch:production` — black-box deployed article/search/sitemap/RSS/SEO validation
- `npm run launch:build-audit` — public JavaScript/CSS/client-component budget
- `npm run launch:check-generated` — synchronize final architecture and environment artifacts

See `docs/launch/README.md` for current blockers and sign-off requirements.

##🎯 Milestone status

- [x] M1 — Monorepo and application foundation
- [x] M2 — Database schema, RLS, Storage policy, generated types, and synchronized documentation
- [x] M3 — Google authentication, exact-email admission, protected routes/APIs/actions, and RLS integration
- [x] M4 — Writer Workspace, canonical Markdown editor, autosave, media, sources, preview, and publication requests
- [x] M5 — Durable publishing worker, atomic projection, retries, revalidation, search, sitemap, RSS, and verification
- [x] M6 — Public editorial website, pillar archives, long-form reading, search, SEO, media, sitemap, and RSS
- [ ] M7 — Production E2E validation (implementation hardened; blocked on production deployment, DNS and founder-operated real article test)
