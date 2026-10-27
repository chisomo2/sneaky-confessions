# Project conventions

- Keep discussion overlays in a root provider and share `CommentThread` with direct confession links, so feed and profile scroll positions survive opening comments.
- Map likes onto the existing `cast_vote` RPC (1 or 0) and retain historical downvotes in storage, so existing karma and ranking data are not silently rewritten.

# Engineering rules

- Migrations are append-only: never edit or re-run an applied file in `drizzle/migrations/`. Add the next number, and add it to `scripts/verify-db.mjs`.
- Run `npm run test:db` (PGlite, empty database, all migrations) after any SQL change and report the real passing count.
- Secrets never enter the repo: only `.env.example` is tracked. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are server-side only.
- `VITE_*` variables are baked in at build time; changing them requires a new Vercel deployment.
- Keep the default branch deployable — Vercel builds every push.
