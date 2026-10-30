import type { ReactNode } from "react";

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-panel ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, className = "" }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-2.5 py-2 sm:px-3 sm:py-2.5">
      <div className="text-[11px] leading-tight text-muted sm:text-xs">{label}</div>
      <div className={`num mt-0.5 text-base font-semibold sm:text-lg ${className}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-tight text-muted sm:text-xs">{hint}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-white hover:brightness-110 disabled:opacity-50",
    ghost: "border border-line text-fg hover:bg-panel-2 disabled:opacity-50",
    danger: "border border-down/50 text-down hover:bg-down/10",
  }[variant];
  return (
    <button {...props} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${styles} ${className}`}>
      {children}
    </button>
  );
}

/** `help` is a beginner explanation (a FieldHelp), shown under the hint. */
export function Field({ label, children, hint, help }: { label: ReactNode; children: ReactNode; hint?: string; help?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span>{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted/80">{hint}</span>}
      {help}
    </label>
  );
}

export function Alert({ tone = "warn", children }: { tone?: "warn" | "error" | "info"; children: ReactNode }) {
  const styles = {
    warn: "border-warn/40 bg-warn/10 text-warn",
    error: "border-down/40 bg-down/10 text-down",
    info: "border-accent/40 bg-accent/10 text-fg",
  }[tone];
  return <div className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto border-b border-line px-3 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${value === t.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
