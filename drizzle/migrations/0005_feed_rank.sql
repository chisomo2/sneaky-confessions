-- 0005_feed_rank.sql
-- Latest is the default feed mode, and the Hot tab ranks by popularity
-- (net likes + comments) instead of dividing engagement by age. The old
-- decay formula let a single old like outrank every brand-new post, so the
-- feed appeared stuck on older confessions.

begin;

create or replace function public.feed_page(
  _tab text default 'latest',
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
  _mode text := case
    when lower(coalesce(_tab, 'latest')) in ('hot', 'latest', 'following')
      then lower(coalesce(_tab, 'latest'))
    else 'latest'
  end;
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
    case when _mode = 'hot'
      then (c.upvotes - c.downvotes) + c.comment_count
      else 0
    end desc,
    c.created_at desc,
    c.id desc
  limit _limit_clean offset _offset_clean;
end $$;

revoke all on function public.feed_page(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.feed_page(text, text, text, int, int) to anon, authenticated;

commit;
