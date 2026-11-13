"use client";

import { Database, ExternalLink } from "lucide-react";
import type { DataSource, Provenance } from "@/types";
import { cn, timeAgo } from "@/lib/utils/format";

export function SourcesList({ sources, className }: { sources: DataSource[]; className?: string }) {
  if (!sources.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Data sources">
      {sources.map((s) => (
        <li
          key={`${s.name}-${s.purpose}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem]",
            s.ok ? "border-border text-muted" : "border-warning/30 text-warning",
          )}
          title={`${s.purpose}${s.error ? ` — ${s.error}` : ""} · ${s.url}`}
        >
          <Database className="h-3 w-3" aria-hidden />
          {s.name}
          <span className="text-subtle">· {s.purpose}</span>
          {!s.ok && <span>(unavailable)</span>}
          {s.url.startsWith("http") && (
            <a href={s.url.replace(/\{.*\}/, "")} target="_blank" rel="noopener noreferrer" aria-label={`${s.name} documentation`} className="text-subtle hover:text-text">
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Collapsed "Data sources" section. */
export function ProvenanceBar({ provenance }: { provenance: Provenance }) {
  const hasDetails = provenance.sources.length > 0 || provenance.notes.length > 0;
  return (
    <div>
      {hasDetails && (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[0.7rem] text-subtle hover:text-muted">
            <Database className="h-3 w-3" aria-hidden /> Data sources · updated {timeAgo(provenance.generatedAt)}
          </summary>
          <div className="mt-2 space-y-2 rounded-xl border border-border bg-bg-2/40 p-3">
            <SourcesList sources={provenance.sources} />
            {provenance.notes.length > 0 && (
              <ul className="space-y-0.5 text-[0.7rem] leading-relaxed text-subtle">
                {provenance.notes.map((n) => (
                  <li key={n}>• {n}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
