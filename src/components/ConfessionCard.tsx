import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flag, MessageCircle, SmilePlus, ThumbsDown, ThumbsUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReportDialog } from "@/components/ReportDialog";
import { InlineComments } from "@/components/CommentThread";
import { REACTIONS, errMsg, timeAgo } from "@/lib/app";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDiscussion } from "@/lib/discussion";
import { nextVote, nextVoteCounts, toVote, type Vote } from "@/lib/social";

export type Confession = {
  id: string;
  body: string;
  category: string;
  author_id: string | null;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  reactions: Record<string, number> | unknown;
  created_at: string;
  author?: { handle: string; avatar: string } | null;
  my_vote?: number;
  my_reactions?: string[];
};

export function ConfessionCard({ c, full }: { c: Confession; full?: boolean }) {
  const { profile, ensureSession } = useSession();
  const openDiscussion = useDiscussion();
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [vote, setVote] = useState<Vote>(toVote(c.my_vote));
  const [mine, setMine] = useState<string[]>(c.my_reactions ?? []);
  const [up, setUp] = useState(c.upvotes);
  const [down, setDown] = useState(c.downvotes ?? 0);
  const [reacts, setReacts] = useState<Record<string, number>>(
    (c.reactions as Record<string, number>) ?? {},
  );
  const [pending, setPending] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const isOwn = !!profile && c.author_id === profile.id;

  useEffect(() => {
    setUp(c.upvotes);
    setDown(c.downvotes ?? 0);
    setReacts((c.reactions as Record<string, number>) ?? {});
    setVote(toVote(c.my_vote));
    setMine(c.my_reactions ?? []);
  }, [c.id, c.upvotes, c.downvotes, c.reactions, c.my_vote, c.my_reactions]);

  async function castVote(choice: 1 | -1) {
    if (pending) return;
    const next = nextVote(vote, choice);
    const prev = { vote, up, down };
    const counts = nextVoteCounts(up, down, vote, choice);
    setVote(next);
    setUp(counts.up);
    setDown(counts.down);
    setPending(true);
    try {
      await ensureSession();
      const { error } = await supabase.rpc("cast_vote", { _confession_id: c.id, _value: next });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["confession", c.id] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (e) {
      setVote(prev.vote);
      setUp(prev.up);
      setDown(prev.down);
      toast.error(errMsg(e));
    } finally {
      setPending(false);
    }
  }

  async function react(e: string) {
    if (pending) return;
    setPickerOpen(false);
    const has = mine.includes(e);
    const prevMine = mine;
    const prevReacts = reacts;
    const next = has ? mine.filter((x) => x !== e) : [...mine, e];
    setMine(next);
    setReacts((r) => ({ ...r, [e]: Math.max(0, (r[e] ?? 0) + (has ? -1 : 1)) }));
    setPending(true);
    try {
      await ensureSession();
      const { error } = await supabase.rpc("toggle_reaction", { _confession_id: c.id, _emoji: e });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["confession", c.id] });
    } catch (err) {
      setMine(prevMine);
      setReacts(prevReacts);
      toast.error(errMsg(err));
    } finally {
      setPending(false);
    }
  }

  function toggleComments() {
    if (full) {
      document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setCommentsOpen((open) => !open);
  }

  return (
    <article className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border bg-card p-4 transition hover:border-primary/40 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        {c.author ? (
          <Link
            to="/u/$handle"
            params={{ handle: c.author.handle }}
            className="font-semibold text-neon-2 hover:underline"
          >
            {c.author.avatar} @{c.author.handle}
          </Link>
        ) : (
          <span>👻 Ghost</span>
        )}
        <span>·</span>
        <span className="rounded-full bg-muted px-2 py-0.5">{c.category}</span>
        <span className="ml-auto">{timeAgo(c.created_at)}</span>
      </div>
      {full ? (
        <p className="whitespace-pre-wrap text-lg leading-relaxed">{c.body}</p>
      ) : (
        <p className="whitespace-pre-wrap break-words leading-relaxed line-clamp-6">{c.body}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {up} {up === 1 ? "like" : "likes"}
          {down > 0 && (
            <>
              {" "}
              · {down} {down === 1 ? "dislike" : "dislikes"}
            </>
          )}
          {REACTIONS.filter((e) => (reacts[e] ?? 0) > 0).map((e) => (
            <span key={e} className="ml-2">
              {e} {reacts[e]}
            </span>
          ))}
        </span>
        <Button
          variant="link"
          className="h-auto p-0 text-xs text-muted-foreground"
          aria-expanded={full ? undefined : commentsOpen}
          onClick={toggleComments}
        >
          {c.comment_count} {c.comment_count === 1 ? "comment" : "comments"}
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-1 border-t pt-2">
        <Button
          aria-label="Like"
          aria-pressed={vote === 1}
          variant="ghost"
          disabled={pending}
          onClick={() => castVote(1)}
          className={cn(
            "min-h-11 min-w-0 flex-1 gap-1 px-1 text-xs [&_svg]:size-4 sm:text-sm",
            vote === 1 ? "text-primary" : "text-muted-foreground",
          )}
        >
          <ThumbsUp fill={vote === 1 ? "currentColor" : "none"} />
          <span className="hidden min-[360px]:inline">{vote === 1 ? "Liked" : "Like"}</span>
        </Button>
        <Button
          aria-label="Dislike"
          aria-pressed={vote === -1}
          variant="ghost"
          disabled={pending}
          onClick={() => castVote(-1)}
          className={cn(
            "min-h-11 min-w-0 flex-1 gap-1 px-1 text-xs [&_svg]:size-4 sm:text-sm",
            vote === -1 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          <ThumbsDown fill={vote === -1 ? "currentColor" : "none"} />
          <span className="hidden min-[360px]:inline">{vote === -1 ? "Disliked" : "Dislike"}</span>
        </Button>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              aria-label="Choose reaction"
              title="Choose reaction"
              disabled={pending}
              className={cn(
                "min-h-11 px-1",
                mine.length ? "text-primary" : "text-muted-foreground",
              )}
            >
              <SmilePlus />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="flex w-auto gap-1 p-2">
            {REACTIONS.map((e) => (
              <Button
                key={e}
                variant="ghost"
                aria-label={`React ${e}`}
                aria-pressed={mine.includes(e)}
                disabled={pending}
                onClick={() => react(e)}
                className={cn("size-11 p-0 text-2xl", mine.includes(e) && "bg-primary/15")}
              >
                {e}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          aria-expanded={full ? undefined : commentsOpen}
          onClick={toggleComments}
          className={cn(
            "min-h-11 min-w-0 flex-1 gap-1 px-1 text-xs [&_svg]:size-4 sm:text-sm",
            commentsOpen ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MessageCircle />
          <span className="hidden min-[360px]:inline">Comment</span>
        </Button>
        {!isOwn && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Report"
            title="Report"
            onClick={() => setReportOpen(true)}
            className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Flag />
          </Button>
        )}
      </div>
      {commentsOpen && (
        <InlineComments
          id={c.id}
          count={c.comment_count}
          onViewAll={() => openDiscussion(c.id)}
          onCollapse={() => setCommentsOpen(false)}
        />
      )}
      <ReportDialog type="confession" id={c.id} open={reportOpen} onOpenChange={setReportOpen} />
    </article>
  );
}
