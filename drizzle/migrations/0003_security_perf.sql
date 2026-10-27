-- 0003_security_perf.sql
-- Run once, AFTER 0002_product_ops.sql. Do not re-run 0000, 0001 or 0002.
-- Adds: profile privilege lockdown, salted IP hashing, moderation fix,
-- server-side feed marks, leaderboard paging, query indexes and
-- anonymous-to-permanent profile creation.

begin;

-- ---------------------------------------------------------------------------
-- 1. Profile privileges: explicit table-level revoke defeats Supabase's
--    default "GRANT ALL ON TABLES TO authenticated" and leaves only the
--    columns the client is allowed to edit.
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (handle, avatar, bio) on public.profiles to authenticated;

create or replace function public.enforce_profile_rules()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.handle := lower(btrim(new.handle));
  if new.handle !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Alias must be 3-20 letters, numbers or underscores';
  end if;
  if public.is_reserved_handle(new.handle) then
    raise exception 'That alias is reserved';
  end if;
  if length(coalesce(new.bio, '')) > 160 then
    raise exception 'Bio must be 160 characters or fewer';
  end if;
  if length(coalesce(new.avatar, '')) = 0 or length(new.avatar) > 16 then
    raise exception 'Invalid avatar';
  end if;

  -- Defense in depth: column grants already hide these fields, but a future
  -- grant regression must not let an alias clear its own suspension/cooldown.
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.has_role(auth.uid(), 'admin') then
    if new.status is distinct from old.status then
      raise exception 'Only moderators can change alias status';
    end if;
    if new.handle_changed_at is distinct from old.handle_changed_at
       and new.handle is not distinct from old.handle then
      raise exception 'Only moderators can reset alias cooldown';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.handle is distinct from old.handle then
    if old.handle_changed_at is not null and old.handle_changed_at > now() - interval '30 days' then
      raise exception 'You can only change your alias once every 30 days';
    end if;
    new.handle_changed_at := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. IP hashing: trust the proxy-set header, never the first XFF hop, and
--    salt the digest so stored hashes are not reversible by IP enumeration.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value)
values (
  'ip_hash_salt',
  to_jsonb(md5(random()::text || clock_timestamp()::text) || md5(random()::text))
)
on conflict (key) do nothing;

create or replace function public.request_ip_hash()
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  _headers jsonb;
  _ip text;
  _xff text;
  _parts text[];
  _salt text;
