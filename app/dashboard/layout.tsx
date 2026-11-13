import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppStatusProvider } from "@/components/layout/app-status";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getPublicStatus } from "@/lib/env";
import { getRequestContext } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const ctx = await getRequestContext();
  // Defence in depth (the proxy already redirects): require a session.
  if (!ctx.user) redirect("/login?next=/dashboard");
  const initial = {
    ...getPublicStatus(),
    session: { signedIn: Boolean(ctx.user), email: ctx.user?.email ?? null },
  };
  return (
    <AppStatusProvider initial={initial}>
      <DashboardShell>{children}</DashboardShell>
    </AppStatusProvider>
  );
}
