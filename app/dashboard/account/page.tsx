"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  ExternalLink,
  KeyRound,
  Mail,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  CreateNearAccount,
  type NearAccountOffer,
} from "@/components/wallet/create-near-account";
import { useApi } from "@/hooks/use-api";
import { WEB_WALLET_NAME, WEB_WALLET_URL } from "@/hooks/use-near-wallet";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { NotificationSettings } from "@/components/notifications/notification-center";
import {
  Button,
  buttonClass,
  Card,
  CardHeader,
  Skeleton,
} from "@/components/ui/primitives";

export default function AccountPage() {
  const { status } = useAppStatus();
  return (
    <>
      <PageHeader
        title="Account"
        description="Your sign-in, your NEAR account and notifications."
      />
      <div className="mx-auto grid max-w-3xl gap-4">
        {!status.session.signedIn ? (
          <Card className="p-6">
            <CardHeader
              icon={<Wallet className="h-4 w-4" />}
              title="Get your own name.near"
              subtitle="Free with a VEIL AI account"
            />
            <p className="text-sm text-muted">
              Create a free account to get a real NEAR account with your name.
            </p>
            {status.accounts.enabled && (
              <Link
                href="/signup"
                className={buttonClass("primary", "md", "mt-4")}
              >
                Create free account
              </Link>
            )}
          </Card>
        ) : (
          <>
            <NearAccountCard network={status.network} />
            <Card className="p-6">
              <CardHeader
                icon={<Mail className="h-4 w-4" />}
                title="Sign-in"
                subtitle="Email and password"
              />
              <p className="break-all text-sm text-muted">
                You sign in with{" "}
                <span className="font-medium text-text">
                  {status.session.email}
                </span>
                .
              </p>
            </Card>
          </>
        )}
        <NotificationSettings />
      </div>
    </>
  );
}

/** "Your NEAR account": the name.near created at sign-up, or create one now. */
function NearAccountCard({ network }: { network: "mainnet" | "testnet" }) {
  const offer = useApi<NearAccountOffer>("/api/near-account");
  const [open, setOpen] = useState(false);
  const o = offer.data;
  const created = o?.account?.status === "created" ? o.account.accountId : null;

  if (offer.loading && !o) return <Skeleton className="h-36 w-full" />;
  if (!o || (!o.enabled && !created)) return null;
  return (
    <Card className="p-6">
      <CardHeader
        icon={<Wallet className="h-4 w-4" />}
        title="Your NEAR account"
        subtitle={
          created
            ? "Works in every NEAR wallet"
            : `Get your own name.${o.suffix}, free`
        }
      />
      {created ? (
        <>
          <div className="rounded-2xl border border-success/25 bg-success/[0.05] p-4">
            <div className="flex items-center gap-1.5 font-mono text-sm text-success">
              <BadgeCheck className="h-4 w-4" /> {created}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              To use it, open a web wallet (no install needed), choose{" "}
              <strong className="text-text">Import</strong> and type your 12
              words there. Then connect it on the Wallet page. VEIL AI never has
              your words.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={WEB_WALLET_URL[network]}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("secondary", "sm")}
              >
                Open {WEB_WALLET_NAME} <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Link
                href="/dashboard/wallet"
                className={buttonClass("primary", "sm")}
              >
                Go to Wallet
              </Link>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-border bg-bg-2 p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-text">
              <KeyRound className="h-4 w-4" /> Your recovery phrase and private
              key
            </div>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <li>
                VEIL AI showed them once, when the account was made, and never
                kept a copy. So they can&apos;t be shown here, and nobody at
                VEIL AI can see or reset them.
              </li>
              <li>
                Once you&apos;ve imported {created} into a wallet like{" "}
                {WEB_WALLET_NAME}, you can view or export them there, in the
                wallet&apos;s settings (look for{" "}
                <strong className="text-text">Export</strong> or{" "}
                <strong className="text-text">Backup</strong>).
              </li>
              <li>
                Lost them and never imported the account? The account still
                exists, but nobody can sign for it. You&apos;d need to create a
                new one.
              </li>
            </ul>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            A real NEAR account with your name. Your browser creates the keys
            and recovery phrase; VEIL AI only saves the account name and pays
            the small creation fee.
          </p>
          <Button className="mt-4" onClick={() => setOpen(true)}>
            <Sparkles className="h-4 w-4" /> Create name.{o.suffix}
          </Button>
        </>
      )}
      <CreateNearAccount
        open={open}
        onClose={() => setOpen(false)}
        suffix={o.suffix}
        depositNear={o.depositNear}
        network={network}
        onCreated={() => offer.reload()}
      />
    </Card>
  );
}
