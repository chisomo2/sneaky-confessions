# Deployment runbook

End-to-end setup of a clean production environment: new GitHub repository, new
Supabase project, new Vercel project, and the archive of the previous
Lovable-connected repository.

Do the steps in order. Anything marked **manual** happens in a web console; the
rest can be run in a terminal.

---

## 0. What carries over

| Item                | Action                                                    |
| ------------------- | --------------------------------------------------------- |
| Application code    | Copy this working tree to the new repository              |
| Git history         | Fresh history (single initial commit) — no legacy remotes |
| Database schema     | Re-created by migrations `0000` → `0005`                  |
| Database content    | **Not** copied unless you export it (see step 7)          |
| Environment secrets | Re-issued by the new Supabase project                     |
| Old repository      | Archived read-only, not deleted (step 8)                  |

---

## 1. Create the new GitHub repository **manual**

1. github.com → **New repository** → name `sneaky-confessions`, visibility
   **Public**, **no** README / .gitignore / license.
2. Keep the old repository as-is for now; it remains the rollback path.

## 2. Publish a clean history

From the project directory, this repository already tracks only source (no
`.env`, no build output, no Lovable files). Push it as a fresh history so no
legacy commit objects are published:

```sh
# verify nothing secret is tracked
git ls-files | grep -Ei '(^|/)\.env$|secret|credential|\.pem$|\.key$'   # only .env.example

# create an orphan snapshot of the current tree
git checkout --orphan clean-main
git add -A
git commit -m "Initial commit: Sneaky Confessions production baseline"
git push -u https://github.com/<owner>/sneaky-confessions.git clean-main:main
```

The legacy repository is never force-pushed or rewritten.

## 3. Create the Supabase project **manual**

1. supabase.com → **New project** (pick a region close to your Vercel region).
2. Save the database password.
3. **Project Settings → API Keys**: copy
   - Project URL → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - Publishable (anon) key → `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Secret / service-role key → `SUPABASE_SERVICE_ROLE_KEY` (server only)
4. **Authentication → Providers**: enable **Anonymous sign-ins**.
5. **Authentication → URL Configuration**: set Site URL to the Vercel domain
   (you can add it after step 5) and allow `https://<domain>/**`,
   `https://<domain>/reset-password`, `http://localhost:8080`, and
   `http://localhost:8080/reset-password`.

## 4. Run the migrations **manual (SQL editor)**

Run each file once, in this order. Each file wraps its work in a transaction.

1. `drizzle/migrations/0000_migration.sql`
2. `drizzle/migrations/0001_hardening.sql`
3. `drizzle/migrations/0002_product_ops.sql`
4. `drizzle/migrations/0003_security_perf.sql`
5. `drizzle/migrations/0004_comment_threads.sql`
6. `drizzle/migrations/0005_feed_rank.sql`

Do not re-run any file. For later schema changes, add `0006_*.sql`, register it in
`scripts/verify-db.mjs`, and run `npm run test:db` first.

Then verify (read-only, returns one row):

```sql
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'comments' and column_name = 'parent_id') as parent_id_column,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'add_comment' and p.pronargs = 4) as add_comment_threaded,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications') as realtime_notifications,
  (select count(*) from public.confessions) as confessions;
```

Expected: `parent_id_column = 1`, `add_comment_threaded = 1`,
`realtime_notifications = 1`, `confessions = 0`.

Grant the first admin after signing up an alias:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where handle = 'yourhandle'
on conflict do nothing;
```

## 5. Create the Vercel project **manual**

1. vercel.com → **Add New → Project** → import the new GitHub repository.
2. Framework preset: **Other**. Root directory: repository root.
   Build command `npm run build`, install `npm install`, output directory: leave
   empty (the build emits `.vercel/output`).
3. Environment variables (Production, Preview, Development):

   | Name                            | Value                    |
   | ------------------------------- | ------------------------ |
   | `VITE_SUPABASE_URL`             | project URL              |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key          |
   | `SUPABASE_URL`                  | same project URL         |
   | `SUPABASE_PUBLISHABLE_KEY`      | same publishable key     |
   | `SUPABASE_SERVICE_ROLE_KEY`     | secret key (server only) |

4. Deploy, then go back to Supabase step 3.5 and set the Site URL to the
   deployment domain, and add the reset-password redirect.
5. Redeploy whenever a `VITE_*` value changes — they are baked in at build time.

For a CLI deploy: `npx vercel link` then `npx vercel --prod` (Node 22+).

## 6. Smoke test

- Home feed renders, a new confession posts, likes and reactions persist.
- Comments open inline, replies nest one level, "View all" opens the discussion.
- Sign out/in works; password reset email arrives (if SMTP is configured).
- `curl -sI https://<domain>/ | grep -i content-security-policy` shows the policy
  with no third-party origins.
- Vercel → Deployment → Functions: SSR function has no runtime errors.

## 7. Optional: carry over existing content

The new database starts empty. To move content from the old project, export the
`profiles`, `confessions`, `comments`, `votes`, `reactions` tables in that order
from the old dashboard (Table editor → Export as CSV), then import them in the
same order into the new project. Auth users do not transfer; historical content
keeps its author ids, so re-register aliases with the same handles if profiles are
imported. Skip this step for a clean launch.

## 8. Archive the old repository **manual**

1. Transfer any needed notes (this runbook supersedes the old README).
2. github.com → old repo → **Settings → General → Danger zone → Archive this
   repository**. Archived repositories are read-only and stay on record; nothing
   is deleted and Lovable keeps its copy.
3. Leave the old Lovable project untouched until the new deployment has been live
   for a full release cycle, then delete it from Lovable.

## 9. Rollback

Until step 8, rollback is: point the old preview/deployment at the old Supabase
project (its env values are unchanged) and stop linking the new repository. No
migration is destructive, and the old database is never touched by this runbook.
