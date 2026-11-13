import { useId } from "react";
import { cn } from "@/lib/utils/format";

/** VEIL AI mark: a veiled aperture — layered arcs over a core. */
export function LogoMark({ className }: { className?: string }) {
  // Unique gradient id per instance: a duplicated id inside a hidden (display:none)
  // copy of the logo would otherwise leave visible copies without their gradient.
  const gid = `veil-g-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden fill="none">
      <defs>
        <linearGradient id={gid} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#CFC3FF" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#111216" />
      <path d="M8 11.5 16 24l8-12.5" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 9.5c3.4-1.6 7.6-1.6 11 0" stroke={`url(#${gid})`} strokeWidth="1.6" strokeLinecap="round" opacity="0.65" />
      <circle cx="16" cy="15" r="1.7" fill="#fff" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[0.95rem] font-semibold tracking-[0.14em] text-text">
        VEIL<span className="text-muted"> AI</span>
      </span>
    </span>
  );
}
