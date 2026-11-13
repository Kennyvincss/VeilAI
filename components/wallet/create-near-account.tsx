"use client";

import { useEffect, useMemo, useState } from "react";
import { base64 } from "@scure/base";
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Loader2, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/hooks/use-api";
import { Modal } from "@/components/ui/modal";
import { Button, Label } from "@/components/ui/primitives";
import { explorerTx } from "@/components/wallet/review-dialog";
import { notify } from "@/components/notifications/notification-center";
import { cn } from "@/lib/utils/format";
import { creationMessage, newAccountNameProblem } from "@/lib/username-rules";

/** GET /api/near-account */
export interface NearAccountOffer {
  enabled: boolean;
  signedIn: boolean;
  network: "mainnet" | "testnet";
  suffix: string;
  depositNear: string | null;
  account: { accountId: string; status: string } | null;
}

type Step = "preparing" | "name" | "phrase" | "confirm" | "creating" | "done";

interface Generated {
  seedPhrase: string;
  publicKey: string;
  sign: (bytes: Uint8Array) => Uint8Array;
}

/** Friendly input: lowercase, no spaces, and drop a typed ".near"/".testnet" suffix. */
export function normalizeNameInput(raw: string, suffix: string): string {
  return raw.toLowerCase().replace(/\s+/g, "").replace(new RegExp(`\\.${suffix}$`), "").slice(0, 20);
}

/** Pick three distinct word positions and four choices for each (from the phrase itself). */
function makeQuiz(words: string[]) {
  const positions = [...words.keys()].sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => a - b);
  return positions.map((i) => {
    const others = [...new Set(words.filter((w) => w !== words[i]))].sort(() => Math.random() - 0.5).slice(0, 3);
    return { index: i, choices: [words[i], ...others].sort(() => Math.random() - 0.5) };
  });
}

const WALLETS = {
  mainnet: [
    { name: "Meteor Wallet", url: "https://wallet.meteorwallet.app" },
    { name: "MyNearWallet", url: "https://app.mynearwallet.com" },
  ],
  testnet: [{ name: "MyNearWallet (testnet)", url: "https://testnet.mynearwallet.com" }],
};

/**
 * Creates a real NEAR account (name.near) for a signed-in user.
 * The key pair and 12-word recovery phrase are generated HERE, in the
 * browser, and kept only in memory; VEIL's server receives the public key
 * and a signature proving the browser holds the private key.
 */
