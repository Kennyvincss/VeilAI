"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/utils/format";

/** Relative time that re-renders itself ("updated 12s ago"). */
export function Ago({ iso, prefix = "" }: { iso: string | null | undefined; prefix?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  return (
    <span suppressHydrationWarning>
      {prefix}
      {timeAgo(iso)}
    </span>
  );
}
