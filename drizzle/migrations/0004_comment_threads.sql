-- ---------------------------------------------------------------------------
-- 0004: one level of threaded replies under a comment (Facebook-style).
-- Adds comments.parent_id, indexes it, and makes add_comment accept a parent.
-- Replies must share the confession and can only hang off a top-level comment.
-- ---------------------------------------------------------------------------
begin;

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx
  on public.comments (parent_id) where parent_id is not null;

drop function if exists public.add_comment(uuid, text, boolean);

create or replace function public.add_comment(
  _confession_id uuid,
  _body text,
  _as_alias boolean,
  _parent_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _id uuid; _author uuid; _owner uuid; _h text; _name text; _hue int; _uid uuid := auth.uid();
  _parent_confession uuid; _parent_parent uuid; _parent_author uuid;
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
  if _parent_id is not null then
    select parent_id, confession_id, author_id
      into _parent_parent, _parent_confession, _parent_author
      from public.comments
      where id = _parent_id and status = 'visible';
    if not found then raise exception 'Comment not found'; end if;
    if _parent_confession is distinct from _confession_id then
      raise exception 'Reply must stay on the same confession';
    end if;
    if _parent_parent is not null then
      raise exception 'Replies can only go one level deep';
    end if;
  end if;
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
  insert into public.comments (confession_id, body, author_id, anon_name, anon_hue, parent_id)
    values (_confession_id, _body, _author, _name, _hue, _parent_id) returning id into _id;
  update public.confessions set comment_count = comment_count + 1 where id = _confession_id;
  if _owner is not null and _owner is distinct from _uid then
    insert into public.notifications (user_id, type, message, confession_id)
      values (_owner, 'reply', 'Someone replied to your confession', _confession_id);
  end if;
  if _parent_author is not null and _parent_author is distinct from _uid and _parent_author is distinct from _owner then
    insert into public.notifications (user_id, type, message, confession_id)
      values (_parent_author, 'reply', 'Someone replied to your comment', _confession_id);
  end if;
  return _id;
end $$;

revoke all on function public.add_comment(uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.add_comment(uuid, text, boolean, uuid) to authenticated;

commit;
