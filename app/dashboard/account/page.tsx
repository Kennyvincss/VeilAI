"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AtSign, BadgeCheck, Bell, KeyRound, Link2, LogIn, Unlink } from "lucide-react";
import { toast } from "sonner";
import { api, useApi } from "@/hooks/use-api";
import { useNearWallet } from "@/hooks/use-near-wallet";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { NotificationSettings } from "@/components/notifications/notification-center";
import { Badge, Button, buttonClass, Card, CardHeader, Input, Label, Skeleton } from "@/components/ui/primitives";
import { shortAccount } from "@/lib/utils/format";

interface ProfilePayload {
  signedIn: boolean;
  setUp: boolean;
  notice?: string;
  profile: { username: string; payoutAccount: string | null; payoutNetwork: string | null } | null;
  verifiedWallets: string[];
  usernameLogin: boolean;
}

export default function AccountPage() {
  const { status } = useAppStatus();
  const data = useApi<ProfilePayload>("/api/profile");
  const p = data.data;

  return (
    <>
      <PageHeader title="Account" description="Your username, how people can pay you, and notifications." />
      <div className="mx-auto grid max-w-3xl gap-4">
        {!status.session.signedIn ? (
          <Card className="p-6">
            <CardHeader icon={<AtSign className="h-4 w-4" />} title="Get a username" subtitle="Sign in with @username and receive NEAR at it" />
            <p className="text-sm text-muted">Usernames are part of a free account. You&apos;re currently in the sample workspace.</p>
            {status.accounts.enabled && (
              <Link href="/signup" className={buttonClass("primary", "md", "mt-4")}>
                Create free account
              </Link>
            )}
          </Card>
        ) : data.loading && !p ? (
          <Skeleton className="h-48 w-full" />
        ) : p && !p.setUp ? (
          <Card className="p-6">
            <CardHeader icon={<AtSign className="h-4 w-4" />} title="Username" />
            <p className="text-sm text-warning">{p.notice ?? "Usernames aren't available yet."}</p>
          </Card>
        ) : (
          p && (
            <>
              <UsernameCard current={p.profile?.username ?? null} usernameLogin={p.usernameLogin} onSaved={data.reload} />
              {p.profile && <ReceiveCard profile={p.profile} verifiedWallets={p.verifiedWallets} network={status.network} onChanged={data.reload} />}
            </>
          )
        )}
        <NotificationSettings />
      </div>
    </>
  );
}

