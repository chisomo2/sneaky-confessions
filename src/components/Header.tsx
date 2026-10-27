import { Suspense, lazy, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Moon, Plus, Search, Shield, Sun, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { MobileNav } from "./MobileNav";

const DropDialog = lazy(() => import("./DropDialog").then((m) => ({ default: m.DropDialog })));

export function Header() {
  const { profile, isAdmin } = useSession();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: unread = 0 } = useQuery({
    queryKey: ["unread", profile?.id],
    enabled: !!profile,
    refetchInterval: 120_000,
    queryFn: async () =>
      (
        await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("read", false)
      ).count ?? 0,
  });

  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`notifications:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profileId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["unread", profileId] });
          qc.invalidateQueries({ queryKey: ["notifications", profileId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    setSearchOpen(false);
    navigate({ to: "/", search: { tab: "latest", q: q || undefined } });
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:gap-3">
          <Link
            to="/"
            className="shrink-0 font-display text-lg font-extrabold tracking-tight sm:text-xl"
          >
            <span className="neon-text">Sneaky</span> Confessions
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="rounded-full p-2.5 text-muted-foreground transition hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <form onSubmit={submitSearch} className="relative hidden w-56 lg:block xl:w-72">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the tea…"
                className="w-full rounded-full border bg-muted/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </form>
            <button
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={searchOpen ? "Close search" : "Search"}
              aria-expanded={searchOpen}
              className="rounded-full p-2.5 text-muted-foreground hover:text-foreground lg:hidden"
            >
              {searchOpen ? <X className="size-5" /> : <Search className="size-5" />}
            </button>
            {isAdmin && (
              <Link
                to="/admin"
                aria-label="Admin"
                className="rounded-full p-2.5 text-muted-foreground hover:text-foreground md:hidden"
              >
                <Shield className="size-5" />
              </Link>
            )}
            <nav className="hidden items-center gap-1 md:flex">
              <Link
                to="/leaderboard"
                aria-label="Leaderboard"
                className="rounded-full p-2 text-muted-foreground hover:text-foreground"
              >
                <Trophy className="size-5" />
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  aria-label="Admin"
                  className="rounded-full p-2 text-muted-foreground hover:text-foreground"
                >
                  <Shield className="size-5" />
                </Link>
              )}
              {profile && (
                <Link
                  to="/notifications"
                  aria-label="Notifications"
                  className="relative rounded-full p-2 text-muted-foreground hover:text-foreground"
                >
                  <Bell className="size-5" />
                  {unread > 0 && (
                    <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
              )}
              {profile ? (
                <>
                  <Link
                    to="/u/$handle"
                    params={{ handle: profile.handle }}
                    aria-label={`@${profile.handle}`}
                    className="rounded-full bg-muted px-2 py-1.5 text-sm sm:px-3"
                  >
                    {profile.avatar} <span className="hidden lg:inline">@{profile.handle}</span>
                  </Link>
                  <button
                    onClick={signOut}
                    aria-label="Sign out"
                    className="rounded-full p-2 text-muted-foreground hover:text-foreground lg:hidden"
                  >
                    <LogOut className="size-5" />
                  </button>
                  <button
                    onClick={signOut}
                    className="hidden px-2 text-xs text-muted-foreground hover:text-foreground lg:block"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  Get an alias
                </Link>
              )}
              <Button
                onClick={() => setOpen(true)}
                size="sm"
                className="ml-1 hidden rounded-full glow md:inline-flex"
              >
                <Plus className="size-4" /> Drop
              </Button>
            </nav>
          </div>
        </div>
        {searchOpen && (
          <form onSubmit={submitSearch} className="mx-auto max-w-5xl px-4 pb-3 lg:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the tea…"
                className="min-h-10 w-full rounded-full border bg-muted/60 py-2 pl-9 pr-3 text-base outline-none focus:border-primary"
              />
            </div>
          </form>
        )}
      </header>
      <MobileNav unread={unread} onDrop={() => setOpen(true)} />
      {open && (
        <Suspense fallback={null}>
          <DropDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
