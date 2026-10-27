
create type public.app_role as enum ('admin','moderator','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  avatar text not null default '👻',
  bio text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now()
);
grant select on public.profiles to anon, authenticated;
grant update (handle, avatar, bio) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles own update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles read" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.confessions (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  category text not null default 'Confessions',
  author_id uuid references public.profiles(id) on delete set null,
  status text not null default 'visible',
  upvotes int not null default 0,
  downvotes int not null default 0,
  comment_count int not null default 0,
  report_count int not null default 0,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.confessions (created_at desc);
grant select on public.confessions to anon, authenticated;
grant all on public.confessions to service_role;
alter table public.confessions enable row level security;
create policy "visible confessions" on public.confessions for select using (status = 'visible' or public.has_role(auth.uid(),'admin'));

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  body text not null,
  author_id uuid references public.profiles(id) on delete set null,
  anon_name text,
  anon_hue int,
  status text not null default 'visible',
  report_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.comments (confession_id, created_at);
grant select on public.comments to anon, authenticated;
grant all on public.comments to service_role;
alter table public.comments enable row level security;
create policy "visible comments" on public.comments for select using (status = 'visible' or public.has_role(auth.uid(),'admin'));

create table public.votes (
  confession_id uuid not null references public.confessions(id) on delete cascade,
  voter_key text not null,
  value smallint not null,
  primary key (confession_id, voter_key)
);
grant all on public.votes to service_role;
alter table public.votes enable row level security;

create table public.reactions (
  confession_id uuid not null references public.confessions(id) on delete cascade,
  voter_key text not null,
  emoji text not null,
  primary key (confession_id, voter_key, emoji)
);
grant all on public.reactions to service_role;
alter table public.reactions enable row level security;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  reporter_key text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_key)
);
grant select on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;
create policy "admins read reports" on public.reports for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;
alter table public.follows enable row level security;
create policy "follows read" on public.follows for select using (true);
create policy "follow self" on public.follows for insert to authenticated with check (auth.uid() = follower_id and follower_id <> followee_id);
create policy "unfollow self" on public.follows for delete to authenticated using (auth.uid() = follower_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  message text not null,
  confession_id uuid references public.confessions(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "own notifs read" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "own notifs update" on public.notifications for update to authenticated using (auth.uid() = user_id);
create policy "own notifs delete" on public.notifications for delete to authenticated using (auth.uid() = user_id);

create table public.blacklist (
  word text primary key,
  created_at timestamptz not null default now()
);
grant select on public.blacklist to anon, authenticated;
grant insert, delete on public.blacklist to authenticated;
grant all on public.blacklist to service_role;
alter table public.blacklist enable row level security;
create policy "blacklist read" on public.blacklist for select using (true);
create policy "admin add word" on public.blacklist for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin del word" on public.blacklist for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- signup: profile + first user becomes admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _h text; _base text; _n int := 0;
begin
  _base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'handle', ''), '[^a-zA-Z0-9_]', '', 'g'));
  if length(_base) < 3 then _base := 'phantom' || substr(md5(new.id::text),1,5); end if;
  _base := substr(_base,1,20);
  _h := _base;
  while exists (select 1 from profiles where handle = _h) loop
    _n := _n + 1; _h := _base || _n;
  end loop;
  insert into profiles (id, handle, avatar) values (new.id, _h, coalesce(nullif(new.raw_user_meta_data->>'avatar',''), '👻'));
  insert into user_roles (user_id, role) values (new.id, 'user');
  if not exists (select 1 from user_roles where role = 'admin') then
    insert into user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.contains_blocked(_t text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blacklist b where _t ~* ('\m' || b.word || '\M'))
$$;

create or replace function public.assert_can_post()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from profiles where id = auth.uid() and status = 'suspended') then
    raise exception 'Your alias is suspended';
  end if;
end $$;

