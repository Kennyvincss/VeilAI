"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Eye, KeyRound, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { FinancialPreferences } from "@/types";
import { api, useApi } from "@/hooks/use-api";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { Badge, Button, Card, CardHeader, Input, Label, Skeleton, Toggle } from "@/components/ui/primitives";
import { looksLikeSecret } from "@/lib/near/account";
import { cn, formatDateTime } from "@/lib/utils/format";

const TIMEFRAMES = [
  ["short", "Short term", "< 1 year"],
  ["medium", "Medium term", "1–3 years"],
  ["long", "Long term", "3+ years"],
] as const;
const TOLERANCE = [
  ["conservative", "Conservative"],
  ["balanced", "Balanced"],
  ["aggressive", "Aggressive"],
] as const;

export default function MemoryPage() {
  const { status } = useAppStatus();
  const signedIn = status.session.signedIn;
  const { data, loading, reload } = useApi<{ preferences: FinancialPreferences; saved: boolean; persisted: boolean }>("/api/preferences");
  const [p, setP] = useState<FinancialPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise the editable copy once loaded
    if (data) setP(data.preferences);
  }, [data]);

  async function save() {
    if (!p) return;
    if (p.goals && looksLikeSecret(p.goals)) return toast.error("Goals must not contain secrets such as seed phrases.");
    setSaving(true);
    try {
      await api("/api/preferences", { method: "PUT", json: { ...p, updatedAt: undefined } });
      toast.success("Preferences saved");
      void reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function wipe() {
    if (!confirm("Delete all saved preferences? This cannot be undone.")) return;
    try {
      await api("/api/preferences", { method: "DELETE" });
      toast.success("All preferences deleted");
      void reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <>
      <PageHeader
        title="AI Memory"
        description="Private financial preferences the analyst can use to personalise insights. You decide what is saved, and you can inspect, edit or delete it at any time."
        badges={data?.saved ? <Badge tone="success">Saved</Badge> : <Badge tone="neutral">Nothing saved</Badge>}
      />

      {!signedIn && (
        <div className="mb-4 rounded-xl border border-warning/25 bg-warning/[0.06] px-4 py-3 text-xs text-warning">
          Demo mode: preferences cannot be saved. Create a free account to use AI memory.
        </div>
      )}

      {loading || !p ? (
        <Card>
          <Skeleton className="h-40" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader icon={<KeyRound className="h-4 w-4" />} title="Your preferences" subtitle="Nothing is saved until you press Save" />
            <fieldset disabled={!signedIn} className="space-y-6 disabled:opacity-60">
              <div>
                <div className="mb-2 text-xs font-medium text-muted">Investment timeframe</div>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Investment timeframe">
                  {TIMEFRAMES.map(([v, l, d]) => (
                    <Choice key={v} active={p.timeframe === v} onClick={() => setP({ ...p, timeframe: p.timeframe === v ? null : v })} label={l} sub={d} />
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted">Risk tolerance</div>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Risk tolerance">
                  {TOLERANCE.map(([v, l]) => (
                    <Choice key={v} active={p.riskTolerance === v} onClick={() => setP({ ...p, riskTolerance: p.riskTolerance === v ? null : v })} label={l} />
                  ))}
                </div>
              </div>
              <TagInput id="ecosystems" label="Preferred ecosystems" placeholder="e.g. NEAR, Aurora — press Enter" values={p.ecosystems} max={10} onChange={(ecosystems) => setP({ ...p, ecosystems })} />
              <TagInput id="watchlist" label="Assets to monitor" placeholder="e.g. NEAR, USDC — press Enter" values={p.watchlist} max={25} onChange={(watchlist) => setP({ ...p, watchlist })} />
              <div>
                <Label htmlFor="goals" hint={`${(p.goals ?? "").length}/600`}>
                  Personal financial goals
                </Label>
                <textarea
                  id="goals"
                  value={p.goals ?? ""}
                  maxLength={600}
                  onChange={(e) => setP({ ...p, goals: e.target.value || null })}
                  rows={4}
                  placeholder="e.g. Build a stablecoin buffer covering 6 months of expenses."
                  className="w-full rounded-xl border border-border-strong bg-bg-2 px-3.5 py-2.5 text-sm text-text placeholder:text-subtle focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
                <p className="mt-1 text-[0.68rem] text-subtle">Avoid personal identifiers. {status.dataEncryption.configured ? "Encrypted with AES-256-GCM before storage." : "Stored with Supabase encryption at rest."}</p>
              </div>
              <div className="space-y-4 rounded-xl border border-border p-4">
                <Toggle id="use-in-ai" checked={p.useInAi} onChange={(useInAi) => setP({ ...p, useInAi })} label="Use these preferences in AI analysis" description="When on, they are included (as data) in confidential inference requests." />
                <Toggle id="save-chat" checked={p.saveChatHistory} onChange={(saveChatHistory) => setP({ ...p, saveChatHistory })} label="Allow saving chat history" description="Master switch — when off, no conversation is ever stored." />
              </div>
            </fieldset>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={save} loading={saving} disabled={!signedIn}>
                <Save className="h-4 w-4" /> Save preferences
              </Button>
              <Button variant="danger" onClick={wipe} disabled={!signedIn || !data?.saved}>
                <Trash2 className="h-4 w-4" /> Delete all
              </Button>
            </div>
          </Card>

          <Card className="h-fit">
            <CardHeader icon={<Eye className="h-4 w-4" />} title="What the AI can see" subtitle={data?.saved ? `Last saved ${formatDateTime(data.preferences.updatedAt)}` : "Nothing saved yet"} />
            {data?.saved && data.preferences.useInAi ? (
              <pre className="max-h-96 overflow-auto rounded-lg bg-bg-2 p-3 font-mono text-[0.7rem] leading-relaxed text-muted">
                {JSON.stringify(
                  {
                    timeframe: data.preferences.timeframe,
                    riskTolerance: data.preferences.riskTolerance,
                    ecosystems: data.preferences.ecosystems,
                    watchlist: data.preferences.watchlist,
                    goals: data.preferences.goals,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : (
              <p className="text-xs leading-relaxed text-muted">The analyst currently receives no preferences. Enable “Use these preferences in AI analysis” and save to share them.</p>
            )}
            <p className="mt-3 text-[0.68rem] leading-relaxed text-subtle">This is the exact object added to the model context. VEIL AI never silently stores information from your chats into memory.</p>
          </Card>
        </div>
      )}
    </>
  );
}

function Choice({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn("rounded-xl border px-3 py-2.5 text-left text-sm transition-all", active ? "border-accent/50 bg-accent/[0.08] text-text" : "border-border text-muted hover:border-border-strong")}>
      {label}
      {sub && <div className="text-[0.68rem] text-subtle">{sub}</div>}
    </button>
  );
}

function TagInput({ id, label, placeholder, values, max, onChange }: { id: string; label: string; placeholder: string; values: string[]; max: number; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const v = draft.trim().slice(0, 32);
    if (!v || values.includes(v) || values.length >= max) return;
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <div>
      <Label htmlFor={id} hint={`${values.length}/${max}`}>
        {label}
      </Label>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border-strong bg-bg-2 p-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-accent/12 px-2 py-1 text-xs text-accent-strong">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="hover:text-white">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} placeholder={placeholder} className="h-8 min-w-[10rem] flex-1 border-0 bg-transparent px-1 focus:ring-0" />
      </div>
    </div>
  );
}
