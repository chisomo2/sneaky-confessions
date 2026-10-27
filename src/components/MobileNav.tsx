import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Home, Plus, Trophy, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type MenuPath = "/" | "/leaderboard" | "/notifications" | "/auth";

export function MobileNav({ unread, onDrop }: { unread: number; onDrop: () => void }) {
  const { profile } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPath = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  const onProfile = !!profile && pathname === `/u/${profile.handle}`;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-2">
        <BarLink to="/" icon={Home} label="Feed" active={pathname === "/"} />
        <BarLink to="/leaderboard" icon={Trophy} label="Board" active={isPath("/leaderboard")} />
        <button
          type="button"
          onClick={onDrop}
          aria-label="Drop a confession"
          className="group flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-primary"
        >
          <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_-6px_var(--color-neon)] transition group-active:scale-95">
            <Plus className="size-5" strokeWidth={2.6} />
          </span>
          <span>Drop</span>
        </button>
        <BarLink
          to="/notifications"
          icon={Bell}
          label="Alerts"
          active={isPath("/notifications")}
          badge={unread}
        />
        {profile ? (
          <Link
            to="/u/$handle"
            params={{ handle: profile.handle }}
            aria-current={onProfile ? "page" : undefined}
            className={barLinkClass(onProfile)}
          >
            <BarContent icon={UserRound} label="Profile" active={onProfile} />
          </Link>
        ) : (
          <BarLink to="/auth" icon={UserRound} label="Alias" active={isPath("/auth")} />
        )}
      </div>
    </nav>
  );
}

function barLinkClass(active: boolean) {
  return cn(
    "relative flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition",
    active ? "text-primary" : "text-muted-foreground",
  );
}

function BarLink({
  to,
  icon,
  label,
  active,
  badge,
}: {
  to: MenuPath;
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link to={to} aria-current={active ? "page" : undefined} className={barLinkClass(active)}>
      <BarContent icon={icon} label={label} active={active} badge={badge} />
    </Link>
  );
}

function BarContent({
  icon: Icon,
  label,
  active,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number | undefined;
}) {
  return (
    <>
      <span className="relative">
        <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
        {!!badge && badge > 0 && (
          <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
      {active && <span className="absolute top-1 h-0.5 w-5 rounded-full bg-primary" />}
    </>
  );
}
