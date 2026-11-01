import { cn } from "@/lib/utils";

// One task forking into two: the shape every Satgas plan grows from.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("size-5 shrink-0", className)}>
      <path d="M8.5 12c3.5 0 3.5-6 7-6M8.5 12c3.5 0 3.5 6 7 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="6" cy="12" r="2.5" fill="currentColor" />
      <circle cx="18" cy="6" r="2.5" className="fill-signal" />
      <circle cx="18" cy="18" r="2.5" fill="currentColor" />
    </svg>
  );
}
