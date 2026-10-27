-- 0001_hardening.sql
-- Run once, AFTER 0000_migration.sql. Do not re-run 0000.
-- Requires Anonymous Sign-ins to be enabled in Supabase Auth before the new client ships.

begin;

-- ---------------------------------------------------------------------------
-- 1. Categories: retire Roommates
-- ---------------------------------------------------------------------------
update public.confessions set category = 'Confessions' where category = 'Roommates';

-- ---------------------------------------------------------------------------
-- 2. Soft delete, handle cooldown, audit trail
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists handle_changed_at timestamptz;
alter table public.confessions add column if not exists deleted_at timestamptz;
alter table public.confessions add column if not exists deleted_by uuid;
alter table public.comments add column if not exists deleted_at timestamptz;
alter table public.comments add column if not exists deleted_by uuid;

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_type, target_id);
create index if not exists moderation_actions_created_idx on public.moderation_actions (created_at desc);
grant select on public.moderation_actions to authenticated;
revoke insert, update, delete on public.moderation_actions from anon, authenticated;
alter table public.moderation_actions enable row level security;
drop policy if exists "admins read audit" on public.moderation_actions;
create policy "admins read audit" on public.moderation_actions for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Private write-rate events (no client access, no RLS policies)
-- ---------------------------------------------------------------------------
create table if not exists public.write_events (
  id bigserial primary key,
  actor_id uuid not null,
  ip_hash text,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists write_events_actor_idx on public.write_events (actor_id, action, created_at desc);
create index if not exists write_events_ip_idx on public.write_events (ip_hash, action, created_at desc);
create index if not exists write_events_created_idx on public.write_events (created_at);
revoke all on public.write_events from anon, authenticated;
alter table public.write_events enable row level security;

create index if not exists reports_target_idx on public.reports (target_type, target_id);
revoke insert, update, delete on public.reports from anon, authenticated;
revoke all on public.votes, public.reactions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_reserved_handle(_h text)
returns boolean language sql immutable set search_path = public as $$
  select lower(_h) = any (array[
    'admin','administrator','mod','moderator','support','staff','dmi','official',
    'system','confessions','ghost','op','anonymous','anon','root','null','owner','help','security'
  ])
$$;

create or replace function public.request_ip_hash()
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _headers jsonb; _xff text;
begin
  begin
    _headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if _headers is null then return null; end if;
  _xff := coalesce(_headers->>'x-forwarded-for', _headers->>'cf-connecting-ip');
  if _xff is null or btrim(_xff) = '' then return null; end if;
  return md5(btrim(split_part(_xff, ',', 1)));
end $$;

create or replace function public.consume_write(_action text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _uid uuid := auth.uid();
  _ip text := public.request_ip_hash();
  _actor_limit int;
  _ip_limit int;
  _window interval;
  _n int;
begin
  if _uid is null then raise exception 'Sign in required'; end if;
  case _action
    when 'confession' then _actor_limit := 5;  _ip_limit := 40;  _window := interval '10 minutes';
    when 'comment'    then _actor_limit := 20; _ip_limit := 120; _window := interval '10 minutes';
    when 'vote'       then _actor_limit := 120; _ip_limit := 500; _window := interval '10 minutes';
    when 'reaction'   then _actor_limit := 120; _ip_limit := 500; _window := interval '10 minutes';
    when 'report'     then _actor_limit := 10; _ip_limit := 50;  _window := interval '1 hour';
    else raise exception 'Unknown action';
  end case;

  -- Cheap probabilistic retention: rate windows never exceed one hour.
  if random() < 0.02 then
    delete from public.write_events where created_at < now() - interval '2 days';
  end if;

  select count(*) into _n from public.write_events
    where actor_id = _uid and action = _action and created_at > now() - _window;
  if _n >= _actor_limit then
    raise exception 'Slow down — try again in a few minutes';
  end if;

  if _ip is not null then
    select count(*) into _n from public.write_events
      where ip_hash = _ip and action = _action and created_at > now() - _window;
    if _n >= _ip_limit then
      raise exception 'Too many attempts from this network — try again later';
    end if;
  end if;

  insert into public.write_events (actor_id, ip_hash, action) values (_uid, _ip, _action);
end $$;

create or replace function public.contains_blocked(_t text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from unnest(regexp_split_to_array(lower(coalesce(_t, '')), '[^a-z0-9_]+')) as token
    join public.blacklist b on b.word = token
  )
$$;

create or replace function public.assert_can_post()
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and status = 'suspended') then
    raise exception 'Your alias is suspended';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Profile rules: reserved handles, cooldown, no auto-admin
-- ---------------------------------------------------------------------------
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
  if tg_op = 'UPDATE' and new.handle is distinct from old.handle then
    if old.handle_changed_at is not null and old.handle_changed_at > now() - interval '30 days' then
      raise exception 'You can only change your alias once every 30 days';
    end if;
    new.handle_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists enforce_profile_rules on public.profiles;
create trigger enforce_profile_rules before insert or update on public.profiles
  for each row execute function public.enforce_profile_rules();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare _h text; _base text; _n int := 0;
begin
  -- Anonymous auth sessions are guests, not aliases.
  if coalesce((to_jsonb(new)->>'is_anonymous')::boolean, false) then
    return new;
  end if;
  _base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'handle', ''), '[^a-zA-Z0-9_]', '', 'g'));
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
    values (new.id, _h, coalesce(nullif(new.raw_user_meta_data->>'avatar', ''), '👻'));
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end $$;

