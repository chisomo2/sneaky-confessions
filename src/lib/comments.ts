import { useEffect, useId, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Comment = {
  id: string;
  body: string;
  anon_name: string | null;
  created_at: string;
  author_id: string | null;
  parent_id: string | null;
  author: { handle: string; avatar: string } | null;
};

const PAGE_SIZE = 30;
const COMMENT_COLUMNS =
  "id,body,anon_name,created_at,author_id,parent_id,author:profiles(handle,avatar)";

export function useComments(id: string) {
  const qc = useQueryClient();
  // The inline preview and the discussion sheet can watch the same post at once;
  // a shared topic would make Supabase reuse the already-subscribed channel.
  const topic = `discussion-${id}-${useId().replace(/:/g, "")}`;
  const roots = useInfiniteQuery({
    queryKey: ["comments", id],
    initialPageParam: 0,
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from("comments")
        .select(COMMENT_COLUMNS)
        .eq("confession_id", id)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
  });
  const rootIds = useMemo(
    () => roots.data?.pages.flatMap((page) => page.map((c) => c.id)) ?? [],
    [roots.data],
  );
  const replies = useQuery({
    queryKey: ["comments", id, "replies", rootIds.join(",")],
    enabled: rootIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select(COMMENT_COLUMNS)
        .in("parent_id", rootIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  });
  const repliesByParent = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const reply of replies.data ?? []) {
      if (!reply.parent_id) continue;
      const list = map.get(reply.parent_id);
      if (list) list.push(reply);
      else map.set(reply.parent_id, [reply]);
    }
    return map;
  }, [replies.data]);
  useEffect(() => {
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `confession_id=eq.${id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["comments", id] });
          qc.invalidateQueries({ queryKey: ["confession", id] });
          qc.invalidateQueries({ queryKey: ["feed"] });
          qc.invalidateQueries({ queryKey: ["profile"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc, topic]);
  return { roots, repliesByParent };
}
