import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/format";

/* ---------------- Button ---------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "white";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-[0_10px_22px_-12px_rgba(28,70,54,0.7)] hover:bg-[#245a46] active:bg-[#163a2c]",
  secondary: "bg-card text-text border border-border-strong shadow-[0_1px_2px_rgba(18,52,40,0.05)] hover:bg-card-2",
  outline: "bg-transparent text-text border border-border-strong hover:bg-black/[0.03]",
  ghost: "bg-transparent text-muted hover:text-text hover:bg-black/[0.04]",
  white: "bg-white text-accent shadow-[0_10px_26px_-14px_rgba(0,0,0,0.35)] hover:bg-[#eef3f0]",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-xs gap-1.5 rounded-full",
  md: "h-10 px-4.5 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-[0.95rem] gap-2 rounded-full",
  icon: "h-9 w-9 rounded-full",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center font-medium transition-all duration-200",
    variants[variant],
    sizes[size],
    className,
  );
}

/* ---------------- Card ---------------- */

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card relative overflow-hidden p-5 transition-colors", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, action }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card-2 text-text">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------------- Badge ---------------- */

type Tone = "neutral" | "accent" | "blue" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-card-2 text-muted border-border",
  accent: "bg-accent/15 text-accent-strong border-lavender/35",
  blue: "bg-accent-2/10 text-accent-2 border-accent-2/25",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
};

export function Badge({ tone = "neutral", className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-wide", tones[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}

/* ---------------- Skeleton / Empty / Spinner ---------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-card-2 text-text">{icon}</div>
      <h4 className="text-sm font-semibold text-text">{title}</h4>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-accent-strong", className)} aria-label="Loading" />;
}

/* ---------------- Inputs ---------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-border-strong bg-white px-3.5 text-sm text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:bg-card focus:outline-none focus:ring-4 focus:ring-accent/20",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center justify-between text-[0.8rem] font-semibold text-text">
      <span>{children}</span>
      {hint && <span className="font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, id, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-border-strong bg-card-2",
        )}
      >
        <span className={cn("inline-block h-4.5 w-4.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-1")} />
      </button>
    </div>
  );
}

/* ---------------- Misc ---------------- */

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "flat" }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-text">{value}</div>
      {sub && <div className={cn("mt-0.5 text-xs", tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-muted")}>{sub}</div>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, description, center }: { eyebrow?: string; title: ReactNode; description?: ReactNode; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">{eyebrow}</div>}
      <h2 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-muted">{description}</p>}
    </div>
  );
}
