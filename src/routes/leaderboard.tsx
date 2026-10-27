import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TITLES, titleFor } from "@/lib/app";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Campus Leaderboard · DMI Confessions" },
      {
        name: "description",
        content: "Top campus voices ranked by karma, followers and activity.",
      },
      { property: "og:title", content: "DMI Campus Leaderboard" },
      { property: "og:description", content: "Who runs the campus whisper network?" },
    ],
  }),
  component: Leaderboard,
});

function Leaderboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leaderboard_page", { _limit: 50, _offset: 0 });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-3xl font-extrabold">
        🏆 <span className="neon-text">Campus Leaderboard</span>
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Ranked by upvotes, followers and activity. Incognito posts never count.
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        {TITLES.map((t) => (
          <span key={t.title} className="rounded-full bg-muted px-3 py-1 text-xs">
            {t.title} · {t.min}+
          </span>
        ))}
      </div>
      {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-card" />}
      {isError && (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Couldn't load the leaderboard. Try again.
        </p>
      )}
      {data?.length === 0 && (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          No legends yet. The throne is empty 👑
        </p>
      )}
      <ol className="space-y-2">
        {data?.map((r, i) => (
          <li key={r.id}>
            <Link
              to="/u/$handle"
              params={{ handle: r.handle }}
              className="flex items-center gap-3 rounded-2xl border bg-card/70 p-3 transition hover:border-primary/50 sm:gap-4 sm:p-4"
            >
              <span className="w-6 shrink-0 text-center font-display text-lg font-bold text-muted-foreground sm:w-8 sm:text-xl">
                {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
              </span>
              <span className="shrink-0 text-2xl sm:text-3xl">{r.avatar}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">@{r.handle}</div>
                <div className="truncate text-xs text-primary">{titleFor(Number(r.karma))}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                  {String(r.karma)} karma · {String(r.followers)} followers · {String(r.posts)}{" "}
                  posts
                </div>
              </div>
              <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                <div>
                  <b className="text-foreground">{String(r.karma)}</b> karma
                </div>
                <div>
                  {String(r.followers)} followers · {String(r.posts)} posts
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
