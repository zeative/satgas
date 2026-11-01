import { cn } from "@/lib/utils";

// A 1-2-1 outline drawn like pending nodes: hints at a branching plan without pretending to know its shape.
export function GhostPlan({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 362 122" fill="none" aria-hidden="true" className={cn("w-72 text-foreground/20", className)}>
      <g stroke="currentColor" strokeWidth="1">
        <rect x="1" y="41" width="80" height="40" rx="9" strokeDasharray="4 4" />
        <rect x="141" y="1" width="80" height="40" rx="9" strokeDasharray="4 4" />
        <rect x="141" y="81" width="80" height="40" rx="9" strokeDasharray="4 4" />
        <rect x="281" y="41" width="80" height="40" rx="9" strokeDasharray="4 4" />
        <path d="M81 61c30 0 30-40 60-40M81 61c30 0 30 40 60 40M221 21c30 0 30 40 60 40M221 101c30 0 30-40 60-40" />
      </g>
    </svg>
  );
}
