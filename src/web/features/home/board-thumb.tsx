import { cn } from "@/lib/utils";
import { NODE_H, NODE_W } from "../../../shared/graph";
import type { BoardPreview, NodeStatus } from "../../../shared/types";

const PAD = 48;
// A floor on the visible area, so a one-task board stays small and centered instead of filling the frame.
const MIN_W = 1040;
const MIN_H = 650;

const dot: Record<NodeStatus, string> = {
  pending: "fill-muted-foreground/40",
  running: "fill-signal",
  done: "fill-emerald-500",
  failed: "fill-destructive",
  skipped: "fill-muted-foreground/30",
  cancelled: "fill-muted-foreground/30",
};

// A board at a glance: its tasks, the route between them, and the cards agents and people put down.
export function BoardThumb({ preview, className }: { preview?: BoardPreview; className?: string }) {
  if (!preview || (!preview.tasks.length && !preview.cards.length)) return <div className={cn("size-full", className)} />;
  const boxes = [
    ...preview.tasks.map((t) => ({ x: t.x, y: t.y, w: NODE_W, h: NODE_H })),
    ...preview.cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
  ];
  const left = Math.min(...boxes.map((b) => b.x)) - PAD;
  const top = Math.min(...boxes.map((b) => b.y)) - PAD;
  const right = Math.max(...boxes.map((b) => b.x + b.w)) + PAD;
  const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + PAD;
  const width = Math.max(MIN_W, right - left);
  const height = Math.max(MIN_H, bottom - top);
  const minX = left - (width - (right - left)) / 2;
  const minY = top - (height - (bottom - top)) / 2;

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={cn("size-full", className)}
    >
      {preview.links.map(([from, to]) => {
        const a = preview.tasks[from];
        const b = preview.tasks[to];
        if (!a || !b) return null;
        // The lead sits above the team, so its lines drop down; older boards run left to right.
        const below = b.y >= a.y + NODE_H;
        const x1 = below ? a.x + NODE_W / 2 : a.x + NODE_W;
        const y1 = below ? a.y + NODE_H : a.y + NODE_H / 2;
        const x2 = below ? b.x + NODE_W / 2 : b.x;
        const y2 = below ? b.y : b.y + NODE_H / 2;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        return (
          <path
            key={`${from}-${to}`}
            d={below ? `M${x1} ${y1}V${midY}H${x2}V${y2}` : `M${x1} ${y1}C${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`}
            className="fill-none stroke-foreground/25"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {preview.cards.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a preview is redrawn whole; positions are its only identity.
        <g key={i}>
          <rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            rx="14"
            className={c.kind === "note" ? "fill-[oklch(0.93_0.08_95)] dark:fill-[oklch(0.42_0.07_90)]" : "fill-card stroke-border"}
            vectorEffect="non-scaling-stroke"
          />
          {c.kind === "preview" && <rect x={c.x} y={c.y} width={c.w} height={Math.min(36, c.h / 6)} rx="14" className="fill-muted" />}
          {c.kind === "image" && (
            <rect x={c.x + 12} y={c.y + 12} width={c.w - 24} height={c.h - 24} rx="8" className="fill-muted-foreground/15" />
          )}
          {(c.kind === "doc" || c.kind === "table" || c.kind === "code" || c.kind === "files") &&
            [0, 1, 2].map((l) => (
              <rect
                key={l}
                x={c.x + 20}
                y={c.y + 24 + l * 28}
                width={(c.w - 40) * (l === 2 ? 0.55 : l === 1 ? 0.8 : 0.65)}
                height="10"
                rx="5"
                className="fill-muted-foreground/20"
              />
            ))}
        </g>
      ))}
      {preview.tasks.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a preview is redrawn whole; positions are its only identity.
        <g key={i}>
          <rect
            x={t.x}
            y={t.y}
            width={NODE_W}
            height={NODE_H}
            rx="14"
            className="fill-card stroke-border"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={t.x + 26} cy={t.y + 28} r="8" className={dot[t.status]} />
          <rect x={t.x + 44} y={t.y + 22} width={NODE_W * 0.5} height="12" rx="6" className="fill-muted-foreground/30" />
          <rect x={t.x + 18} y={t.y + 58} width={NODE_W * 0.35} height="10" rx="5" className="fill-muted-foreground/15" />
        </g>
      ))}
    </svg>
  );
}
