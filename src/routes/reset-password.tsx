import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/lib/app";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password · DMI Confessions" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Choose a new password for your DMI Confessions alias." },
      { property: "og:title", content: "Reset password · DMI Confessions" },
      {
        property: "og:description",
        content: "Choose a new password for your DMI Confessions alias.",
      },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      // A guest alias has no email/password yet — it must claim one on /auth.
      setHasSession(!!data.session && data.session.user.is_anonymous !== true);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session && session.user.is_anonymous !== true);
      setChecking(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/", replace: true });
  }

  if (checking)
    return <div className="mx-auto mt-10 h-40 max-w-sm animate-pulse rounded-2xl bg-card" />;

  if (!hasSession)
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <div className="text-5xl">🔗</div>
        <h1 className="mt-3 text-2xl font-bold">Link expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Request a fresh reset link from the sign-in page.
        </p>
        <Button asChild className="mt-5">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-3xl font-extrabold">New password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Use at least 6 characters. Your alias stays the same.
      </p>
      <form onSubmit={save} className="space-y-3">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          minLength={6}
          required
          autoComplete="new-password"
        />
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          minLength={6}
          required
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full glow" disabled={busy}>
          {busy ? "…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