begin
  begin
    _headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if _headers is null then return null; end if;

  -- Cloudflare overwrites CF-Connecting-IP. Without it, the last XFF entry is
  -- the one appended by the trusted proxy; earlier entries are caller-supplied.
  _ip := nullif(btrim(coalesce(_headers->>'cf-connecting-ip', '')), '');
  if _ip is null then
    _xff := nullif(btrim(coalesce(_headers->>'x-forwarded-for', '')), '');
    if _xff is not null then
      _parts := regexp_split_to_array(_xff, '\s*,\s*');
      _ip := nullif(btrim(_parts[array_length(_parts, 1)]), '');
    end if;
  end if;
  if _ip is null then return null; end if;

  _salt := coalesce(
    (select value #>> '{}' from public.app_settings where key = 'ip_hash_salt'),
    ''
  );
  return md5(_salt || ':' || lower(_ip));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Moderation: approving a visible row that has reports must clear them.
--    Before this, the admin queue listed items with 1-2 reports but approve
--    only matched status = 'flagged' and raised "Nothing to moderate".
-- ---------------------------------------------------------------------------
create or replace function public.moderate(_type text, _id uuid, _action text, _reason text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare _n int; _reason_clean text := left(btrim(coalesce(_reason, '')), 200);
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  if _type not in ('confession','comment') then raise exception 'Invalid type'; end if;
  if _action not in ('approve','delete') then raise exception 'Invalid action'; end if;

  if _type = 'confession' then
    if _action = 'approve' then
      update public.confessions set status = 'visible', report_count = 0
        where id = _id and status in ('visible', 'flagged');
    else
      update public.confessions set status = 'deleted', report_count = 0, deleted_at = now(), deleted_by = auth.uid()
        where id = _id and status <> 'deleted';
    end if;
    get diagnostics _n = row_count;
    if _n = 0 then raise exception 'Nothing to moderate'; end if;
  elsif _action = 'approve' then
    update public.comments set status = 'visible', report_count = 0
      where id = _id and status in ('visible', 'flagged');
    get diagnostics _n = row_count;
    if _n = 0 then raise exception 'Nothing to moderate'; end if;
  else
    update public.comments set status = 'deleted', report_count = 0, deleted_at = now(), deleted_by = auth.uid()
      where id = _id and status <> 'deleted';
    get diagnostics _n = row_count;
    if _n = 0 then raise exception 'Nothing to moderate'; end if;
    update public.confessions c set comment_count = greatest(c.comment_count - 1, 0)
      where c.id = (select confession_id from public.comments where id = _id);
  end if;

  insert into public.moderation_actions (admin_id, target_type, target_id, action, reason)
    values (auth.uid(), _type, _id, _action, _reason_clean);
  delete from public.reports where target_type = _type and target_id = _id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Feed: clamp paging, count reactions through the index instead of
--    expanding JSON per row, and return the viewer's own vote/reactions so
--    every device shows truthful button state.
-- ---------------------------------------------------------------------------
drop function if exists public.feed_page(text, text, text, int, int);
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
  author_avatar text,
  my_vote int,
  my_reactions text[]
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  _mode text := case when lower(coalesce(_tab, 'hot')) in ('hot', 'latest', 'following') then lower(coalesce(_tab, 'hot')) else 'hot' end;
  _cat text := nullif(btrim(coalesce(_category, '')), '');
  _search text := nullif(left(btrim(coalesce(_q, '')), 80), '');
  _limit_clean int := greatest(1, least(coalesce(_limit, 20), 50));
  _offset_clean int := greatest(0, least(coalesce(_offset, 0), 5000));
  _viewer text := auth.uid()::text;
begin
  return query
  select c.id, c.body, c.category, c.author_id, c.upvotes, c.downvotes,
         c.comment_count, c.reactions, c.created_at, p.handle, p.avatar,
         coalesce((
           select v.value from public.votes v
           where v.confession_id = c.id and v.voter_key = _viewer
         ), 0)::int as my_vote,
         coalesce((
           select array_agg(r.emoji order by r.emoji) from public.reactions r
           where r.confession_id = c.id and r.voter_key = _viewer
         ), array[]::text[]) as my_reactions
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
    case when _mode = 'hot' then (
      ((c.upvotes - c.downvotes) + c.comment_count * 2
        + (select count(*) from public.reactions r where r.confession_id = c.id))::numeric
      / power(greatest(extract(epoch from (now() - c.created_at)) / 3600, 0) + 2, 0.8)
    ) else 0 end desc,
    c.created_at desc
  limit _limit_clean offset _offset_clean;
end $$;
revoke all on function public.feed_page(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.feed_page(text, text, text, int, int) to anon, authenticated;

create or replace function public.confession_detail(_id uuid)
returns table (
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
  author_avatar text,
  my_vote int,
  my_reactions text[]
)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.body, c.category, c.author_id, c.upvotes, c.downvotes,
         c.comment_count, c.reactions, c.created_at, p.handle, p.avatar,
         coalesce(v.value, 0)::int as my_vote,
         coalesce((
           select array_agg(r.emoji order by r.emoji) from public.reactions r
           where r.confession_id = c.id and r.voter_key = auth.uid()::text
         ), array[]::text[]) as my_reactions
  from public.confessions c
  left join public.profiles p on p.id = c.author_id
  left join public.votes v on v.confession_id = c.id and v.voter_key = auth.uid()::text
  where c.id = _id and c.status = 'visible'
$$;
revoke all on function public.confession_detail(uuid) from public, anon, authenticated;
grant execute on function public.confession_detail(uuid) to anon, authenticated;

create or replace function public.confession_marks(_ids uuid[])
returns table (confession_id uuid, my_vote int, my_reactions text[])
language sql stable security definer set search_path = public, pg_temp as $$
  select i.id,
    coalesce((
      select v.value from public.votes v
      where v.confession_id = i.id and v.voter_key = auth.uid()::text
    ), 0)::int as my_vote,
    coalesce((
      select array_agg(r.emoji order by r.emoji) from public.reactions r
      where r.confession_id = i.id and r.voter_key = auth.uid()::text
    ), array[]::text[]) as my_reactions
  from (select id from unnest(_ids) as u(id) limit 100) i
$$;
revoke all on function public.confession_marks(uuid[]) from public, anon, authenticated;
grant execute on function public.confession_marks(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Leaderboard: aggregate in one pass and page in SQL instead of scanning
--    every profile and sorting in the browser.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_page(_limit int default 50, _offset int default 0)
returns table (
  id uuid,
  handle text,
  avatar text,
  bio text,
  karma bigint,
  followers bigint,
  posts bigint,
  comments bigint,
  score numeric,
  created_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.handle, s.avatar, s.bio, s.karma, s.followers, s.posts, s.comments, s.score, s.created_at
  from (
    select p.id, p.handle, p.avatar, p.bio,
      coalesce(k.karma, 0)::bigint as karma,
      coalesce(f.followers, 0)::bigint as followers,
      coalesce(k.posts, 0)::bigint as posts,
      coalesce(m.comments, 0)::bigint as comments,
      (coalesce(k.karma, 0) + coalesce(f.followers, 0) * 3
        + coalesce(k.posts, 0) * 2 + coalesce(m.comments, 0))::numeric as score,
      p.created_at
    from public.profiles p
    left join (
      select author_id, sum(upvotes - downvotes) as karma, count(*) as posts
      from public.confessions
      where status = 'visible' and author_id is not null
      group by author_id
    ) k on k.author_id = p.id
    left join (
      select followee_id, count(*) as followers
      from public.follows
      group by followee_id
    ) f on f.followee_id = p.id
    left join (
      select author_id, count(*) as comments
      from public.comments
      where status = 'visible' and author_id is not null
      group by author_id
    ) m on m.author_id = p.id
    where p.status <> 'suspended'
  ) s
  order by s.score desc, s.created_at asc
  limit greatest(1, least(coalesce(_limit, 50), 100))
  offset greatest(0, coalesce(_offset, 0))
$$;
revoke all on function public.leaderboard_page(int, int) from public, anon, authenticated;
grant execute on function public.leaderboard_page(int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Indexes for the read paths above.
-- ---------------------------------------------------------------------------
create index if not exists confessions_visible_created_idx
  on public.confessions (created_at desc) where status = 'visible';
create index if not exists confessions_visible_category_created_idx
  on public.confessions (category, created_at desc) where status = 'visible';
create index if not exists confessions_visible_author_created_idx
  on public.confessions (author_id, created_at desc) where status = 'visible';
create index if not exists comments_author_status_idx
  on public.comments (author_id, status);
create index if not exists follows_followee_idx
  on public.follows (followee_id);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- pg_trgm is available on Supabase but not in the local PGlite harness.
do $$
begin
  begin
    create extension if not exists pg_trgm;
  exception when others then
    null;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists confessions_body_trgm_idx on public.confessions using gin (body gin_trgm_ops)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Anonymous conversion: updateUser({ email }) flips is_anonymous without
--    inserting a new auth.users row, so handle_new_user never fires. Create
--    the alias here to keep the guest's votes, comments and session intact.
-- ---------------------------------------------------------------------------
create or replace function public.handle_anonymous_conversion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  _base text;
  _h text;
  _n int := 0;
begin
  if coalesce((to_jsonb(old)->>'is_anonymous')::boolean, false)
     and not coalesce((to_jsonb(new)->>'is_anonymous')::boolean, false) then
    if not exists (select 1 from public.profiles where id = new.id) then
      _base := lower(regexp_replace(coalesce(_meta->>'handle', ''), '[^a-zA-Z0-9_]', '', 'g'));
      if length(_base) < 3 then _base := 'phantom' || substr(md5(new.id::text), 1, 5); end if;
      _base := substr(_base, 1, 20);
      if public.is_reserved_handle(_base) then
        _base := substr(_base, 1, 15) || substr(md5(new.id::text), 1, 4);
      end if;
      _h := _base;
      while exists (select 1 from public.profiles where handle = _h) loop
        _n := _n + 1;
        _h := substr(_base, 1, 20 - length(_n::text)) || _n::text;
      end loop;
      insert into public.profiles (id, handle, avatar)
        values (new.id, _h, coalesce(nullif(_meta->>'avatar', ''), '👻'));
    end if;
    insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.handle_anonymous_conversion() from public, anon, authenticated;

drop trigger if exists on_auth_user_converted on auth.users;
create trigger on_auth_user_converted after update on auth.users
  for each row execute function public.handle_anonymous_conversion();

commit;
