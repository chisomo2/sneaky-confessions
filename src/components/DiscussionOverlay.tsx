import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CommentThread } from "@/components/CommentThread";
import { DiscussionContext } from "@/lib/discussion";
import { supabase } from "@/integrations/supabase/client";

export function DiscussionProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const post = useQuery({
    queryKey: ["discussion-preview", id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("confessions")
        .select("body")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <DiscussionContext.Provider value={setId}>
      {children}
      <Dialog
        open={!!id}
        onOpenChange={(open) => {
          if (!open) setId(null);
        }}
      >
        <DialogContent className="top-auto bottom-0 flex h-[88dvh] max-h-[88dvh] w-full max-w-2xl translate-y-0 flex-col gap-0 rounded-t-lg p-0 sm:top-1/2 sm:bottom-auto sm:h-[80dvh] sm:translate-y-[-50%] sm:rounded-lg">
          <header className="shrink-0 border-b px-4 py-5 pr-12 sm:px-6">
            <DialogTitle>Comments</DialogTitle>
            <DialogDescription className="sr-only">Discussion on this confession</DialogDescription>
            {post.data && (
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {post.data.body}
              </p>
            )}
          </header>
          {post.isPending ? (
            <div className="m-4 h-24 animate-pulse rounded-lg bg-muted" />
          ) : post.isError ? (
            <div className="p-4 text-sm text-destructive">
              Couldn't load this confession.{" "}
              <Button variant="link" onClick={() => post.refetch()}>
                Try again
              </Button>
            </div>
          ) : !post.data ? (
            <p className="p-4 text-sm text-muted-foreground">
              This confession is no longer available.
            </p>
          ) : (
            id && <CommentThread key={id} id={id} />
          )}
        </DialogContent>
      </Dialog>
    </DiscussionContext.Provider>
  );
}
