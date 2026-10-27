import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronUp, Flag, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReportDialog } from "@/components/ReportDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { errMsg, timeAgo } from "@/lib/app";
import { useSession } from "@/lib/session";
import { useComments, type Comment } from "@/lib/comments";
import { cn } from "@/lib/utils";

const INLINE_PREVIEW = 3;
const INLINE_REPLIES = 2;

export function CommentRow({
  comment: m,
  replies = [],
  compact = false,
  confessionId,
  onReport,
  onViewAll,
  maxReplies,
}: {
  comment: Comment;
  replies?: Comment[];
  compact?: boolean;
  confessionId: string;
  onReport: (id: string) => void;
  onViewAll?: () => void;
  maxReplies?: number;
}) {
  const { profile } = useSession();
  const [replying, setReplying] = useState(false);
  const shown = maxReplies === undefined ? replies : replies.slice(0, maxReplies);
  return (
    <article className={compact ? "" : "border-b pb-4 last:border-0"}>
      <div className="mb-1 flex items-center gap-2 text-xs">
        {m.author ? (
          <Link
            to="/u/$handle"
            params={{ handle: m.author.handle }}
            className="font-semibold text-neon-2"
          >
            {m.author.avatar} @{m.author.handle}
          </Link>
        ) : (
          <span className="font-semibold text-neon-2">● {m.anon_name ?? "Ghost"}</span>
        )}
        <span className="text-muted-foreground">{timeAgo(m.created_at)}</span>
        {!(profile && m.author_id === profile.id) && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Report comment"
            title="Report comment"
            onClick={() => onReport(m.id)}
            className="ml-auto size-8 shrink-0 text-muted-foreground"
          >
            <Flag className="size-3.5" />
          </Button>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
      {!m.parent_id && (
        <Button
          variant="link"
          aria-expanded={replying}
          onClick={() => setReplying((open) => !open)}
          className="mt-1 h-auto p-0 text-xs text-muted-foreground"
        >
          {replying ? "Cancel" : "Reply"}
        </Button>
      )}
      {replying && (
        <div className="mt-2 ml-3 border-l pl-3">
          <CommentComposer
            id={confessionId}
            parentId={m.id}
            compact
            autoFocus
            onPosted={() => setReplying(false)}
          />
        </div>
      )}
      {shown.length > 0 && (
        <div className="mt-2 ml-3 space-y-3 border-l pl-3">
          {shown.map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              compact={compact}
              confessionId={confessionId}
              onReport={onReport}
            />
          ))}
          {replies.length > shown.length && onViewAll && (
            <Button variant="link" className="h-auto p-0 text-xs" onClick={onViewAll}>
              View all {replies.length} replies
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

export function CommentComposer({
  id,
  parentId = null,
  autoFocus = false,
  compact = false,
  onPosted,
}: {
  id: string;
  parentId?: string | null;
  autoFocus?: boolean;
  compact?: boolean;
  onPosted?: () => void;
}) {
  const { profile, ensureSession } = useSession();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [asAlias, setAsAlias] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: postingOpen = true } = useQuery({
    queryKey: ["posting-status"],
    staleTime: 15_000,
    queryFn: async () => (await supabase.rpc("posting_open")).data ?? true,
  });
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  async function send() {
    if (busy || !body.trim() || !postingOpen) return;
    setBusy(true);
    try {
      await ensureSession();
      const { error } = await supabase.rpc("add_comment", {
        _confession_id: id,
        _body: body.trim(),
        _as_alias: asAlias && !!profile,
        _parent_id: parentId,
      });
      if (error) throw error;
      setBody("");
      // Reset pagination so a new reply is loaded even on a long thread.
      await qc.resetQueries({ queryKey: ["comments", id] });
      qc.invalidateQueries({ queryKey: ["confession", id] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(parentId ? "Reply posted" : "Comment posted");
      onPosted?.();
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className={cn(
        compact
          ? "space-y-2"
          : "shrink-0 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6",
      )}
    >
      {!postingOpen && (
        <p className={cn("text-destructive", compact ? "text-xs" : "mb-2 text-sm")}>
          Replies are paused by moderators.
        </p>
      )}
      <textarea
        ref={inputRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={500}
        rows={compact ? 1 : 2}
        placeholder={
          parentId ? "Write a reply…" : compact ? "Write a comment…" : "Join the discussion…"
        }
        aria-label={parentId ? "Write a reply" : compact ? "Write a comment" : "Write a reply"}
        className={cn(
          "w-full resize-none rounded-lg border bg-muted outline-none focus-visible:ring-1 focus-visible:ring-ring",
          compact ? "p-2.5 text-sm" : "p-3 text-base",
        )}
      />
      <div className="flex items-center gap-2">
        {profile ? (
          <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={asAlias} onCheckedChange={setAsAlias} />
            <span className="truncate">{asAlias ? `As @${profile.handle}` : "Incognito"}</span>
          </label>
        ) : (
          <span className="text-xs text-muted-foreground">👻 Incognito</span>
        )}
        <Button
          type="submit"
          disabled={busy || !body.trim() || !postingOpen}
          className={cn("ml-auto", compact ? "min-h-9 px-3 text-xs" : "min-h-10")}
        >
          <Send />
          {busy ? "Sending…" : compact ? (parentId ? "Reply" : "Comment") : "Reply"}
        </Button>
      </div>
    </form>
  );
}

function CommentReportDialog({
  reporting,
  setReporting,
}: {
  reporting: string | null;
  setReporting: (id: string | null) => void;
}) {
  if (!reporting) return null;
  return (
    <ReportDialog
      type="comment"
      id={reporting}
      open
      onOpenChange={(open) => {
        if (!open) setReporting(null);
      }}
    />
  );
}

export function CommentThread({ id }: { id: string }) {
  const { roots, repliesByParent } = useComments(id);
  const [reporting, setReporting] = useState<string | null>(null);
  const rows = roots.data?.pages.flat() ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section
        aria-label="Replies"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
      >
        {roots.isPending && <div className="h-20 animate-pulse rounded-lg bg-muted" />}
        {roots.isError && (
          <div className="text-sm text-destructive">
            Couldn't load replies.{" "}
            <Button variant="link" onClick={() => roots.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!roots.isPending && !roots.isError && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No replies yet. Say what everyone's thinking.
          </p>
        )}
        {rows.map((m) => (
          <CommentRow
            key={m.id}
            comment={m}
            replies={repliesByParent.get(m.id) ?? []}
            confessionId={id}
            onReport={setReporting}
          />
        ))}
        {roots.hasNextPage && (
          <Button
            variant="secondary"
            className="w-full"
            disabled={roots.isFetchingNextPage}
            onClick={() => roots.fetchNextPage()}
          >
            {roots.isFetchingNextPage ? "Loading…" : "More comments"}
          </Button>
        )}
      </section>
      <CommentComposer id={id} />
      <CommentReportDialog reporting={reporting} setReporting={setReporting} />
    </div>
  );
}

/** Facebook-style preview shown inside a feed card; "View all" opens the discussion sheet. */
export function InlineComments({
  id,
  count,
  onViewAll,
  onCollapse,
}: {
  id: string;
  count: number;
  onViewAll: () => void;
  onCollapse: () => void;
}) {
  const { roots, repliesByParent } = useComments(id);
  const [reporting, setReporting] = useState<string | null>(null);
  const rows = roots.data?.pages.flat() ?? [];
  const shown = rows.slice(0, INLINE_PREVIEW);
  const total = Math.max(count, rows.length);
  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <CommentComposer id={id} compact autoFocus />
      {roots.isPending && <div className="h-10 animate-pulse rounded-lg bg-muted" />}
      {roots.isError && (
        <p className="text-xs text-destructive">
          Couldn't load comments.{" "}
          <Button variant="link" className="h-auto p-0 text-xs" onClick={() => roots.refetch()}>
            Try again
          </Button>
        </p>
      )}
      {!roots.isPending && !roots.isError && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No comments yet — start the thread.</p>
      )}
      {shown.map((m) => (
        <CommentRow
          key={m.id}
          comment={m}
          replies={repliesByParent.get(m.id) ?? []}
          compact
          confessionId={id}
          onReport={setReporting}
          onViewAll={onViewAll}
          maxReplies={INLINE_REPLIES}
        />
      ))}
      {total > shown.length && (
        <Button variant="link" className="h-auto p-0 text-xs" onClick={onViewAll}>
          View all {total} comments
        </Button>
      )}
      <Button
        variant="ghost"
        onClick={onCollapse}
        className="h-auto p-0 text-xs text-muted-foreground"
      >
        <ChevronUp className="size-3" />
        Hide comments
      </Button>
      <CommentReportDialog reporting={reporting} setReporting={setReporting} />
    </div>
  );
}
