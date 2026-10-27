import { useEffect, useRef, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ConfessionCard, type Confession } from "@/components/ConfessionCard";
import { Button } from "@/components/ui/button";
import { CATEGORIES, errMsg } from "@/lib/app";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Tab = "latest" | "hot" | "following";
type Search = { tab?: Tab | undefined; cat?: string | undefined; q?: string | undefined };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: s["tab"] === "hot" || s["tab"] === "following" ? s["tab"] : undefined,
    cat: typeof s["cat"] === "string" ? s["cat"] : undefined,
    q: typeof s["q"] === "string" ? s["q"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "DMI Confessions — Campus secrets, after dark" },
      {
        name: "description",
        content: "Drop anonymous campus confessions, react, vote and spill the tea at DMI.",
      },
      { property: "og:title", content: "DMI Confessions — Campus secrets, after dark" },
      {
        property: "og:description",
        content: "Anonymous confessions, gossip and hot takes from campus.",
      },
    ],
  }),
  component: Feed,
});

const PAGE_SIZE = 20;

type FeedRow = {
  id: string;
  body: string;
  category: string;
  author_id: string | null;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  reactions: Record<string, number> | null;
  created_at: string;
  author_handle: string | null;
  author_avatar: string | null;
  my_vote: number;
  my_reactions: string[] | null;
};

function Feed() {
  const { tab = "latest", cat, q } = Route.useSearch();
  const { profile, user } = useSession();

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["feed", tab, cat, q, user?.id],
      enabled: !(tab === "following" && !profile),
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => {
        const { data, error } = await supabase.rpc("feed_page", {
          _tab: tab,
          ...(cat ? { _category: cat } : {}),
          ...(q ? { _q: q } : {}),
          _limit: PAGE_SIZE,
          _offset: pageParam,
        });
        if (error) throw error;
        const rows = ((data ?? []) as FeedRow[]).map((r) => ({
          ...r,
          reactions: r.reactions ?? {},
          my_reactions: r.my_reactions ?? [],
          author: r.author_handle
            ? { handle: r.author_handle, avatar: r.author_avatar ?? "👻" }
            : null,
        })) as Confession[];
        return { rows, next: rows.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null };
      },
      getNextPageParam: (last) => last.next,
    });
  const pages = data?.pages.flatMap((page) => page.rows) ?? [];
  const seen = new Set<string>();
  const posts = pages.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "latest", label: "🌙 Latest" },
    { id: "hot", label: "🔥 Hot" },
    { id: "following", label: "👥 Following" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <section className="min-w-0">
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-muted p-1 sm:flex sm:w-fit">
          {tabs.map((t) => (
            <Link
              key={t.id}
              to="/"
              search={{ tab: t.id === "latest" ? undefined : t.id, cat, q }}
              className={cn(
                "grid min-h-10 place-items-center whitespace-nowrap rounded-full px-3 text-sm transition sm:px-5",
                tab === t.id ? "bg-card text-foreground glow" : "text-muted-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="no-scrollbar fade-x -mx-4 mb-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0">
          <Link to="/" search={{ tab: tab === "latest" ? undefined : tab, q }} className="shrink-0">
            <Chip active={!cat}>All</Chip>
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              to="/"
              search={{ tab: tab === "latest" ? undefined : tab, cat: c, q }}
              className="shrink-0"
            >
              <Chip active={cat === c}>{c}</Chip>
            </Link>
          ))}
        </div>
        {q && (
          <p className="mb-3 text-sm text-muted-foreground">
            Results for “{q}” ·{" "}
            <Link to="/" className="text-primary">
              clear
            </Link>
          </p>
        )}
        <div className="space-y-4">
          {isLoading &&
            [0, 1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-card" />
            ))}
          {isError && (
            <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {errMsg(error)}
            </p>
          )}
          {posts.map((c) => (
            <ConfessionCard key={c.id} c={c} />
          ))}
          {!isLoading && !isError && posts.length === 0 && <Empty tab={tab} signedIn={!!profile} />}
          {hasNextPage && (
            <LoadMoreSentinel
              loading={isFetchingNextPage}
              onVisible={() => {
                if (!isFetchingNextPage) fetchNextPage();
              }}
            />
          )}
        </div>
      </section>
      <aside className="hidden space-y-4 lg:block">
        <div className="rounded-2xl border bg-card/70 p-5">
          <h3 className="mb-2 text-lg font-bold">Ghost mode is on 👻</h3>
          <p className="text-sm text-muted-foreground">
            Post, vote and comment without an account. Want clout? Grab an alias and build karma —
            or stay incognito anytime.
          </p>
          {!profile && (
            <Link to="/auth" className="mt-3 inline-block text-sm font-semibold text-primary">
              Claim your alias →
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}

function LoadMoreSentinel({ loading, onVisible }: { loading: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && cb.current(), {
      rootMargin: "600px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="py-4">
      {loading ? (
        <div className="h-36 animate-pulse rounded-2xl bg-card" />
      ) : (
        <Button variant="secondary" className="w-full" onClick={onVisible}>
          Load more
        </Button>
      )}
    </div>
  );
}

function Chip({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "grid min-h-9 place-items-center whitespace-nowrap rounded-full border px-3.5 text-xs transition",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Empty({ tab, signedIn }: { tab: Tab; signedIn: boolean }) {
  const msg =
    tab === "following"
      ? signedIn
        ? ["No one you follow has spoken yet.", "Find voices worth following on the leaderboard."]
        : ["Following is for aliases.", "Sign in to follow your favorite campus voices."]
      : ["It's quiet… too quiet.", "Be the first to drop a secret tonight."];
  return (
    <div className="rounded-2xl border border-dashed p-12 text-center">
      <div className="mb-3 text-5xl">🌙</div>
      <h3 className="text-xl font-bold">{msg[0]}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{msg[1]}</p>
      {tab === "following" && !signedIn && (
        <Link to="/auth" className="mt-4 inline-block text-sm font-semibold text-primary">
          Sign in →
        </Link>
      )}
    </div>
  );
}
