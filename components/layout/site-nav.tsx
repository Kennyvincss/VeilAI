"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/primitives";
import { cn } from "@/lib/utils/format";

const LINKS = [
  { href: "#main", label: "Home" },
  { href: "#how", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
  { href: "#near", label: "NEAR" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-300", scrolled ? "border-b border-border bg-bg/80 backdrop-blur-xl" : "bg-transparent")}>
      <nav className="mx-auto grid h-[72px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6" aria-label="Main">
        <Link href="/" aria-label="VEIL AI home" className="justify-self-start">
          <Logo />
        </Link>
        <div className="hidden items-center gap-1 rounded-full border border-border-strong bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,236,220,0.05)] backdrop-blur md:flex">
          {LINKS.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[0.8rem] transition-colors",
                i === 0 ? "bg-white/[0.08] text-text ring-1 ring-border" : "text-muted hover:text-text",
              )}
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="col-start-3 flex items-center justify-self-end gap-2">
          <Link href="/login" className={buttonClass("ghost", "sm", "hidden md:inline-flex")}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClass("white", "sm", "whitespace-nowrap")}>
            <span className="sm:hidden">Get started</span>
            <span className="hidden sm:inline">Get started for free</span>
          </Link>
          <button className="rounded-full p-2 text-muted hover:text-text md:hidden" onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border-b border-border bg-bg/95 px-4 pb-5 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-white/[0.06] hover:text-text">
                  {l.label}
                </a>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/login" className={buttonClass("outline", "md")}>
                  Sign in
                </Link>
                <Link href="/signup" className={buttonClass("primary", "md")}>
                  Get started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
