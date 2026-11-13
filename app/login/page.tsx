import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { AuthForm } from "@/components/layout/auth-form";
import { getAppStatus } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthForm mode="login" googleEnabled={getAppStatus().googleAuth} />
    </AuthShell>
  );
}
