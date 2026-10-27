import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/app";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const REASONS = ["Hate speech", "Doxxing", "Harassment", "Spam", "Other"] as const;

export function ReportDialog({
  type,
  id,
  open,
  onOpenChange,
}: {
  type: "confession" | "comment";
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { ensureSession } = useSession();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason) {
      toast.error("Pick a reason first");
      return;
    }
    const text = details.trim() ? `${reason}: ${details.trim()}` : reason;
    setBusy(true);
    try {
      await ensureSession();
      const { error } = await supabase.rpc("report_content", {
        _type: type,
        _id: id,
        _reason: text,
      });
      if (error) throw error;
      toast.success("Reported. Mods will take a look.");
      onOpenChange(false);
      setReason("");
      setDetails("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-auto bottom-0 w-full max-w-md translate-y-0 rounded-b-none rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:top-[50%] sm:bottom-auto sm:translate-y-[-50%] sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Report this {type}</DialogTitle>
          <DialogDescription>
            Reports are anonymous. Moderators review everything flagged.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className={cn(
                "min-h-10 rounded-full border px-3 py-1.5 text-sm transition",
                reason === r ? "border-primary bg-primary/15" : "bg-muted",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Anything else mods should know? (optional)"
          aria-label="Report details"
          className="mt-3 w-full resize-none rounded-xl border bg-muted/40 p-3 text-base outline-none focus:border-primary"
        />
        <Button onClick={submit} disabled={busy || !reason} className="mt-3 w-full rounded-full">
          {busy ? "Sending…" : "Send report"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
