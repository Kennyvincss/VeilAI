import { ImageResponse } from "next/og";

/** Social share card (link previews on X, Telegram, Discord, etc.). */
export const alt = "VEIL AI — Confidential financial intelligence, verified by NEAR";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", padding: 28, background: "#6f9386", fontFamily: "sans-serif" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 64px",
            borderRadius: 40,
            background: "#ffffff",
            color: "#133628",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="18" fill="#1C4636" />
              <path d="M16 23 32 48 48 23" stroke="#E6F4EC" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 19c6.8-3.2 15.2-3.2 22 0" stroke="#BFE3D0" strokeWidth="3.2" strokeLinecap="round" />
              <circle cx="32" cy="30" r="3.4" fill="#fff" />
            </svg>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 700, letterSpacing: 6 }}>
              VEIL <span style={{ color: "#5b6e66", marginLeft: 12 }}>AI</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 70, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2, color: "#1C4636" }}>Your Financial Intelligence.</div>
            <div style={{ fontSize: 70, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2, color: "#1C4636" }}>Nobody Else&apos;s Business.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 22, fontSize: 24, color: "#4a5d55" }}>
              <span>Private AI in secure hardware</span>
              <span>·</span>
              <span>Verified answers</span>
              <span>·</span>
              <span>Built on NEAR</span>
            </div>
            <div style={{ display: "flex", padding: "12px 26px", borderRadius: 999, background: "#1C4636", color: "#ffffff", fontSize: 24 }}>veilainear.xyz</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
