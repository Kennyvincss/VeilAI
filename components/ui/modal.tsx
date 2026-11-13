"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/format";

/** Accessible modal dialog: Escape closes, focus moves into the dialog and returns afterwards. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("button, a, input, select, textarea")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restore.current?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => dismissible && onClose()} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-border-strong bg-bg-2 p-5 shadow-2xl sm:rounded-3xl sm:p-6",
              wide ? "sm:max-w-2xl" : "sm:max-w-lg",
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="modal-title" className="text-lg font-semibold tracking-tight">
                  {title}
                </h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              {dismissible && (
                <button onClick={onClose} className="rounded-lg p-1.5 text-subtle hover:bg-black/[0.04] hover:text-text" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
