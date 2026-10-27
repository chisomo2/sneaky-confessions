import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ConfessionCard, type Confession } from "@/components/ConfessionCard";
import { CommentThread } from "@/components/CommentThread";
import { errMsg } from "@/lib/app";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/c/$id")({
  head: () => ({
    meta: [
      { title: "Confession · DMI Confessions" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Read this anonymous campus confession and join the discussion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "A confession on DMI Confessions" },
      { property: "og:description", content: "Read and join the anonymous discussion." },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const {
    data: c,
    isPending,
    error,
  } = useQuery({
    queryKey: ["confession", id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("confession_detail", { _id: id });
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      return {
        ...row,
        reactions: row.reactions ?? {},
        my_reactions: row.my_reactions ?? [],
        author: row.author_handle
          ? { handle: row.author_handle, avatar: row.author_avatar ?? "👻" }
          : null,
      } as Confession;
    },
  });
  if (isPending) return <div className="mx-auto h-48 max-w-2xl animate-pulse rounded-lg bg-card" />;
  if (error) return <p className="text-center text-destructive">{errMsg(error)}</p>;
  if (!c)
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">This confession vanished (or is under review).</p>
        <Link to="/" className="mt-3 inline-block text-primary">
          Back to feed
        </Link>
      </div>
    );
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ConfessionCard c={c} full />
      <section id="comments" className="flex h-[70dvh] scroll-mt-20 flex-col border-t">
        <h2 className="py-4 text-lg font-semibold">Comments</h2>
        <CommentThread id={id} />
      </section>
    </div>
  );
}
