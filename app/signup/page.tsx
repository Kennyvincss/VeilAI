import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { AuthForm } from "@/components/layout/auth-form";
import { getAppStatus } from "@/lib/env";
import { usernameLoginEnabled } from "@/lib/usernames";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" googleEnabled={getAppStatus().googleAuth} usernameLogin={usernameLoginEnabled()} />
    </AuthShell>
  );
}
