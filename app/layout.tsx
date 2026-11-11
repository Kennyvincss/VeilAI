import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "VEIL AI — Confidential Financial Intelligence", template: "%s · VEIL AI" },
  description:
    "Analyse your crypto portfolio, investigate wallets and receive financial insights through confidential AI processing on NEAR AI Cloud, with verifiable TEE attestation.",
  applicationName: "VEIL AI",
  appleWebApp: { capable: true, title: "VEIL AI", statusBarStyle: "black-translucent" },
  metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined,
  openGraph: {
    title: "VEIL AI — Your Financial Intelligence. Nobody Else’s Business.",
    description: "Confidential AI financial analysis powered by NEAR AI Cloud and Trusted Execution Environments.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#08090D",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-text">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm">
          Skip to content
        </a>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: "#151824", border: "1px solid rgba(255,255,255,0.1)", color: "#f5f6fa" },
          }}
        />
      </body>
    </html>
  );
}
