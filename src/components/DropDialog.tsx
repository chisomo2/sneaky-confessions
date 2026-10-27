import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, errMsg } from "@/lib/app";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export function DropDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { profile, ensureSession } = useSession();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [cat, setCat] = useState<string>("Confessions");
  const [asAlias, setAsAlias] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: postingOpen = true } = useQuery({
    queryKey: ["posting-status"],
    enabled: open,
    staleTime: 15_000,
    queryFn: async () => (await supabase.rpc("posting_open")).data ?? true,
  });

  async function submit() {
    setBusy(true);
    try {
      await ensureSession();
      const { error } = await supabase.rpc("create_confession", {
        _body: body,
        _category: cat,
        _as_alias: asAlias && !!profile,
      });
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      toast.success(
        asAlias && profile ? `Dropped as @${profile.handle}` : "Dropped anonymously 🤫",
      );
      setBody("");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-auto bottom-0 max-h-[92dvh] w-full max-w-lg translate-y-0 overflow-y-auto overscroll-contain rounded-b-none rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:top-[50%] sm:bottom-auto sm:translate-y-[-50%] sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Drop a confession</DialogTitle>
          <DialogDescription className="sr-only">
            Share an anonymous confession, choose a category and post it to the feed.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={6}
          placeholder="Spill it. What happened in the library at 2am?"
          className="resize-none bg-background/50 text-base"
        />
        <div className="flex justify-end text-xs text-muted-foreground">
          <span>{body.length}/1000</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "min-h-9 rounded-full border px-3 py-1.5 text-sm transition",
                cat === c
                  ? "border-primary bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        {profile ? (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            <button
              onClick={() => setAsAlias(false)}
              className={cn(
                "min-h-10 truncate rounded-lg px-3 py-2 text-sm transition",
                !asAlias && "bg-card glow",
              )}
            >
              🕶️ Incognito
            </button>
            <button
              onClick={() => setAsAlias(true)}
              className={cn(
                "min-h-10 truncate rounded-lg px-3 py-2 text-sm transition",
                asAlias && "bg-card glow",
              )}
            >
              {profile.avatar} @{profile.handle}
            </button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {profile && asAlias
            ? "Earns karma, notifies followers, shows on your profile."
            : "Ghost mode — your alias stays off it. We keep limited private records to stop abuse."}
        </p>
        {!postingOpen && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Posting is paused by moderators. You can still vote and react.
          </p>
        )}
        <Button
          onClick={submit}
          disabled={busy || body.trim().length < 5 || !postingOpen}
          size="lg"
          className="glow"
        >
          {busy ? "Dropping…" : "Drop it"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
