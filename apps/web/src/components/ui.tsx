import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { signedMoney, toneOf, toneText } from "@/lib/format";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink-2">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed";

export const buttonStyles = {
  primary: cx(buttonBase, "bg-accent text-accent-ink hover:opacity-90"),
  secondary: cx(buttonBase, "border border-line bg-surface text-ink hover:bg-surface-2"),
  ghost: cx(buttonBase, "text-ink-2 hover:bg-surface-2"),
  danger: cx(buttonBase, "border border-line text-loss-ink hover:bg-surface-2"),
};

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={cx(buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <Link className={cx(buttonStyles[variant], className)} {...props} />;
}

export const inputStyles =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-loss-ink">{error}</span>}
    </label>
  );
}

export function Pnl({ value, currency, className }: { value: number; currency: string; className?: string }) {
  return <span className={cx("tabular font-medium", toneText[toneOf(value)], className)}>{signedMoney(value, currency)}</span>;
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent/15 text-accent",
  warning: "bg-warning/20 text-ink",
  critical: "bg-critical/15 text-loss-ink",
} as const;

export function Badge({ tone = "neutral", children, title }: { tone?: keyof typeof badgeTones; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function FormMessage({ state }: { state: { ok?: boolean; message?: string } | null | undefined }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={cx("text-sm", state.ok ? "text-ink-2" : "text-loss-ink")}>
      {state.message}
    </p>
  );
}
