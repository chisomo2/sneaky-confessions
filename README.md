# DMI Confessions

Anonymous campus confessions with optional pseudonymous aliases, karma, reactions,
threaded comments and a live leaderboard. Installable as a PWA.

Built with React 19 + TanStack Start (SSR), Tailwind CSS 4, Supabase (Postgres,
Auth, Realtime) and deployed to Vercel through Nitro.

## Requirements

- Node.js 22 or newer
- npm 10+
- A Supabase project (free tier is enough)

## Local development

```sh
npm install
cp .env.example .env     # then fill in your Supabase values
npm run dev              # http://localhost:8080
```

`.env` is git-ignored. Only `.env.example` is committed.

### Environment variables

| Variable                        | Where                    | Purpose                                |
| ------------------------------- | ------------------------ | -------------------------------------- |
| `VITE_SUPABASE_URL`             | browser + build          | Supabase project URL                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser + build          | Supabase anon / publishable key        |
| `SUPABASE_URL`                  | server runtime           | Same URL for SSR                       |
| `SUPABASE_PUBLISHABLE_KEY`      | server runtime           | Same key for SSR                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only              | Admin client; bypasses RLS. Never ship |
| `SUPABASE_DB_URL`               | local tooling only       | Direct Postgres URL for drizzle-kit    |

`VITE_*` values are inlined into the client bundle at build time, so they must be
present when the build runs. Never put the service-role key in a `VITE_` variable.

## Scripts

```sh
npm run dev        # Vite dev server
npm run build      # production build (.vercel/output)
npm run lint       # ESLint + Prettier
npm test           # Vitest unit tests
npm run test:db    # PGlite harness: runs every migration from scratch
```

`npm run test:db` needs no database or secrets. It boots an empty in-memory
Postgres (PGlite), applies `0000` → `0005` in order and asserts RLS, rate limits,
report dedupe, feed ranking/search/pagination, the posting kill switch, retention
cleanup, threaded comments and the live handover query (69 checks).

## Database migrations

Migrations are append-only. Files live in `drizzle/migrations/` and each one is
applied once, in numeric order.

**New Supabase project** — run all of them, in this exact order, in the SQL
editor (or via `psql "$SUPABASE_DB_URL" -f <file>`):

1. `0000_migration.sql` — bootstrap schema, RLS, RPCs
2. `0001_hardening.sql` — anonymous sessions, rate limits, reports, kill switch
3. `0002_product_ops.sql` — feed pagination, notifications, retention
4. `0003_security_perf.sql` — privileges, IP hashing, moderation, indexes
5. `0004_comment_threads.sql` — threaded replies (`comments.parent_id`)
6. `0005_feed_rank.sql` — Latest is the default feed; Hot ranks by popularity

**Existing project** — never re-run an applied migration. To change the schema,
add `drizzle/migrations/0006_*.sql`, add it to `scripts/verify-db.mjs`, then run
the harness before applying it.

After a fresh setup, grant yourself admin once:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where handle = 'yourhandle'
on conflict do nothing;
```

The admin panel lives at `/admin`.

## Supabase configuration

1. **Authentication → Providers:** enable **Anonymous sign-ins**. Guests browse,
   vote, react and comment through a signed anonymous session.
2. **Authentication → URL Configuration:** set Site URL to the production origin,
   and add `<origin>/reset-password` (production and `http://localhost:8080`).
3. **Email confirmation** is optional; alias emails are never shown publicly.
4. **Realtime:** `0002` adds `notifications` to the `supabase_realtime`
   publication when it exists. The client also polls every 30 seconds as a
   fallback.
5. **Google sign-in** (optional): enable the Google provider in Supabase and add
   `<origin>` to the provider's authorized redirect URLs. Without it the
   "Continue with Google" button reports a configuration error; email/password
   and anonymous use are unaffected.

## Deploy to Vercel

The build targets Nitro's `vercel` preset and emits `.vercel/output` (Vercel's
Build Output API), so no custom output directory is needed.

1. Push this repository to GitHub.
2. In Vercel: **New Project → Import** the repository. Framework preset: **Other**.
   Build command `npm run build`, install `npm install`, Node 22+.
3. Add environment variables for **Production, Preview and Development**:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, and (server only) `SUPABASE_SERVICE_ROLE_KEY`.
   Redeploy after changing any `VITE_*` value — they are baked in at build time.
4. After the first deploy, set the Supabase Site URL to the Vercel domain and add
   the password-reset redirect.

Full runbook: [`docs/deployment.md`](docs/deployment.md).

## Operations

- **Pause posting:** Admin → Settings → posting switch. It blocks new confessions
  and comments for everyone while browsing, voting and reports keep working.
- **Retention cleanup:** Admin → Settings → Run cleanup removes write-rate events
  older than 30 days, read notifications older than 90 days and reports older than
  180 days. To schedule it as the database owner (requires `pg_cron`):

  ```sql
  select cron.schedule('retention-cleanup', '17 3 * * *', $$select public.retention_cleanup_internal()$$);
  ```

- **Privacy:** guest and incognito writes are pseudonymous, not untraceable. The
  app stores an anti-abuse record keyed to the signed anonymous session plus a
  salted hash of the first forwarded IP; raw IP addresses are not stored.

## Project conventions

- Discussion overlays live in a root provider and reuse `CommentThread` with
  direct confession links, so feed and profile scroll positions survive opening
  comments.
- Likes map onto the existing `cast_vote` RPC (`1` / `0`); historical downvotes
  stay in storage, so karma and ranking data are never silently rewritten.
- Votes carry no timestamps, so the leaderboard is all-time, not weekly.

## License

All rights reserved.
