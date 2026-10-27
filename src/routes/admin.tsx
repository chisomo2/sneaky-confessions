import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { errMsg, timeAgo } from "@/lib/app";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin · Sneaky Confessions" },
      { name: "description", content: "Moderation tools for Sneaky Confessions." },
      { property: "og:title", content: "Admin · Sneaky Confessions" },
      { property: "og:description", content: "Moderation tools." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { isAdmin, ready, user } = useSession();
  if (!ready) return null;
  if (!user || !isAdmin)
    return (
      <p className="py-20 text-center text-muted-foreground">
        Admins only.{" "}
        <Link to="/auth" className="text-primary">
          Sign in
        </Link>
      </p>
    );
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-xl font-extrabold sm:text-2xl">🛡️ Moderation</h1>
      <Tabs defaultValue="queue">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-flex sm:h-9 sm:w-auto sm:gap-0">
          <TabsTrigger value="queue" className="min-h-10 sm:min-h-0">
            Flagged queue
          </TabsTrigger>
          <TabsTrigger value="words" className="min-h-10 sm:min-h-0">
            Blacklist
          </TabsTrigger>
          <TabsTrigger value="users" className="min-h-10 sm:min-h-0">
            Aliases
          </TabsTrigger>
          <TabsTrigger value="audit" className="min-h-10 sm:min-h-0">
            Audit
          </TabsTrigger>
          <TabsTrigger value="settings" className="min-h-10 last:col-span-2 sm:min-h-0">
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <Queue />
        </TabsContent>
        <TabsContent value="words">
          <Words />
        </TabsContent>
        <TabsContent value="users">
          <Users />
        </TabsContent>
        <TabsContent value="audit">
          <Audit />
        </TabsContent>
        <TabsContent value="settings">
          <Settings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Queue() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-queue"],
    queryFn: async () => {
      const [c, m, reports] = await Promise.all([
        supabase
          .from("confessions")
          .select("id,body,status,report_count,created_at")
          .gt("report_count", 0)
          .order("report_count", { ascending: false }),
        supabase
          .from("comments")
          .select("id,body,status,report_count,created_at,confession_id")
          .gt("report_count", 0)
          .order("report_count", { ascending: false }),
        supabase
          .from("reports")
          .select("target_type,target_id,reason")
          .order("created_at", { ascending: false }),
      ]);
      const reasons = new Map<string, string[]>();
      for (const r of reports.data ?? []) {
        const key = `${r.target_type}:${r.target_id}`;
        const list = reasons.get(key) ?? [];
        if (r.reason && !list.includes(r.reason)) list.push(r.reason);
        reasons.set(key, list);
      }
      return [
        ...(c.data ?? []).map((x) => ({ ...x, type: "confession" as const })),
        ...(m.data ?? []).map((x) => ({ ...x, type: "comment" as const })),
      ]
        .map((x) => ({ ...x, reasons: reasons.get(`${x.type}:${x.id}`) ?? [] }))
        .sort((a, b) => b.report_count - a.report_count);
    },
  });

  async function act(type: string, id: string, action: "approve" | "delete") {
    let reason = "";
    if (action === "delete") {
      const input = window.prompt("Reason for deleting (optional)");
      if (input === null) return;
      reason = input.trim();
    }
    const { error } = await supabase.rpc("moderate", {
      _type: type,
      _id: id,
      _action: action,
      _reason: reason,
    });
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success(action === "approve" ? "Approved" : "Deleted");
    qc.invalidateQueries({ queryKey: ["admin-queue"] });
    qc.invalidateQueries({ queryKey: ["admin-audit"] });
    qc.invalidateQueries({ queryKey: ["feed"] });
  }

  if (!data?.length)
    return <p className="py-10 text-center text-muted-foreground">Queue is clean. ✨</p>;
  return (
    <div className="space-y-3">
      {data.map((x) => (
        <div key={x.id} className="rounded-xl border bg-card/70 p-4">
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-2">{x.type}</span>
            <span className={x.status === "flagged" ? "text-destructive" : ""}>{x.status}</span>
            <span>
              · {x.report_count} reports · {timeAgo(x.created_at)}
            </span>
          </div>
          <p className="mb-2 whitespace-pre-wrap text-sm">{x.body}</p>
          {x.reasons.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {x.reasons.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  “{r}”
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => act(x.type, x.id, "approve")}>
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => act(x.type, x.id, "delete")}>
              Delete
            </Button>
            {x.type === "confession" && (
              <Link
                to="/c/$id"
                params={{ id: x.id }}
                className="inline-flex min-h-8 items-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Open
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Words() {
  const qc = useQueryClient();
  const [w, setW] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["blacklist"],
    queryFn: async () =>
      (await supabase.from("blacklist").select("word")).data?.map((r) => r.word) ?? [],
  });
  async function add() {
    const word = w.trim().toLowerCase();
    if (!word) return;
    const { error } = await supabase.from("blacklist").insert({ word });
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    setW("");
    qc.invalidateQueries({ queryKey: ["blacklist"] });
  }
  async function remove(word: string) {
    await supabase.from("blacklist").delete().eq("word", word);
    qc.invalidateQueries({ queryKey: ["blacklist"] });
  }
  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Input
          value={w}
          onChange={(e) => setW(e.target.value)}
          placeholder="Add blocked word"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.map((word) => (
          <span
            key={word}
            className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm"
          >
            {word}
            <button
              onClick={() => remove(word)}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${word}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function Users() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await supabase.rpc("alias_stats", {})).data ?? [],
  });
  async function set(id: string, status: string) {
    if (
      status === "suspended" &&
      !window.confirm("Suspend this alias? They won't be able to post or comment.")
    )
      return;
    const { error } = await supabase.rpc("set_alias_status", { _user: id, _status: status });
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success(`Alias ${status}`);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-audit"] });
  }
  return (
    <div>
      <Input
        className="mb-4"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search aliases"
      />
      <div className="space-y-2">
        {data
          .filter((u) => u.handle.includes(q.toLowerCase()))
          .map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/70 p-3"
            >
              <span className="text-2xl">{u.avatar}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">@{u.handle}</div>
                <div className="text-xs text-muted-foreground">
                  {u.status} · {String(u.karma)} karma · {String(u.posts)} posts
                </div>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 sm:flex-none"
                  onClick={() => set(u.id, "active")}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 sm:flex-none"
                  onClick={() => set(u.id, "warned")}
                >
                  Warn
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 sm:flex-none"
                  onClick={() => set(u.id, "suspended")}
                >
                  Suspend
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Audit() {
  const { data = [] } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: async () =>
      (
        await supabase
          .from("moderation_actions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });
  if (!data.length)
    return <p className="py-10 text-center text-muted-foreground">No moderation actions yet.</p>;
  return (
    <div className="space-y-2">
      {data.map((a) => (
        <div key={a.id} className="rounded-xl border bg-card/70 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-2 py-0.5">{a.target_type}</span>
            <span className="font-semibold uppercase tracking-wide text-foreground">
              {a.action}
            </span>
            <span>{timeAgo(a.created_at)}</span>
          </div>
          {a.reason && <p className="mt-1 text-muted-foreground">{a.reason}</p>}
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {a.target_type === "confession" && a.target_id ? (
              <Link
                to="/c/$id"
                params={{ id: a.target_id }}
                className="underline-offset-4 hover:underline"
              >
                {a.target_id}
              </Link>
            ) : (
              (a.target_id ?? "site-wide")
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: postingOpen = true } = useQuery({
    queryKey: ["posting-status"],
    queryFn: async () => (await supabase.rpc("posting_open")).data ?? true,
  });

  async function toggle(open: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("set_posting_enabled", { _enabled: open });
    setBusy(false);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success(open ? "Posting is open" : "Posting paused");
    qc.invalidateQueries({ queryKey: ["posting-status"] });
    qc.invalidateQueries({ queryKey: ["admin-audit"] });
  }

  async function cleanup() {
    if (!window.confirm("Delete expired rate-limit events, read notifications and old reports?"))
      return;
    setBusy(true);
    const { data, error } = await supabase.rpc("run_retention_cleanup");
    setBusy(false);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    const r = data as { write_events: number; notifications: number; reports: number } | null;
    toast.success(
      `Removed ${r?.write_events ?? 0} rate events, ${r?.notifications ?? 0} notifications and ${r?.reports ?? 0} reports`,
    );
    qc.invalidateQueries({ queryKey: ["admin-audit"] });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card/70 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Posting is {postingOpen ? "open" : "paused"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pausing blocks new confessions and comments. Votes, reactions and reports stay
              available.
            </p>
          </div>
          <Switch
            checked={postingOpen}
            onCheckedChange={toggle}
            disabled={busy}
            aria-label="Toggle posting"
          />
        </div>
      </div>
      <div className="rounded-xl border bg-card/70 p-4">
        <h2 className="font-semibold">Retention cleanup</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Removes rate-limit events older than 30 days, read notifications older than 90 days, and
          reports older than 180 days. Moderation audit entries are kept.
        </p>
        <Button
          variant="secondary"
          className="mt-3 w-full sm:w-auto"
          onClick={cleanup}
          disabled={busy}
        >
          Run cleanup
        </Button>
      </div>
    </div>
  );
}
