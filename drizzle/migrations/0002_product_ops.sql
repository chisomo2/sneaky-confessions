-- 0002_product_ops.sql
-- Run once, AFTER 0001_hardening.sql. Do not re-run 0000 or 0001.
-- Adds: server-side feed pagination/search, posting kill switch, retention cleanup,
-- and Realtime for notifications (when the publication exists).

begin;

-- ---------------------------------------------------------------------------
-- 1. Query indexes
-- ---------------------------------------------------------------------------
create index if not exists confessions_category_created_idx on public.confessions (category, created_at desc);
create index if not exists confessions_author_created_idx on public.confessions (author_id, created_at desc);
create index if not exists notifications_user_read_created_idx on public.notifications (user_id, read, created_at desc);
create index if not exists reports_created_idx on public.reports (created_at);

-- ---------------------------------------------------------------------------
-- 2. Posting kill switch
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
revoke all on public.app_settings from anon, authenticated;
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('posting_enabled', 'true'::jsonb)
  on conflict (key) do nothing;

create or replace function public.posting_open()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'posting_enabled'), true)
$$;
revoke all on function public.posting_open() from public, anon, authenticated;
grant execute on function public.posting_open() to anon, authenticated;

create or replace function public.set_posting_enabled(_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
    values ('posting_enabled', to_jsonb(_enabled), now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.moderation_actions (admin_id, target_type, target_id, action, reason)
    values (auth.uid(), 'system', null, case when _enabled then 'posting_on' else 'posting_off' end, 'Posting kill switch');
end $$;
revoke all on function public.set_posting_enabled(boolean) from public, anon, authenticated;
grant execute on function public.set_posting_enabled(boolean) to authenticated;

alter table public.moderation_actions alter column target_id drop not null;

-- assert_can_post runs before rate-limit accounting, so a paused site does not
-- burn a poster's write budget.
create or replace function public.assert_can_post()
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.posting_open() then raise exception 'Posting is paused by moderators'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and status = 'suspended') then
    raise exception 'Your alias is suspended';
  end if;
end $$;
revoke all on function public.assert_can_post() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Retention cleanup (manual via admin UI, or scheduled as postgres/service_role)
-- ---------------------------------------------------------------------------
create or replace function public.retention_cleanup_internal()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare _events int; _notifications int; _reports int;
begin
  delete from public.write_events where created_at < now() - interval '30 days';
  get diagnostics _events = row_count;
  delete from public.notifications where read = true and created_at < now() - interval '90 days';
  get diagnostics _notifications = row_count;
  delete from public.reports where created_at < now() - interval '180 days';
  get diagnostics _reports = row_count;
  return jsonb_build_object('write_events', _events, 'notifications', _notifications, 'reports', _reports);
end $$;
revoke all on function public.retention_cleanup_internal() from public, anon, authenticated;
grant execute on function public.retention_cleanup_internal() to service_role;

create or replace function public.run_retention_cleanup()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  return public.retention_cleanup_internal();
end $$;
revoke all on function public.run_retention_cleanup() from public, anon, authenticated;
grant execute on function public.run_retention_cleanup() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Server-side feed: ranking, category filter, search, pagination
-- ---------------------------------------------------------------------------
create or replace function public.feed_page(
  _tab text default 'hot',
  _category text default null,
  _q text default null,
  _limit int default 20,
  _offset int default 0
) returns table (
  id uuid,
  body text,
  category text,
  author_id uuid,
  upvotes int,
  downvotes int,
  comment_count int,
  reactions jsonb,
  created_at timestamptz,
  author_handle text,
  author_avatar text
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  _mode text := case when lower(coalesce(_tab, 'hot')) in ('hot', 'latest', 'following') then lower(coalesce(_tab, 'hot')) else 'hot' end;
  _cat text := nullif(btrim(coalesce(_category, '')), '');
  _search text := nullif(left(btrim(coalesce(_q, '')), 80), '');
  _limit_clean int := greatest(1, least(coalesce(_limit, 20), 50));
  _offset_clean int := greatest(0, coalesce(_offset, 0));
begin
  return query
  select c.id, c.body, c.category, c.author_id, c.upvotes, c.downvotes,
         c.comment_count, c.reactions, c.created_at, p.handle, p.avatar
  from public.confessions c
  left join public.profiles p on p.id = c.author_id
  where c.status = 'visible'
    and (_cat is null or c.category = _cat)
    and (
      _search is null
      or c.body ilike '%' || replace(replace(replace(_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
    and (
      _mode <> 'following'
      or c.author_id in (select f.followee_id from public.follows f where f.follower_id = auth.uid())
    )
  order by
    -- engagement decayed by age, matching the old client-side hot score
    case when _mode = 'hot' then (
      ((c.upvotes - c.downvotes) + c.comment_count * 2
        + coalesce((select sum(r.value::int) from jsonb_each_text(c.reactions) as r(key, value)), 0))::numeric
      / power(greatest(extract(epoch from (now() - c.created_at)) / 3600, 0) + 2, 0.8)
    ) else 0 end desc,
    c.created_at desc
  limit _limit_clean offset _offset_clean;
end $$;
revoke all on function public.feed_page(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.feed_page(text, text, text, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime notifications (only when Supabase's publication is present)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

commit;
