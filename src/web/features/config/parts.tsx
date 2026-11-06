import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function ConfigPage({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main id="content" className="relative flex-1">
      <PageHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-12 pb-16">
        <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <h1 className="brand-title text-[1.75rem] leading-tight">{title}</h1>
          {actions}
        </header>
        {children}
      </div>
    </main>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-medium">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-muted/50 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function SavedInput({
  id,
  value,
  placeholder,
  className,
  onSave,
}: {
  id: string;
  value: string;
  placeholder?: string;
  className?: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    if (draft.trim() !== value) onSave(draft.trim());
  };
  return (
    <Input
      id={id}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setDraft(value);
      }}
      className={cn("h-8 bg-background", className)}
    />
  );
}

// Parts of one whole: steps of one neutral, since the labels already say which is which.
const SHARE_TONES = ["bg-foreground", "bg-foreground/70", "bg-foreground/50", "bg-foreground/25", "bg-foreground/15"];

export function ShareBar({ parts, format }: { parts: { label: string; value: number }[]; format: (n: number) => string }) {
  const whole = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2 gap-0.5" aria-hidden="true">
        {parts.map(
          (p, i) =>
            p.value > 0 && (
              <span
                key={p.label}
                className={cn("min-w-1 rounded-full", SHARE_TONES[i])}
                style={{ flexGrow: p.value / whole, flexBasis: 0 }}
              />
            ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-2 rounded-[2px]", SHARE_TONES[i])} />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="tabular-nums">{format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-destructive/30 px-4 py-3 text-sm">
      <span className="text-destructive">{t.config.loadFailed}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw />
        {t.config.retry}
      </Button>
    </div>
  );
}

// One JSON read: what it answered, whether it failed, and a way to ask again.
export function useJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(
    async (target = url) => {
      setFailed(false);
      try {
        const res = await fetch(target);
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as T);
      } catch {
        setFailed(true);
      }
    },
    [url],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return { data, failed, load };
}

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
export function fmtBytes(n: number) {
  let v = n;
  let i = 0;
  while (v >= 1024 && i < SIZE_UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${SIZE_UNITS[i]}`;
}

export const fmtTokens = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