create or replace function public.normalize_blacklist_word()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.word := lower(btrim(new.word));
  if new.word = '' or length(new.word) > 40 then raise exception 'Invalid blocked word'; end if;
  return new;
end $$;

drop trigger if exists normalize_blacklist_word on public.blacklist;
create trigger normalize_blacklist_word before insert or update on public.blacklist
  for each row execute function public.normalize_blacklist_word();

-- ---------------------------------------------------------------------------
-- 6. Write RPCs: signed sessions only, no spoofable device keys
-- ---------------------------------------------------------------------------
create or replace function public.create_confession(_body text, _category text, _as_alias boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare _id uuid; _author uuid; _handle text; _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'Sign in required'; end if;
  _body := btrim(_body);
  if length(_body) < 5 or length(_body) > 1000 then raise exception 'Confession must be 5-1000 characters'; end if;
  if _category not in ('Campus Drama','Crushes','Academics','Late Night','Hot Takes','Confessions') then
    raise exception 'Invalid category';
  end if;
  if public.contains_blocked(_body) then raise exception 'Your confession contains blocked words'; end if;
  perform public.assert_can_post();
  if _as_alias then
    select id, handle into _author, _handle from public.profiles where id = _uid and status <> 'suspended';
    if _author is null then raise exception 'Alias required for attributed posts'; end if;
  end if;
  perform public.consume_write('confession');
  insert into public.confessions (body, category, author_id) values (_body, _category, _author) returning id into _id;
  if _author is not null then
    insert into public.notifications (user_id, type, message, confession_id)
      select f.follower_id, 'follow_post', '@' || _handle || ' just dropped a new confession', _id
      from public.follows f where f.followee_id = _author
      order by f.created_at desc limit 500;
  end if;
  return _id;
end $$;

drop function if exists public.add_comment(uuid, text, text, boolean);
create or replace function public.add_comment(_confession_id uuid, _body text, _as_alias boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare _id uuid; _author uuid; _owner uuid; _h text; _name text; _hue int; _uid uuid := auth.uid();
  adjs text[] := array['Sleepy','Shady','Neon','Silent','Spicy','Midnight','Sneaky','Velvet','Cosmic','Feral','Lucky','Salty'];
  nouns text[] := array['Owl','Fox','Raccoon','Moth','Ghost','Cat','Bat','Gecko','Panda','Otter','Crow','Wolf'];
begin
  if _uid is null then raise exception 'Sign in required'; end if;
  _body := btrim(_body);
  if length(_body) < 1 or length(_body) > 500 then raise exception 'Comment must be 1-500 characters'; end if;
  if public.contains_blocked(_body) then raise exception 'Your comment contains blocked words'; end if;
  perform public.assert_can_post();
  select author_id into _owner from public.confessions where id = _confession_id and status = 'visible';
  if not found then raise exception 'Confession not found'; end if;
  if _as_alias then
    select id into _author from public.profiles where id = _uid and status <> 'suspended';
    if _author is null then raise exception 'Alias required for attributed comments'; end if;
  else
    _h := md5(_uid::text || _confession_id::text);
    _name := adjs[1 + (('x' || substr(_h,1,4))::bit(16)::int % 12)] || ' ' || nouns[1 + (('x' || substr(_h,5,4))::bit(16)::int % 12)];
    _hue := ('x' || substr(_h,9,4))::bit(16)::int % 360;
    if _owner is not null and _owner = _uid then _name := 'OP'; end if;
  end if;
  perform public.consume_write('comment');
  insert into public.comments (confession_id, body, author_id, anon_name, anon_hue)
    values (_confession_id, _body, _author, _name, _hue) returning id into _id;
  update public.confessions set comment_count = comment_count + 1 where id = _confession_id;
  if _owner is not null and _owner is distinct from _uid then
    insert into public.notifications (user_id, type, message, confession_id)
      values (_owner, 'reply', 'Someone replied to your confession', _confession_id);
  end if;
  return _id;
end $$;

drop function if exists public.cast_vote(uuid, text, int);
create or replace function public.cast_vote(_confession_id uuid, _value int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare _key text; _up int; _owner uuid; _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'Sign in required'; end if;
  if _value not in (0, 1, -1) then raise exception 'Invalid vote'; end if;
  perform 1 from public.confessions where id = _confession_id and status = 'visible';
  if not found then raise exception 'Confession not found'; end if;
  perform public.consume_write('vote');
  _key := _uid::text;
  if _value = 0 then
    delete from public.votes where confession_id = _confession_id and voter_key = _key;
  else
    insert into public.votes values (_confession_id, _key, _value)
      on conflict (confession_id, voter_key) do update set value = excluded.value;
  end if;
  update public.confessions c set
    upvotes = (select count(*) from public.votes v where v.confession_id = c.id and v.value = 1),
    downvotes = (select count(*) from public.votes v where v.confession_id = c.id and v.value = -1)
  where c.id = _confession_id returning upvotes, author_id into _up, _owner;
  if _value = 1 and _owner is not null and _owner is distinct from _uid and _up in (10,25,50,100,250,500,1000)
     and not exists (
       select 1 from public.notifications
       where user_id = _owner and confession_id = _confession_id
         and type = 'milestone' and message like '%' || _up || ' upvotes%'
     ) then
    insert into public.notifications (user_id, type, message, confession_id)
      values (_owner, 'milestone', 'Your confession hit ' || _up || ' upvotes 🔥', _confession_id);
  end if;
end $$;

drop function if exists public.toggle_reaction(uuid, text, text);
create or replace function public.toggle_reaction(_confession_id uuid, _emoji text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare _key text; _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'Sign in required'; end if;
  if _emoji not in ('🔥','💀','🤫','👀') then raise exception 'Invalid reaction'; end if;
  perform 1 from public.confessions where id = _confession_id and status = 'visible';
  if not found then raise exception 'Confession not found'; end if;
  perform public.consume_write('reaction');
  _key := _uid::text;
  if exists (select 1 from public.reactions where confession_id = _confession_id and voter_key = _key and emoji = _emoji) then
    delete from public.reactions where confession_id = _confession_id and voter_key = _key and emoji = _emoji;
  else
    insert into public.reactions values (_confession_id, _key, _emoji);
  end if;
  update public.confessions set reactions = coalesce((
    select jsonb_object_agg(emoji, n) from (
      select emoji, count(*) n from public.reactions where confession_id = _confession_id group by emoji
    ) s
  ), '{}'::jsonb)
  where id = _confession_id;
end $$;

drop function if exists public.report_content(text, uuid, text, text);
create or replace function public.report_content(_type text, _id uuid, _reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare _owner uuid; _n int; _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'Sign in required'; end if;
  if _type not in ('confession','comment') then raise exception 'Invalid type'; end if;
  _reason := left(btrim(coalesce(_reason, '')), 200);
  if length(_reason) < 3 then raise exception 'Add a short reason for the report'; end if;
  if _type = 'confession' then
    select author_id into _owner from public.confessions where id = _id and status = 'visible';
  else
    select m.author_id into _owner
      from public.comments m join public.confessions c on c.id = m.confession_id
      where m.id = _id and m.status = 'visible' and c.status = 'visible';
  end if;
  if not found then raise exception 'Content not found'; end if;
  if _owner is not null and _owner = _uid then raise exception 'You cannot report your own content'; end if;
  perform public.consume_write('report');
  insert into public.reports (target_type, target_id, reporter_key, reason)
    values (_type, _id, _uid::text, _reason)
    on conflict do nothing;
  if not found then return; end if;
  if _type = 'confession' then
    update public.confessions
      set report_count = report_count + 1,
          status = case when report_count + 1 >= 3 and status = 'visible' then 'flagged' else status end
      where id = _id;
  else
    update public.comments
      set report_count = report_count + 1,
          status = case when report_count + 1 >= 3 and status = 'visible' then 'flagged' else status end
      where id = _id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Moderation: soft delete + audit
-- ---------------------------------------------------------------------------
drop function if exists public.moderate(text, uuid, text);
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
        where id = _id and status = 'flagged';
    else
      update public.confessions set status = 'deleted', report_count = 0, deleted_at = now(), deleted_by = auth.uid()
        where id = _id and status <> 'deleted';
    end if;
    get diagnostics _n = row_count;
    if _n = 0 then raise exception 'Nothing to moderate'; end if;
  elsif _action = 'approve' then
    update public.comments set status = 'visible', report_count = 0
      where id = _id and status = 'flagged';
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

create or replace function public.set_alias_status(_user uuid, _status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  if _status not in ('active','warned','suspended') then raise exception 'Invalid status'; end if;
  if _user = auth.uid() then raise exception 'You cannot moderate your own alias'; end if;
  update public.profiles set status = _status where id = _user;
  if not found then raise exception 'Alias not found'; end if;
  insert into public.moderation_actions (admin_id, target_type, target_id, action, reason)
    values (auth.uid(), 'profile', _user, _status, 'Alias status changed');
  if _status <> 'active' then
    insert into public.notifications (user_id, type, message) values (_user, 'moderation',
      case when _status = 'warned' then '⚠️ A moderator warned your alias. Keep it respectful.'
           else '⛔ Your alias has been suspended.' end);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Stats score
-- ---------------------------------------------------------------------------
create or replace function public.alias_stats(_id uuid default null)
returns table (id uuid, handle text, avatar text, bio text, status text, karma bigint, followers bigint, posts bigint, comments bigint, score numeric, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.handle, s.avatar, s.bio, s.status, s.karma, s.followers, s.posts, s.comments,
    (s.karma + s.followers * 3 + s.posts * 2 + s.comments)::numeric, s.created_at
  from (
    select p.id, p.handle, p.avatar, p.bio, p.status,
      coalesce((select sum(c.upvotes - c.downvotes) from public.confessions c where c.author_id = p.id and c.status = 'visible'), 0)::bigint as karma,
      (select count(*) from public.follows f where f.followee_id = p.id)::bigint as followers,
      (select count(*) from public.confessions c where c.author_id = p.id and c.status = 'visible')::bigint as posts,
      (select count(*) from public.comments m where m.author_id = p.id and m.status = 'visible')::bigint as comments,
      p.created_at
    from public.profiles p
    where (_id is null or p.id = _id)
  ) s
$$;

-- ---------------------------------------------------------------------------
-- 9. RLS tightening
-- ---------------------------------------------------------------------------
drop policy if exists "follows read" on public.follows;
create policy "follows read" on public.follows for select to authenticated
  using (auth.uid() = follower_id and exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists "follow self" on public.follows;
create policy "follow self" on public.follows for insert to authenticated
  with check (
    auth.uid() = follower_id and follower_id <> followee_id
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );
drop policy if exists "unfollow self" on public.follows;
create policy "unfollow self" on public.follows for delete to authenticated
  using (auth.uid() = follower_id and exists (select 1 from public.profiles p where p.id = auth.uid()));

drop policy if exists "blacklist read" on public.blacklist;
create policy "admins read blacklist" on public.blacklist for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
revoke select on public.blacklist from anon;

drop policy if exists "visible comments" on public.comments;
create policy "visible comments" on public.comments for select
  using (
    public.has_role(auth.uid(), 'admin')
    or (
      status = 'visible'
      and exists (select 1 from public.confessions c where c.id = comments.confession_id and c.status = 'visible')
    )
  );

-- ---------------------------------------------------------------------------
-- 10. Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.contains_blocked(text) from public, anon, authenticated;
revoke all on function public.assert_can_post() from public, anon, authenticated;
revoke all on function public.request_ip_hash() from public, anon, authenticated;
revoke all on function public.consume_write(text) from public, anon, authenticated;
revoke all on function public.is_reserved_handle(text) from public, anon, authenticated;

revoke all on function public.create_confession(text, text, boolean) from public, anon, authenticated;
revoke all on function public.add_comment(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.cast_vote(uuid, int) from public, anon, authenticated;
revoke all on function public.toggle_reaction(uuid, text) from public, anon, authenticated;
revoke all on function public.report_content(text, uuid, text) from public, anon, authenticated;
revoke all on function public.moderate(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_alias_status(uuid, text) from public, anon, authenticated;
revoke all on function public.alias_stats(uuid) from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;

grant execute on function public.create_confession(text, text, boolean) to authenticated;
grant execute on function public.add_comment(uuid, text, boolean) to authenticated;
grant execute on function public.cast_vote(uuid, int) to authenticated;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;
grant execute on function public.moderate(text, uuid, text, text) to authenticated;
grant execute on function public.set_alias_status(uuid, text) to authenticated;
grant execute on function public.alias_stats(uuid) to anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated;

commit;