function UsernameCard({ current, usernameLogin, onSaved }: { current: string | null; usernameLogin: boolean; onSaved: () => void }) {
  const [value, setValue] = useState(current ?? "");
  const [check, setCheck] = useState<{ for: string; available: boolean | null; problem: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  const changed = normalized !== (current ?? "");

  useEffect(() => {
    if (!changed || normalized.length < 3) return;
    const t = setTimeout(() => {
      api<{ available: boolean | null; problem: string | null }>(`/api/username/check?u=${encodeURIComponent(normalized)}`)
        .then((r) => setCheck({ for: normalized, ...r }))
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, [normalized, changed]);

  const shown = check && check.for === normalized ? check : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/profile", { method: "PUT", json: { username: normalized } });
      toast.success(`You're @${normalized}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save username");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <CardHeader
        icon={<AtSign className="h-4 w-4" />}
        title="Username"
        subtitle={current ? `You are @${current}` : "Pick a username to sign in with and to get paid"}
        action={current ? <Badge tone="success">@{current}</Badge> : undefined}
      />
      <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="username" hint="3–20 characters: a–z, 0–9, _">
            {current ? "Change username" : "Username"}
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">@</span>
            <Input id="username" value={value.replace(/^@/, "")} maxLength={20} onChange={(e) => setValue(e.target.value)} autoComplete="username" spellCheck={false} className="pl-7 font-mono text-sm" />
          </div>
          {changed && shown && (
            <p className={`mt-1 text-[0.72rem] ${shown.available ? "text-success" : "text-warning"}`}>
              {shown.available ? `@${normalized} is available` : shown.available === false ? shown.problem ?? "Not available" : ""}
            </p>
          )}
        </div>
        <Button type="submit" loading={busy} disabled={!changed || shown?.available === false || normalized.length < 3}>
          {current ? "Change" : "Claim"}
        </Button>
      </form>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <LogIn className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {usernameLogin
          ? current
            ? `You can sign in with @${current} or your email, using your password.`
            : "Once claimed, you can sign in with your username or your email."
          : "Username sign-in isn't switched on for this site yet — sign in with your email for now."}
      </p>
    </Card>
  );
}

function ReceiveCard({
  profile,
  verifiedWallets,
  network,
  onChanged,
}: {
  profile: NonNullable<ProfilePayload["profile"]>;
  verifiedWallets: string[];
  network: "mainnet" | "testnet";
  onChanged: () => void;
}) {
  const wallet = useNearWallet(network);
  const [choice, setChoice] = useState(profile.payoutAccount ?? verifiedWallets[0] ?? "");
  const [busy, setBusy] = useState(false);
  const linked = profile.payoutAccount && profile.payoutNetwork === network ? profile.payoutAccount : null;

  async function link(accountId: string | null) {
    setBusy(true);
    try {
      await api("/api/profile", { method: "PUT", json: { payoutAccount: accountId } });
      toast.success(accountId ? `@${profile.username} now receives to ${shortAccount(accountId, 16, 6)}` : "Wallet unlinked");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function verifyWallet() {
    try {
      const challenge = await api<{ message: string; recipient: string; nonce: string }>("/api/wallet/challenge");
      const proof = await wallet.connectWithProof(challenge);
      await api("/api/wallet/verify", { method: "POST", json: { ...proof, label: "Connected wallet" } });
      toast.success(`Ownership of ${shortAccount(proof.accountId, 14, 6)} verified`);
      setChoice(proof.accountId);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wallet verification failed");
    }
  }

  return (
    <Card className="p-6">
      <CardHeader icon={<Link2 className="h-4 w-4" />} title={`Receive NEAR at @${profile.username}`} subtitle="People can send to your username instead of a long address" />
      {linked ? (
        <div className="flex flex-col gap-3 rounded-xl border border-success/25 bg-success/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <div className="flex items-center gap-1.5 text-success">
              <BadgeCheck className="h-4 w-4" /> Linked
            </div>
            <div className="mt-1 break-all font-mono text-xs">
              @{profile.username} → {linked}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => link(null)} loading={busy}>
            <Unlink className="h-3.5 w-3.5" /> Unlink
          </Button>
        </div>
      ) : verifiedWallets.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="payout">Receiving wallet</Label>
            <select id="payout" value={choice} onChange={(e) => setChoice(e.target.value)} className="h-11 w-full rounded-xl border border-border-strong bg-bg-2 px-3 font-mono text-sm text-text focus:border-accent/60 focus:outline-none">
              {verifiedWallets.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => link(choice)} loading={busy} disabled={!choice}>
            Link wallet
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">Only a wallet you&apos;ve proved you own can receive at your username.</p>
      )}
      {!linked && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={verifyWallet} loading={wallet.busy}>
          {!wallet.busy && <KeyRound className="h-3.5 w-3.5" />} Verify {verifiedWallets.length > 0 ? "another" : "a"} wallet
        </Button>
      )}
      <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-muted">
        <li>• Verifying signs a harmless message in your wallet (NEP-413). It can&apos;t move funds.</li>
        <li>• Once linked, anyone who knows @{profile.username} can see which NEAR account it points to — like sharing your address.</li>
        <li>
          <Bell className="mr-1 inline h-3 w-3 align-[-1px]" />
          Senders see &quot;@{profile.username} → account&quot; on their review screen before approving.
        </li>
      </ul>
    </Card>
  );
}
