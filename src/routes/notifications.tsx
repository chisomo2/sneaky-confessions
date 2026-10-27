import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, timeAgo } from "@/lib/app";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · Sneaky Confessions" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Replies, followed aliases and upvote milestones." },
      { property: "og:title", content: "Notifications · Sneaky Confessions" },
      { property: "og:description", content: "Your latest campus alerts." },
    ],
  }),
  component: Notifs,
});

const ICON: Record<string, string> = {
  follow_post: "📣",
  reply: "💬",
  milestone: "🔥",
  moderation: "⚠️",
};

function Notifs() {
  const { profile, ready } = useSession();
  const qc = useQueryClient();
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["notifications", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!profile || !data.some((n) => !n.read)) return;
    const t = setTimeout(async () => {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", profile.id)
        .eq("read", false);
      qc.invalidateQueries({ queryKey: ["unread"] });
      qc.invalidateQueries({ queryKey: ["notifications", profile.id] });
    }, 1500);
    return () => clearTimeout(t);
  }, [data, profile, qc]);

  async function remove(id: string) {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ["unread"] });
    qc.invalidateQueries({ queryKey: ["notifications", profile?.id] });
  }

  if (ready && !profile)
    return (
      <p className="py-20 text-center text-muted-foreground">
        Notifications are for aliases.{" "}
        <Link to="/auth" className="text-primary">
          Sign in
        </Link>
      </p>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-5 text-2xl font-extrabold">Notifications</h1>
      {isLoading && <div className="h-20 animate-pulse rounded-xl bg-card" />}
      {isError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Couldn't load notifications. Try refreshing.
        </p>
      )}
      {!isLoading && !isError && data.length === 0 && (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          All quiet. 🌌
        </p>
      )}
      <div className="space-y-2">
        {data.map((n) => {
          const content = (
            <>
              <span className="text-xl">{ICON[n.type] ?? "🔔"}</span>
              <span className="min-w-0 flex-1 text-sm">{n.message}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(n.created_at)}
              </span>
            </>
          );
          return (
            <div
              key={n.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-card/60 p-1 pl-4",
                !n.read && "border-primary/50",
              )}
            >
              {n.confession_id ? (
                <Link
                  to="/c/$id"
                  params={{ id: n.confession_id }}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3 py-3">{content}</div>
              )}
              <button
                aria-label="Delete notification"
                onClick={() => remove(n.id)}
                className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
