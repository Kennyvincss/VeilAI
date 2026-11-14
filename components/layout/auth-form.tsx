"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { api } from "@/hooks/use-api";
import { Button, buttonClass, Input, Label } from "@/components/ui/primitives";
import { Logo } from "@/components/ui/logo";
import { NearAccountSetup, normalizeNameInput } from "@/components/wallet/create-near-account";
import { newAccountNameProblem } from "@/lib/username-rules";
import { cn } from "@/lib/utils/format";

export interface NearSignup {
  enabled: boolean;
  suffix: string;
  depositNear: string | null;
  network: "mainnet" | "testnet";
}

type Step = "form" | "code" | "wallet" | "done";
const RESEND_SECONDS = 60;

/**
 * Sign in / sign up.
 *
 * Sign-up: email + password (+ the name.near to create) → a 6-digit code is
 * emailed → the user types it here (no link to click) → if free accounts are
 * on, they create their NEAR account right away → done.
 */
export function AuthForm({ mode, googleEnabled, nearSignup = null }: { mode: "login" | "signup"; googleEnabled: boolean; nearSignup?: NearSignup | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const supabase = getSupabaseBrowserClient();
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nearName, setNearName] = useState("");
  const [nameCheck, setNameCheck] = useState<{ for: string; available: boolean; problem: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "That sign-in link was invalid or expired. Please sign in again." : null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<string | null>(null);

  const wantsNear = mode === "signup" && Boolean(nearSignup?.enabled);
  const nameProblem = wantsNear && nearName.length >= 3 ? newAccountNameProblem(nearName) : null;
  const shownName = nameCheck && nameCheck.for === nearName ? nameCheck : null;

  // Live availability of name.near at sign-up.
  useEffect(() => {
    if (!wantsNear || nearName.length < 3 || nameProblem) return;
    const t = setTimeout(() => {
      api<{ available: boolean; problem: string | null }>(`/api/near-account/check?name=${encodeURIComponent(nearName)}`)
        .then((r) => setNameCheck({ for: nearName, ...r }))
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [wantsNear, nearName, nameProblem]);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // If the email contains a link instead of a code, the link signs them in and
  // new accounts land on Account, where they can create their name.near.
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(mode === "signup" && !params.get("next") ? "/dashboard/account" : next)}`;

  function afterVerified() {
    setSignedIn(true);
    setStep(mode === "signup" && wantsNear ? "wallet" : "done");
  }

  function goToApp() {
    router.replace(next);
    router.refresh();
  }

  async function sendCode() {
    if (!supabase) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    if (error) throw error;
    setResendIn(RESEND_SECONDS);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setInfo(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          if (/not confirmed/i.test(error.message)) {
            await sendCode();
            setInfo("Your email isn't verified yet. We've sent you a new code.");
            setStep("code");
            return;
          }
          throw error;
        }
        toast.success("Signed in");
        goToApp();
        return;
      }

      if (wantsNear) {
        if (newAccountNameProblem(nearName)) throw new Error(newAccountNameProblem(nearName) ?? "Choose a name for your NEAR account.");
        if (shownName?.available === false) throw new Error(shownName.problem ?? "That name is taken. Choose another.");
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo(), data: wantsNear ? { near_name: nearName } : undefined },
      });
      if (error) throw error;
      // Supabase returns a user with no identities when the email is already registered.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error("An account with this email already exists. Please sign in instead.");
      }
      if (data.session) return afterVerified(); // email confirmation is switched off
      setResendIn(RESEND_SECONDS);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const token = code.replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(token)) return setError("Enter the code from the email (numbers only).");
    setLoading(true);
    setError(null);
    try {
      let { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
      if (error) ({ data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "signup" }));
      if (error) throw new Error(/expired/i.test(error.message) ? "That code has expired. Send a new one below." : "That code isn't right. Check the email and try again.");
      if (!data.session) {
        setStep("done");
        return;
      }
      toast.success("Email verified");
      afterVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed. Please try again.");
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

  const heading =
    step === "code" ? "Check your email" : step === "wallet" ? "Create your NEAR account" : step === "done" ? "You're all set" : mode === "login" ? "Welcome back" : "Create your free account";
  const sub =
    step === "code"
      ? `We sent an email to ${email}. Enter the code from it below — or, if the email has a confirm button instead, just tap it.`
      : step === "wallet"
        ? `Last step: save the recovery words for ${nearName}.${nearSignup?.suffix ?? "near"}.`
        : step === "done"
          ? signedIn
            ? "Your email is verified and you're signed in."
            : "Your email is verified. Sign in to continue."
          : mode === "login"
            ? "Sign in to your confidential financial workspace."
            : "Free forever. No subscriptions, no paywalls.";

  return (
    <div className="w-full max-w-md">
      <Link href="/" className="mb-10 inline-block" aria-label="VEIL AI home">
        <Logo />
      </Link>
      <h1 className="text-[1.7rem] font-bold tracking-tight text-text">{heading}</h1>
      <p className="mt-2 break-words text-[0.95rem] text-text/75">{sub}</p>

      {!supabase ? (
        <div className="mt-8 rounded-2xl border border-warning/30 bg-warning/[0.06] p-5 text-sm">
          <div className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="h-4 w-4" /> Accounts are temporarily unavailable
          </div>
          <p className="mt-2 leading-relaxed text-text/80">Sign-in is not available right now. Please try again in a little while.</p>
        </div>
      ) : step === "code" ? (
        <form onSubmit={verifyCode} className="mt-8 space-y-4" noValidate>
          {info && <p className="rounded-lg border border-border bg-card-2 px-3 py-2 text-xs text-muted">{info}</p>}
          <div>
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 12))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="text-center font-mono text-xl tracking-[0.4em]"
              autoFocus
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={code.replace(/\s/g, "").length < 6}>
            <MailCheck className="h-4 w-4" /> Verify email
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <button
              type="button"
              disabled={resendIn > 0}
              onClick={() => sendCode().then(() => toast.success("New code sent")).catch((err) => setError(err instanceof Error ? err.message : "Couldn't send a new code."))}
              className="font-medium text-accent-strong hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setCode("");
                setError(null);
              }}
              className="hover:text-text"
            >
              Use a different email
            </button>
          </div>
          <p className="text-center text-xs text-subtle">
            Already verified?{" "}
            <Link href="/login" className="font-medium text-accent-strong hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      ) : step === "wallet" && nearSignup ? (
        <div className="mt-8">
          <NearAccountSetup
            suffix={nearSignup.suffix}
            depositNear={nearSignup.depositNear}
            network={nearSignup.network}
            initialName={nearName}
            skipNameStep
            onCreated={(id) => setCreatedAccount(id)}
            onDone={() => setStep("done")}
            doneLabel="Continue"
          />
          <button type="button" onClick={() => setStep("done")} className="mt-4 w-full text-center text-xs text-muted hover:text-text">
            Skip for now — I&apos;ll do it later in Account
          </button>
        </div>
      ) : step === "done" ? (
        <div className="mt-8 rounded-3xl border border-success/25 bg-success/[0.05] p-6 text-center">
          <CheckCircle2 className="mx-auto h-11 w-11 text-success" />
          <p className="mt-3 text-sm font-medium">Email verified</p>
          {createdAccount && <p className="mt-1 font-mono text-sm text-text">{createdAccount} is yours</p>}
          {signedIn ? (
            <Button size="lg" className="mt-6 w-full" onClick={goToApp}>
              Go to my dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Link href="/login" className={buttonClass("primary", "lg", "mt-6 w-full")}>
              Sign in <ArrowRight className="h-4 w-4" />
            </Link>
          )}
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
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
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
            {wantsNear && nearSignup && (
              <div>
                <Label htmlFor="near-name" hint="Your NEAR wallet name">
                  NEAR name
                </Label>
                <div className="flex items-stretch overflow-hidden rounded-xl border border-border-strong bg-white focus-within:border-border-strong focus-within:bg-card focus-within:ring-4 focus-within:ring-accent/20">
                  <input
                    id="near-name"
                    value={nearName}
                    onChange={(e) => setNearName(normalizeNameInput(e.target.value, nearSignup.suffix))}
                    maxLength={20}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="alice"
                    className="h-11 min-w-0 flex-1 bg-transparent px-3.5 font-mono text-sm text-text placeholder:text-subtle focus:outline-none"
                  />
                  <span className="flex items-center border-l border-border px-3 font-mono text-sm text-muted">.{nearSignup.suffix}</span>
                </div>
                <p className={cn("mt-1 min-h-4 text-[0.72rem]", nameProblem || shownName?.available === false ? "text-warning" : "text-success")}>
                  {nameProblem ?? (shownName ? (shownName.available ? `${nearName}.${nearSignup.suffix} is available` : shownName.problem) : "")}
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
                {/already exists/.test(error) && (
                  <>
                    {" "}
                    <Link href="/login" className="font-semibold underline">
                      Sign in
                    </Link>
                  </>
                )}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={loading} disabled={wantsNear && (Boolean(nameProblem) || nearName.length < 3 || shownName?.available === false)}>
              {mode === "login" ? "Sign in" : "Create account"} <ArrowRight className="h-4 w-4" />
            </Button>
            {mode === "signup" && <p className="text-center text-xs text-muted">We&apos;ll email you a 6-digit code to verify your address.</p>}
          </form>
          <p className="mt-6 text-center text-sm text-text/75">
            {mode === "login" ? "New to VEIL AI? " : "Already have an account? "}
            <Link href={mode === "login" ? "/signup" : "/login"} className="font-medium text-accent-strong hover:underline">
              {mode === "login" ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </>
      )}
      <p className="mt-8 text-center text-xs font-medium leading-relaxed text-muted">VEIL AI will never ask for your seed phrase or private keys.</p>
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