create or replace function public.create_confession(_body text, _category text, _as_alias boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _author uuid; _handle text;
begin
  _body := trim(_body);
  if length(_body) < 5 or length(_body) > 1000 then raise exception 'Confession must be 5-1000 characters'; end if;
  if _category not in ('Campus Drama','Crushes','Academics','Roommates','Late Night','Hot Takes','Confessions') then raise exception 'Invalid category'; end if;
  if contains_blocked(_body) then raise exception 'Your confession contains blocked words'; end if;
  perform assert_can_post();
  if _as_alias and auth.uid() is not null then _author := auth.uid(); end if;
  insert into confessions (body, category, author_id) values (_body, _category, _author) returning id into _id;
  if _author is not null then
    select handle into _handle from profiles where id = _author;
    insert into notifications (user_id, type, message, confession_id)
      select follower_id, 'follow_post', '@' || _handle || ' just dropped a new confession', _id from follows where followee_id = _author;
  end if;
  return _id;
end $$;

create or replace function public.add_comment(_confession_id uuid, _body text, _device text, _as_alias boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _author uuid; _owner uuid; _h text; _name text; _hue int;
  adjs text[] := array['Sleepy','Shady','Neon','Silent','Spicy','Midnight','Sneaky','Velvet','Cosmic','Feral','Lucky','Salty'];
  nouns text[] := array['Owl','Fox','Raccoon','Moth','Ghost','Cat','Bat','Gecko','Panda','Otter','Crow','Wolf'];
begin
  _body := trim(_body);
  if length(_body) < 1 or length(_body) > 500 then raise exception 'Comment must be 1-500 characters'; end if;
  if contains_blocked(_body) then raise exception 'Your comment contains blocked words'; end if;
  perform assert_can_post();
  select author_id into _owner from confessions where id = _confession_id and status = 'visible';
  if not found then raise exception 'Confession not found'; end if;
  if _as_alias and auth.uid() is not null then
    _author := auth.uid();
  else
    _h := md5(coalesce(auth.uid()::text, coalesce(_device,'x')) || _confession_id::text);
    _name := adjs[1 + (('x' || substr(_h,1,4))::bit(16)::int % 12)] || ' ' || nouns[1 + (('x' || substr(_h,5,4))::bit(16)::int % 12)];
    _hue := ('x' || substr(_h,9,4))::bit(16)::int % 360;
    if _owner is not null and _owner = auth.uid() then _name := 'OP'; end if;
  end if;
  insert into comments (confession_id, body, author_id, anon_name, anon_hue) values (_confession_id, _body, _author, _name, _hue) returning id into _id;
  update confessions set comment_count = comment_count + 1 where id = _confession_id;
  if _owner is not null and _owner is distinct from auth.uid() then
    insert into notifications (user_id, type, message, confession_id) values (_owner, 'reply', 'Someone replied to your confession', _confession_id);
  end if;
  return _id;
end $$;

create or replace function public.cast_vote(_confession_id uuid, _device text, _value int)
returns void language plpgsql security definer set search_path = public as $$
declare _key text; _up int; _owner uuid;
begin
  _key := coalesce(auth.uid()::text, 'd:' || left(coalesce(_device,''),64));
  if _key = 'd:' then raise exception 'Missing device'; end if;
  if _value = 0 then delete from votes where confession_id = _confession_id and voter_key = _key;
  elsif _value in (1,-1) then
    insert into votes values (_confession_id, _key, _value) on conflict (confession_id, voter_key) do update set value = excluded.value;
  else raise exception 'Invalid vote'; end if;
  update confessions c set
    upvotes = (select count(*) from votes v where v.confession_id = c.id and v.value = 1),
    downvotes = (select count(*) from votes v where v.confession_id = c.id and v.value = -1)
  where c.id = _confession_id returning upvotes, author_id into _up, _owner;
  if _value = 1 and _owner is not null and _up in (10,25,50,100,250,500,1000)
     and not exists (select 1 from notifications where user_id = _owner and confession_id = _confession_id and type = 'milestone' and message like '%' || _up || ' upvotes%') then
    insert into notifications (user_id, type, message, confession_id) values (_owner, 'milestone', 'Your confession hit ' || _up || ' upvotes 🔥', _confession_id);
  end if;
end $$;

create or replace function public.toggle_reaction(_confession_id uuid, _device text, _emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare _key text;
begin
  if _emoji not in ('🔥','💀','🤫','👀') then raise exception 'Invalid reaction'; end if;
  _key := coalesce(auth.uid()::text, 'd:' || left(coalesce(_device,''),64));
  if _key = 'd:' then raise exception 'Missing device'; end if;
  if exists (select 1 from reactions where confession_id = _confession_id and voter_key = _key and emoji = _emoji) then
    delete from reactions where confession_id = _confession_id and voter_key = _key and emoji = _emoji;
  else
    insert into reactions values (_confession_id, _key, _emoji);
  end if;
  update confessions set reactions = coalesce((select jsonb_object_agg(emoji, n) from (select emoji, count(*) n from reactions where confession_id = _confession_id group by emoji) s), '{}'::jsonb)
  where id = _confession_id;
end $$;

create or replace function public.report_content(_type text, _id uuid, _device text, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare _key text; _n int;
begin
  _key := coalesce(auth.uid()::text, 'd:' || left(coalesce(_device,''),64));
  if _type not in ('confession','comment') then raise exception 'Invalid type'; end if;
  insert into reports (target_type, target_id, reporter_key, reason) values (_type, _id, _key, left(coalesce(_reason,''),200)) on conflict do nothing;
  if not found then return; end if;
  if _type = 'confession' then
    update confessions set report_count = report_count + 1, status = case when report_count + 1 >= 3 and status = 'visible' then 'flagged' else status end where id = _id;
  else
    update comments set report_count = report_count + 1, status = case when report_count + 1 >= 3 and status = 'visible' then 'flagged' else status end where id = _id;
  end if;
end $$;

create or replace function public.moderate(_type text, _id uuid, _action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  if _type = 'confession' then
    if _action = 'approve' then update confessions set status = 'visible', report_count = 0 where id = _id;
    elsif _action = 'delete' then delete from confessions where id = _id; end if;
  elsif _type = 'comment' then
    if _action = 'approve' then update comments set status = 'visible', report_count = 0 where id = _id;
    elsif _action = 'delete' then
      update confessions set comment_count = greatest(comment_count - 1, 0) where id = (select confession_id from comments where id = _id);
      delete from comments where id = _id;
    end if;
  end if;
  delete from reports where target_type = _type and target_id = _id;
end $$;

create or replace function public.set_alias_status(_user uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  if _status not in ('active','warned','suspended') then raise exception 'Invalid status'; end if;
  update profiles set status = _status where id = _user;
  if _status <> 'active' then
    insert into notifications (user_id, type, message) values (_user, 'moderation',
      case when _status = 'warned' then '⚠️ A moderator warned your alias. Keep it respectful.' else '⛔ Your alias has been suspended.' end);
  end if;
end $$;

create or replace function public.alias_stats(_id uuid default null)
returns table (id uuid, handle text, avatar text, bio text, status text, karma bigint, followers bigint, posts bigint, comments bigint, score numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.avatar, p.bio, p.status,
    coalesce((select sum(c.upvotes - c.downvotes) from confessions c where c.author_id = p.id and c.status = 'visible'),0)::bigint,
    (select count(*) from follows f where f.followee_id = p.id),
    (select count(*) from confessions c where c.author_id = p.id and c.status = 'visible'),
    (select count(*) from comments m where m.author_id = p.id and m.status = 'visible'),
    0::numeric, p.created_at
  from profiles p where (_id is null or p.id = _id)
$$;

grant execute on function public.create_confession, public.add_comment, public.cast_vote, public.toggle_reaction, public.report_content, public.alias_stats, public.contains_blocked to anon, authenticated;
grant execute on function public.moderate, public.set_alias_status to authenticated;

insert into public.blacklist (word) values ('slur'), ('doxx');