export function CreateNearAccount({
  open,
  onClose,
  suffix,
  depositNear,
  network,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  suffix: string;
  depositNear: string | null;
  network: "mainnet" | "testnet";
  onCreated: (accountId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  // Remounting the setup on close wipes the key and phrase from memory.
  const close = () => {
    if (busy) return;
    setRound((r) => r + 1);
    onClose();
  };
  return (
    <Modal open={open} onClose={close} wide dismissible={!busy} title={`Create your .${suffix} account`} description="A real NEAR account that works in every NEAR wallet. Free — VEIL AI pays the small creation deposit.">
      <NearAccountSetup key={round} suffix={suffix} depositNear={depositNear} network={network} onCreated={onCreated} onDone={close} onBusyChange={setBusy} />
    </Modal>
  );
}

/** The create-name.near steps, usable inline (sign-up) or inside a dialog. */
export function NearAccountSetup({
  suffix,
  depositNear,
  network,
  onCreated,
  onDone,
  onBusyChange,
  initialName = "",
  doneLabel = "Done",
  skipNameStep = false,
}: {
  suffix: string;
  depositNear: string | null;
  network: "mainnet" | "testnet";
  onCreated: (accountId: string) => void;
  onDone: () => void;
  onBusyChange?: (busy: boolean) => void;
  initialName?: string;
  doneLabel?: string;
  /** The name was already chosen (e.g. at sign-up): go straight to the recovery words. */
  skipNameStep?: boolean;
}) {
  const autoStart = skipNameStep && !newAccountNameProblem(initialName);
  const [step, setStep] = useState<Step>(autoStart ? "preparing" : "name");
  const [name, setName] = useState(initialName);
  const [check, setCheck] = useState<{ for: string; available: boolean; problem: string | null } | null>(null);
  const [gen, setGen] = useState<Generated | null>(null);
  const [wroteDown, setWroteDown] = useState(false);
  const [quiz, setQuiz] = useState<{ index: number; choices: string[] }[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ accountId: string; txHash: string | null } | null>(null);

  const clean = name.trim().toLowerCase();
  const localProblem = clean.length >= 3 ? newAccountNameProblem(clean) : null;
  const words = useMemo(() => gen?.seedPhrase.split(" ") ?? [], [gen]);

  useEffect(() => {
    if (step !== "name" || clean.length < 3 || localProblem) return;
    const t = setTimeout(() => {
      api<{ available: boolean; problem: string | null }>(`/api/near-account/check?name=${encodeURIComponent(clean)}`)
        .then((r) => setCheck({ for: clean, ...r }))
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [clean, step, localProblem]);
  const shown = check && check.for === clean ? check : null;

  useEffect(() => {
    onBusyChange?.(step === "creating");
  }, [step, onBusyChange]);

  // Name already chosen: create the key and phrase right away.
  useEffect(() => {
    if (!autoStart) return;
    let cancelled = false;
    import("near-api-js/seed-phrase").then(({ generateSeedPhrase }) => {
      if (cancelled) return;
      const { seedPhrase, keyPair } = generateSeedPhrase();
      setGen({ seedPhrase, publicKey: keyPair.getPublicKey().toString(), sign: (b) => keyPair.sign(b).signature });
      setStep("phrase");
    });
    return () => {
      cancelled = true;
    };
  }, [autoStart]);

  async function generate() {
    setError(null);
    const { generateSeedPhrase } = await import("near-api-js/seed-phrase");
    const { seedPhrase, keyPair } = generateSeedPhrase();
    setGen({ seedPhrase, publicKey: keyPair.getPublicKey().toString(), sign: (b) => keyPair.sign(b).signature });
    setStep("phrase");
  }

  async function create() {
    if (!gen) return;
    setStep("creating");
    setError(null);
    const accountId = `${clean}.${suffix}`;
    try {
      const signature = base64.encode(gen.sign(new TextEncoder().encode(creationMessage(accountId, gen.publicKey))));
      const r = await api<{ accountId: string; txHash: string | null }>("/api/near-account/create", { method: "POST", json: { name: clean, publicKey: gen.publicKey, signature } });
      setResult(r);
      setGen(null); // the key is no longer needed here: the user has the phrase
      setStep("done");
      notify({ id: `created:${r.accountId}`, kind: "info", title: `${r.accountId} is yours`, body: "Import your 12 words into any NEAR wallet to use it.", href: "/dashboard/wallet" });
      onCreated(r.accountId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The account couldn't be created.";
      setError(message);
      // Name taken in the meantime: let them pick another (a new key is made for it).
      if (/taken/i.test(message)) {
        setGen(null);
        setStep("name");
      } else setStep("confirm");
    }
  }

  const quizDone = quiz.length > 0 && quiz.every((q) => answers[q.index] === words[q.index]);

  return (
    <div>
      {step === "preparing" && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Creating your recovery words…
        </p>
      )}

      {step === "name" && (
        <div>
          {error && (
            <p role="alert" className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              {error} Choose another name.
            </p>
          )}
          <Label htmlFor="new-name">Choose your name</Label>
          <div className="flex items-stretch overflow-hidden rounded-xl border border-border-strong bg-bg-2 focus-within:border-accent/50">
            <input
              id="new-name"
              value={name}
              onChange={(e) => setName(normalizeNameInput(e.target.value, suffix))}
              maxLength={20}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              placeholder="alice" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-text placeholder:text-subtle focus:outline-none" />
            <span className="flex items-center border-l border-border px-3 font-mono text-sm text-muted">.{suffix}</span>
          </div>
          <p className={cn("mt-1.5 min-h-4 text-[0.72rem]", localProblem || shown?.available === false ? "text-warning" : "text-success")}>
            {localProblem ?? (shown ? (shown.available ? `${clean}.${suffix} is available` : shown.problem) : "")}
          </p>
          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted">
            <li className="flex gap-2"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-strong" /> Your browser creates the key and a 12-word recovery phrase. VEIL AI never sees or stores them.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-strong" /> Only the account name is saved to your VEIL profile.</li>
            {depositNear && <li className="flex gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-strong" /> VEIL AI adds {depositNear} NEAR so the account can exist on-chain{network === "testnet" ? " (test NEAR)" : ""}.</li>}
          </ul>
          <Button className="mt-5 w-full" onClick={generate} disabled={!shown?.available || Boolean(localProblem)}>
            Continue
          </Button>
        </div>
      )}

      {step === "phrase" && gen && (
        <div>
          <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] p-3.5 text-sm text-warning/90">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p>
              <strong className="font-semibold text-warning">Write these 12 words on paper, in order.</strong> They are the only way to use or recover {clean}.{suffix}. Anyone with them controls your money. VEIL AI can&apos;t show them again and will never ask for them.
            </p>
          </div>
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Recovery phrase">
            {words.map((w, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm">
                <span className="w-5 text-right text-[0.7rem] text-subtle">{i + 1}</span> {w}
              </li>
            ))}
          </ol>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" checked={wroteDown} onChange={(e) => setWroteDown(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
            <span className="text-muted">I wrote down all 12 words and stored them somewhere safe and offline. No screenshots.</span>
          </label>
          <Button
            className="mt-4 w-full"
            disabled={!wroteDown}
            onClick={() => {
              setQuiz(makeQuiz(words));
              setAnswers({});
              setStep("confirm");
            }}
          >
            <PenLine className="h-4 w-4" /> I&apos;ve written it down
          </Button>
        </div>
      )}

      {(step === "confirm" || step === "creating") && gen && (
        <div>
          <p className="text-sm text-muted">Check your paper copy: pick each word.</p>
          <div className="mt-4 space-y-4">
            {quiz.map((q) => (
              <div key={q.index}>
                <div className="mb-1.5 text-xs font-medium">Word #{q.index + 1}</div>
                <div className="flex flex-wrap gap-2">
                  {q.choices.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={step === "creating"}
                      onClick={() => setAnswers((a) => ({ ...a, [q.index]: c }))}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 font-mono text-sm transition-colors",
                        answers[q.index] === c ? (c === words[q.index] ? "border-success/50 bg-success/10 text-success" : "border-danger/50 bg-danger/10 text-danger") : "border-border bg-bg-2 text-muted hover:text-text",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" onClick={() => setStep("phrase")} disabled={step === "creating"}>
              Show words again
            </Button>
            <Button className="flex-1" onClick={create} disabled={!quizDone} loading={step === "creating"}>
              {step === "creating" ? `Creating ${clean}.${suffix}…` : `Create ${clean}.${suffix}`}
            </Button>
          </div>
          {step === "creating" && (
            <p className="mt-3 flex items-center gap-2 text-xs text-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Registering on the NEAR network. This takes a few seconds.
            </p>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <p className="mt-3 font-mono text-lg font-semibold">{result.accountId}</p>
          <p className="mt-1 text-sm text-muted">is yours, on the NEAR {network} network.</p>
          {result.txHash && (
            <a href={explorerTx(result.txHash, network)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-accent-strong hover:underline">
              View on explorer <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-left">
            <p className="text-sm font-semibold">Next: open it in any NEAR wallet</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Open a wallet app and choose <strong className="text-text">Import</strong> (or &ldquo;Recover&rdquo;).</li>
              <li>Type your 12 words <em>inside the wallet app</em>.</li>
              <li>Come back and press <strong className="text-text">Connect wallet</strong>.</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              {WALLETS[network].map((w) => (
                <a key={w.name} href={w.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-2 px-2.5 py-1.5 text-xs text-muted hover:text-text">
                  {w.name} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
          <Button className="mt-6" onClick={onDone}>
            {doneLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
