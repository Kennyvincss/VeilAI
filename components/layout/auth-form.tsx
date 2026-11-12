"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, FlaskConical, Mail } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { api } from "@/hooks/use-api";
import { Button, buttonClass, Input, Label } from "@/components/ui/primitives";
import { Logo } from "@/components/ui/logo";

const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function AuthForm({ mode, googleEnabled, usernameLogin = false }: { mode: "login" | "signup"; googleEnabled: boolean; usernameLogin?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  // New accounts land on Account, which offers to create their name.near.
  const next = safeNext(params.get("next"), mode === "signup" ? "/dashboard/account?welcome=1" : "/dashboard");
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "Sign-in link was invalid or expired. Please try again." : null);
  const [sent, setSent] = useState(false);
  const [username, setUsername] = useState("");
  const [check, setCheck] = useState<{ for: string; available: boolean | null; problem: string | null } | null>(null);
  const uname = username.trim().replace(/^@/, "").toLowerCase();

  // Live availability check for the sign-up username.
  useEffect(() => {
    if (mode !== "signup" || uname.length < 3) return;
    const t = setTimeout(() => {
      api<{ available: boolean | null; problem: string | null }>(`/api/username/check?u=${encodeURIComponent(uname)}`)
        .then((r) => setCheck({ for: uname, ...r }))
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, [mode, uname]);
  const unameCheck = check && check.for === uname ? check : null;

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      if (mode === "login") {
        if (usernameLogin && !looksLikeEmail(email)) {
          await api("/api/auth/login", { method: "POST", json: { identifier: email, password } });
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (error) throw error;
        }
        toast.success("Signed in");
        router.replace(next);
        router.refresh();
      } else {
        if (!USERNAME_RE.test(uname)) throw new Error("Choose a username: 3–20 characters, lowercase letters, numbers and _.");
        if (unameCheck?.available === false) throw new Error(unameCheck.problem ?? "That username isn't available.");
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo(), data: { username: uname } } });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created");
          router.replace(next);
          router.refresh();
        } else setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <Link href="/" className="mb-10 inline-block" aria-label="VEIL AI home">
        <Logo />
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : "Create your free account"}</h1>
      <p className="mt-2 text-sm text-muted">
        {mode === "login" ? "Sign in to your confidential financial workspace." : "Free forever. No subscriptions, no paywalls, no seed phrases."}
      </p>

      {!supabase ? (
        <div className="mt-8 rounded-2xl border border-warning/30 bg-warning/[0.06] p-5 text-sm">
          <div className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="h-4 w-4" /> Accounts are temporarily unavailable
          </div>
          <p className="mt-2 leading-relaxed text-muted">Sign-in is not available right now. You can still explore every feature of VEIL AI with sample data.</p>
          <Link href="/demo" className={buttonClass("primary", "md", "mt-4 w-full")}>
            <FlaskConical className="h-4 w-4" /> Explore demo
          </Link>
        </div>
      ) : sent ? (
        <div className="mt-8 rounded-2xl border border-success/30 bg-success/[0.06] p-5 text-sm">
          <div className="flex items-center gap-2 font-medium text-success">
            <Mail className="h-4 w-4" /> Check your inbox
          </div>
          <p className="mt-2 text-muted">We sent a confirmation link to {email}. Open it on this device to finish creating your account.</p>
        </div>
      ) : (
        <>
          {googleEnabled && (
            <>
              <Button variant="secondary" size="lg" className="mt-8 w-full" onClick={google} disabled={loading}>
                <GoogleIcon /> Continue with Google
              </Button>
              <div className="my-6 flex items-center gap-3 text-xs text-subtle">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form onSubmit={onSubmit} className={googleEnabled ? "space-y-4" : "mt-8 space-y-4"} noValidate>
            {mode === "signup" && (
              <div>
                <Label htmlFor="username" hint="You can sign in with it, and get paid at @username">
                  Username
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">@</span>
                  <Input id="username" autoComplete="username" required maxLength={21} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="alice" spellCheck={false} className="pl-7" />
                </div>
                {uname.length >= 3 && unameCheck && unameCheck.available !== null && (
                  <p className={`mt-1 text-[0.72rem] ${unameCheck.available ? "text-success" : "text-warning"}`}>{unameCheck.available ? `@${uname} is available` : unameCheck.problem}</p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="email">{mode === "login" && usernameLogin ? "Email or username" : "Email"}</Label>
              <Input
                id="email"
                type={mode === "login" && usernameLogin ? "text" : "email"}
                autoComplete={mode === "login" && usernameLogin ? "username" : "email"}
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "login" && usernameLogin ? "you@example.com or @username" : "you@example.com"}
              />
            </div>
            <div>
              <Label htmlFor="password" hint={mode === "signup" ? "Min. 8 characters" : undefined}>
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {mode === "login" ? "Sign in" : "Create account"} <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "New to VEIL AI? " : "Already have an account? "}
            <Link href={mode === "login" ? "/signup" : "/login"} className="font-medium text-accent-strong hover:underline">
              {mode === "login" ? "Create an account" : "Sign in"}
            </Link>
          </p>
          <div className="mt-8 rounded-xl border border-border bg-card/60 p-4 text-center">
            <p className="text-xs text-muted">Just looking? Explore a limited demo with sample data — no account needed.</p>
            <Link href="/demo" className={buttonClass("ghost", "sm", "mt-2")}>
              <FlaskConical className="h-3.5 w-3.5" /> Explore demo
            </Link>
          </div>
        </>
      )}
      <p className="mt-8 text-center text-[0.7rem] leading-relaxed text-subtle">VEIL AI will never ask for your seed phrase or private keys.</p>
    </div>
  );
}

function safeNext(next: string | null, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
