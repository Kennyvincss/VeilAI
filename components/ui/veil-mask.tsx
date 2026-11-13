import { useId } from "react";
import { cn } from "@/lib/utils/format";

/**
 * VEIL AI's mask: a chrome face mask, the visual for "your identity stays
 * veiled". Pure SVG (no image assets), with per-instance gradient ids.
 */
export function VeilMask({ className, float = true }: { className?: string; float?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const g = (n: string) => `vm-${n}-${id}`;
  return (
    <div className={cn("relative", float && "animate-float-soft", className)} aria-hidden>
      <svg viewBox="0 0 220 270" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={g("chrome")} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.16" stopColor="#d9dde4" />
            <stop offset="0.36" stopColor="#7d838d" />
            <stop offset="0.52" stopColor="#262a31" />
            <stop offset="0.68" stopColor="#5d636d" />
            <stop offset="0.86" stopColor="#e3e7ed" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
          <radialGradient id={g("depth")} cx="0.5" cy="0.42" r="0.62">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#0b0d12" stopOpacity="0.55" />
          </radialGradient>
          <linearGradient id={g("eye")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#020304" />
            <stop offset="1" stopColor="#1e2229" />
          </linearGradient>
          <linearGradient id={g("ridge")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1b1e24" />
            <stop offset="0.5" stopColor="#f4f6f9" />
            <stop offset="1" stopColor="#3a3f47" />
          </linearGradient>
          <linearGradient id={g("tint")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb07f" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#ffb07f" stopOpacity="0" />
            <stop offset="1" stopColor="#e2733f" stopOpacity="0.5" />
          </linearGradient>
          <filter id={g("blur")} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={g("soft")} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <clipPath id={g("face")}>
            <path d="M110 14C166 14 198 62 196 120 194 182 160 236 110 248 60 236 26 182 24 120 22 62 54 14 110 14Z" />
          </clipPath>
        </defs>

        {/* ground shadow */}
        <ellipse cx="110" cy="262" rx="62" ry="6" fill="#000000" opacity="0.5" filter={`url(#${g("blur")})`} />

        <g clipPath={`url(#${g("face")})`}>
          <rect x="0" y="0" width="220" height="270" fill={`url(#${g("chrome")})`} />
          <rect x="0" y="0" width="220" height="270" fill={`url(#${g("tint")})`} />
          <rect x="0" y="0" width="220" height="270" fill={`url(#${g("depth")})`} />
          {/* brow shading */}
          <path d="M44 104C70 82 96 84 110 96 124 84 150 82 176 104 150 94 128 96 110 108 92 96 70 94 44 104Z" fill="#0d0f14" opacity="0.35" filter={`url(#${g("soft")})`} />
          {/* nose ridge */}
          <path d="M110 104 101 162C105 168 115 168 119 162L110 104Z" fill={`url(#${g("ridge")})`} opacity="0.9" />
          {/* lips */}
          <path d="M86 194C98 186 122 186 134 194 122 205 98 205 86 194Z" fill="#14171c" opacity="0.75" />
          <path d="M92 194C104 191 116 191 128 194" stroke="#e8ebf0" strokeWidth="1.2" opacity="0.6" fill="none" />
          {/* highlights */}
          <ellipse cx="86" cy="48" rx="34" ry="13" transform="rotate(-18 86 48)" fill="#fff" opacity="0.9" filter={`url(#${g("blur")})`} />
          <ellipse cx="166" cy="150" rx="9" ry="30" fill="#fff" opacity="0.55" filter={`url(#${g("blur")})`} />
          <ellipse cx="58" cy="168" rx="7" ry="22" fill="#fff" opacity="0.35" filter={`url(#${g("blur")})`} />
        </g>

        {/* eyes */}
        <path d="M60 113C71 98 92 96 103 109 92 121 71 123 60 113Z" fill={`url(#${g("eye")})`} />
        <path d="M117 109C128 96 149 98 160 113 149 123 128 121 117 109Z" fill={`url(#${g("eye")})`} />
        <path d="M66 110C75 103 88 102 96 107" stroke="#ffffff" strokeWidth="1" opacity="0.35" fill="none" />
        <path d="M124 107C132 102 145 103 154 110" stroke="#ffffff" strokeWidth="1" opacity="0.35" fill="none" />

        {/* rim */}
        <path d="M110 14C166 14 198 62 196 120 194 182 160 236 110 248 60 236 26 182 24 120 22 62 54 14 110 14Z" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.2" />
      </svg>
    </div>
  );
}
