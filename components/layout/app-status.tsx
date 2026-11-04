"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { AppStatus } from "@/types";
import { api } from "@/hooks/use-api";

export type StatusPayload = AppStatus & { session: { signedIn: boolean; email: string | null; demo: boolean } };

const Ctx = createContext<{ status: StatusPayload; reload: () => void } | null>(null);

/** Server-provided feature flags + session mode, available to every dashboard component. */
export function AppStatusProvider({ children, initial }: { children: ReactNode; initial: StatusPayload }) {
  const [status, setStatus] = useState(initial);
  const reload = useCallback(() => {
    api<StatusPayload>("/api/status").then(setStatus).catch(() => undefined);
  }, []);
  return <Ctx.Provider value={{ status, reload }}>{children}</Ctx.Provider>;
}

export function useAppStatus() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppStatus must be used inside AppStatusProvider");
  return v;
}
