import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { AuthForm } from "@/components/layout/auth-form";
import { getAppStatus, nearNetwork } from "@/lib/env";
import { sponsorConfig, sponsoredAccountsEnabled } from "@/lib/near/sponsor";
import { topLevelFor } from "@/lib/username-rules";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  const network = nearNetwork();
  const nearSignup = { enabled: sponsoredAccountsEnabled(), suffix: topLevelFor(network), depositNear: sponsorConfig()?.depositNear ?? null, network };
  return (
    <AuthShell>
      <AuthForm mode="signup" googleEnabled={getAppStatus().googleAuth} nearSignup={nearSignup} />
    </AuthShell>
  );
}
