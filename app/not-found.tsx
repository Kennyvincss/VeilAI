import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/primitives";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="grid-backdrop absolute inset-0 -z-10" aria-hidden />
      <Link href="/" aria-label="VEIL AI home" className="mb-10">
        <Logo />
      </Link>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-strong">
        <Compass className="h-6 w-6" />
      </div>
      <p className="mt-6 font-mono text-sm text-subtle">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">The link may be outdated or mistyped.</p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Link href="/dashboard" className={buttonClass("primary", "md")}>
          Go to dashboard
        </Link>
        <Link href="/" className={buttonClass("secondary", "md")}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
