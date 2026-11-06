import { ImageResponse } from "next/og";

/** Social share card (link previews on X, Telegram, Discord, etc.). */
export const alt = "VEIL AI — Confidential financial intelligence, verified by NEAR";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "radial-gradient(ellipse at top, rgba(139,92,246,0.35), #08090D 60%)",
          color: "#F5F6FA",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="16" fill="#151824" />
            <path d="M16 23 32 48 48 23" stroke="#A78BFA" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 18.5c6.8-3.2 15.2-3.2 22 0" stroke="#7C9BF8" strokeWidth="3.6" strokeLinecap="round" />
            <circle cx="32" cy="30" r="3.6" fill="#fff" />
          </svg>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: 6 }}>
            VEIL <span style={{ color: "#A78BFA", marginLeft: 12 }}>AI</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>Your Financial Intelligence.</div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, color: "#C4B5FD" }}>Nobody Else&apos;s Business.</div>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 26, color: "#8B90A5" }}>
          <span>Confidential AI in TEEs</span>
          <span>·</span>
          <span>Verified attestation</span>
          <span>·</span>
          <span>Powered by NEAR</span>
        </div>
      </div>
    ),
    size,
  );
}
