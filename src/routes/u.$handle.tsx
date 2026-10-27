import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ConfessionCard, type Confession } from "@/components/ConfessionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AVATARS, badgesFor, errMsg, titleFor } from "@/lib/app";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/u/$handle")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} · DMI Confessions` },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: `Karma, badges and confessions from @${params.handle}.` },
      { property: "og:title", content: `@${params.handle} on DMI Confessions` },
      { property: "og:description", content: `See @${params.handle}'s campus clout.` },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { handle } = Route.useParams();
  const { profile } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["profile", handle, profile?.id],
    queryFn: async () => {
      const { data: p, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", handle)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!p) return null;
      const [statsRes, postsRes, follow] = await Promise.all([
        supabase.rpc("alias_stats", { _id: p.id }),
        supabase
          .from("confessions")
          .select(
            "id,body,category,author_id,upvotes,downvotes,comment_count,reactions,created_at,author:profiles(handle,avatar)",
          )
          .eq("author_id", p.id)
          .order("created_at", { ascending: false })
          .limit(50),
        profile
          ? supabase
              .from("follows")
              .select("follower_id")
              .eq("follower_id", profile.id)
              .eq("followee_id", p.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (statsRes.error) throw statsRes.error;
      if (postsRes.error) throw postsRes.error;
      const rows = (postsRes.data ?? []) as unknown as Confession[];
      const ids = rows.map((post) => post.id);
      const marks = ids.length
        ? await supabase.rpc("confession_marks", { _ids: ids })
        : { data: [], error: null };
      if (marks.error) throw marks.error;
      const byId = new Map((marks.data ?? []).map((m) => [m.confession_id, m]));
      return {
        s: statsRes.data?.[0],
        posts: rows.map((post) => ({
          ...post,
          reactions: post.reactions ?? {},
          my_vote: byId.get(post.id)?.my_vote ?? 0,
          my_reactions: byId.get(post.id)?.my_reactions ?? [],
        })),
        following: !!follow.data,
      };
    },
  });

  if (isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-card" />;
  if (isError)
    return (
      <p className="mx-auto max-w-2xl rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {errMsg(error)}
      </p>
    );
  if (!data?.s)
    return <p className="py-20 text-center text-muted-foreground">No alias called @{handle}. 👻</p>;
  const s = data.s;
  const karma = Number(s.karma);
  const isMe = profile?.id === s.id;

  async function toggleFollow() {
    if (!profile) {
      toast("Get an alias to follow people");
      return;
    }
    const { error } = data!.following
      ? await supabase
          .from("follows")
          .delete()
          .eq("follower_id", profile.id)
          .eq("followee_id", s.id)
      : await supabase.from("follows").insert({ follower_id: profile.id, followee_id: s.id });
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ["profile", handle] });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-3xl border bg-card/80 p-4 glow sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-muted text-4xl sm:size-20 sm:text-5xl">
            {s.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-all text-xl font-extrabold sm:text-2xl">@{s.handle}</h1>
            <p className="font-display text-sm font-bold neon-text">{titleFor(karma)}</p>
            {s.bio && <p className="mt-2 text-sm text-muted-foreground">{s.bio}</p>}
            {s.status !== "active" && (
              <p className="mt-1 text-xs text-destructive">Status: {s.status}</p>
            )}
          </div>
          {isMe ? (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => setEditing((v) => !v)}
            >
              Edit
            </Button>
          ) : (
            <Button
              size="sm"
              variant={data.following ? "secondary" : "default"}
              className="shrink-0"
              onClick={toggleFollow}
            >
              {data.following ? "Following" : "Follow"}
            </Button>
          )}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center sm:gap-3">
          {[
            ["Karma", karma],
            ["Followers", s.followers],
            ["Posts", s.posts],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-muted p-2 sm:p-3">
              <div className="font-display text-xl font-bold sm:text-2xl">{String(v)}</div>
              <div className="text-[11px] text-muted-foreground sm:text-xs">{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {badgesFor({ karma, followers: Number(s.followers), posts: Number(s.posts) }).map((b) => (
            <span
              key={b}
              className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs"
            >
              {b}
            </span>
          ))}
        </div>
        {isMe && (
          <button
            onClick={signOut}
            className="mt-3 inline-flex min-h-9 items-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign out
          </button>
        )}
        {isMe && editing && (
          <EditProfile
            s={s}
            onDone={() => {
              setEditing(false);
              qc.invalidateQueries();
            }}
          />
        )}
      </div>
      <h2 className="text-lg font-bold">Published as @{s.handle}</h2>
      {data.posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing public yet. The mystery deepens.
        </p>
      ) : (
        <div className="space-y-4">
          {data.posts.map((c) => (
            <ConfessionCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function EditProfile({
  s,
  onDone,
}: {
  s: { id: string; handle: string; avatar: string; bio: string };
  onDone: () => void;
}) {
  const [handle, setHandle] = useState(s.handle);
  const [avatar, setAvatar] = useState(s.avatar);
  const [bio, setBio] = useState(s.bio);
  async function save() {
    const clean = handle.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean.length < 3) {
      toast.error("Handle needs 3+ letters/numbers");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ handle: clean, avatar, bio: bio.slice(0, 160) })
      .eq("id", s.id);
    if (error) {
      toast.error(error.code === "23505" ? "Handle taken" : errMsg(error));
      return;
    }
    toast.success("Saved");
    if (clean !== s.handle) window.location.href = `/u/${clean}`;
    else onDone();
  }
  return (
    <div className="mt-5 space-y-3 border-t pt-5">
      <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" />
      <div className="flex flex-wrap gap-2">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAvatar(a)}
            aria-pressed={avatar === a}
            aria-label={`Avatar ${a}`}
            className={cn(
              "grid size-11 place-items-center rounded-xl bg-muted text-xl",
              avatar === a && "ring-2 ring-primary",
            )}
          >
            {a}
          </button>
        ))}
      </div>
      <Input
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Short bio"
        maxLength={160}
      />
      <Button onClick={save}>Save</Button>
    </div>
  );
}
