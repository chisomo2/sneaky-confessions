import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AVATARS, errMsg } from "@/lib/app";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Get your alias · DMI Confessions" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Claim an anonymous alias, earn karma and build campus clout.",
      },
      { property: "og:title", content: "Claim your alias on DMI Confessions" },
      { property: "og:description", content: "Stay anonymous, earn clout." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, isAnonymous } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [avatar, setAvatar] = useState("👻");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user && !isAnonymous) navigate({ to: "/" });
  }, [user, isAnonymous, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "up") {
      const clean = handle.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (clean.length < 3) {
        setBusy(false);
        toast.error("Alias needs 3+ letters/numbers");
        return;
      }
      const profileMeta = { handle: clean, avatar };

      // Convert the guest identity in place so its votes and replies survive.
      if (isAnonymous) {
        const { data, error } = await supabase.auth.updateUser(
          { email, password, data: profileMeta },
          { emailRedirectTo: window.location.origin },
        );
        setBusy(false);
        if (error) {
          toast.error(errMsg(error));
          return;
        }
        if (data.user && data.user.is_anonymous === false) {
          toast.success("Alias claimed — your guest history came with you");
          navigate({ to: "/", replace: true });
        } else {
          setSent(true);
        }
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin, data: profileMeta },
      });
      setBusy(false);
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      if (data.session) {
        toast.success(`Welcome, @${clean}`);
        navigate({ to: "/", replace: true });
        return;
      }
      setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        toast.error(errMsg(error));
        return;
      }
    }
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) toast.error(errMsg(error));
  }

  async function forgot() {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success("Reset link sent. Check your email.");
  }

  if (sent)
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <div className="text-5xl">📬</div>
        <h1 className="mt-3 text-2xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confirm your address to activate @{handle.toLowerCase()}.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-3xl font-extrabold">
        {mode === "up" ? "Claim your alias" : "Welcome back"}
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Your email stays private. Only your alias is ever shown.
      </p>
      <form onSubmit={submit} className="space-y-3">
        {mode === "up" && (
          <>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@CampusPhantom"
              required
            />
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => setAvatar(a)}
                  aria-pressed={avatar === a}
                  aria-label={`Avatar ${a}`}
                  className={cn(
                    "grid size-11 place-items-center rounded-xl bg-muted text-xl",
                    avatar === a && "ring-2 ring-primary",
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </>
        )}
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          minLength={6}
          required
        />
        {mode === "in" && (
          <button
            type="button"
            onClick={forgot}
            className="block w-full text-right text-xs text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </button>
        )}
        <Button type="submit" className="w-full glow" disabled={busy}>
          {busy ? "…" : mode === "up" ? "Create alias" : "Sign in"}
        </Button>
      </form>
      <Button variant="secondary" className="mt-3 w-full" onClick={google}>
        Continue with Google
      </Button>
      <button
        onClick={() => setMode(mode === "up" ? "in" : "up")}
        className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
      >
        {mode === "up" ? "Already have an alias? Sign in" : "New here? Claim an alias"}
      </button>
    </div>
  );
}
