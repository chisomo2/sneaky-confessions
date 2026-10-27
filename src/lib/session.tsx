import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Profile = { id: string; handle: string; avatar: string; bio: string; status: string };
type Ctx = {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  isAnonymous: boolean;
  ready: boolean;
  ensureSession: () => Promise<User>;
};
const SessionCtx = createContext<Ctx>({
  user: null,
  profile: null,
  isAdmin: false,
  isAnonymous: false,
  ready: false,
  ensureSession: async () => {
    throw new Error("Session not ready");
  },
});

let guestSession: Promise<User> | null = null;

const SESSION_QUERY_KEYS = [["me"], ["feed"], ["unread"], ["notifications"], ["profile"]] as const;

async function createGuestSession(): Promise<User> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user;
  if (!guestSession) {
    guestSession = supabase.auth
      .signInAnonymously()
      .then(({ data, error }) => {
        if (error) {
          if (/anonymous.*(disabled|not allowed)/i.test(error.message)) {
            throw new Error("Guest posting is unavailable right now — get an alias to continue.");
          }
          throw error;
        }
        if (!data.user) throw new Error("Could not start a guest session");
        return data.user;
      })
      .finally(() => {
        guestSession = null;
      });
  }
  return guestSession;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        for (const queryKey of SESSION_QUERY_KEYS) qc.invalidateQueries({ queryKey });
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const isAnonymous = !!user?.is_anonymous;

  const { data } = useQuery({
    queryKey: ["me", user?.id],
    enabled: !!user && !isAnonymous,
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,handle,avatar,bio,status")
          .eq("id", user!.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
      ]);
      return { profile, isAdmin: !!roles?.some((r) => r.role === "admin") };
    },
  });

  const ensureSession = useCallback(() => createGuestSession(), []);

  return (
    <SessionCtx.Provider
      value={{
        user,
        ready,
        isAnonymous,
        profile: user && !isAnonymous ? (data?.profile ?? null) : null,
        isAdmin: !!user && !isAnonymous && !!data?.isAdmin,
        ensureSession,
      }}
    >
      {children}
    </SessionCtx.Provider>
  );
}

export const useSession = () => useContext(SessionCtx);
