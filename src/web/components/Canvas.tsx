import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { NODE_H, NODE_W } from "../../shared/graph";
import type { NodeState } from "../../shared/types";
import { fmtElapsed, t } from "../i18n";
import { now } from "../state";
import { fitRequest } from "../ui";
import { Icon, StatusGlyph } from "./Icon";

const PAD = 56;
const MIN_K = 0.35;
const MAX_K = 1.6;

interface Props {
  nodes: NodeState[];
  codes: Map<string, string>;
  graphKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Canvas({ nodes, codes, graphKey, selectedId, onSelect }: Props) {
  const viewport = useRef<HTMLElement>(null);
  const view = useSignal({ x: 0, y: 0, k: 1 });
  // Once the user pans or zooms, stop auto-fitting so we never yank the view away from them.
  const touched = useRef(false);
  const transform = useComputed(() => `transform: translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.k})`);
  const zoomLabel = useComputed(() => `${Math.round(view.value.k * 100)}%`);

  const width = Math.max(...nodes.map((n) => n.x)) + NODE_W;
  const height = Math.max(...nodes.map((n) => n.y)) + NODE_H;

  const fit = () => {
    const el = viewport.current;
    if (!el) return;
    const { clientWidth: w, clientHeight: h } = el;
    const k = clamp(Math.min((w - PAD * 2) / width, (h - PAD * 2) / height, 1), MIN_K, 1);
    view.value = { k, x: (w - width * k) / 2, y: (h - height * k) / 2 };
  };

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = viewport.current;
    if (!el) return;
    const { x, y, k } = view.peek();
    const nk = clamp(k * factor, MIN_K, MAX_K);
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    touched.current = true;
    view.value = { k: nk, x: px - ((px - x) * nk) / k, y: py - ((py - y) * nk) / k };
  };

  const pan = (dx: number, dy: number) => {
    touched.current = true;
    const v = view.peek();
    view.value = { ...v, x: v.x + dx, y: v.y + dy };
  };

  const refit = () => {
    touched.current = false;
    fit();
  };

  // Refit only when a different graph arrives, not on every status change.
  useEffect(refit, [graphKey, nodes.length]);

  useEffect(() => {
    if (fitRequest.value) refit();
  }, [fitRequest.value]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    ro.observe(el);
    // Registered natively because preventDefault needs a non-passive wheel listener.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      } else pan(-e.deltaX, -e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [width, height]);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    const el = viewport.current;
    if (!el || (e.target as Element).closest(".node, .zoom")) return;
    drag.current = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
    el.classList.add("is-panning");
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    pan(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    drag.current = null;
    viewport.current?.classList.remove("is-panning");
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== viewport.current) return;
    const step = 48;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => pan(step, 0),
      ArrowRight: () => pan(-step, 0),
      ArrowUp: () => pan(0, step),
      ArrowDown: () => pan(0, -step),
      "+": () => zoomAt(1.2),
      "=": () => zoomAt(1.2),
      "-": () => zoomAt(1 / 1.2),
      "0": refit,
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  // DOM order follows the visual order (column, then row) so Tab walks the graph left to right.
  const ordered = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);

  return (
    <section
      ref={viewport}
      class="canvas"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a pannable viewport must be keyboard-focusable (WCAG scrollable-region-focusable).
      tabIndex={0}
      aria-label={t.graphLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <div class="canvas-world" style={transform}>
        <svg class="edges" width={width} height={height} aria-hidden="true">
          <defs>
            {EDGE_STATES.map((s) => (
              <marker key={s} id={`arrow-${s}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path class={`arrow-${s}`} d="M0 0.5 8 4 0 7.5z" />
              </marker>
            ))}
          </defs>
          {nodes.flatMap((target) =>
            target.dependsOn.map((dep) => {
              const source = byId.get(dep);
              return source ? <Edge key={`${dep}>${target.id}`} source={source} target={target} /> : null;
            }),
          )}
        </svg>
        {ordered.map((n) => (
          <NodeCard key={n.id} node={n} code={codes.get(n.id) ?? ""} selected={n.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
      <div class="zoom">
        <button type="button" class="icon-btn" onClick={() => zoomAt(1 / 1.2)} aria-label={t.zoomOut} title={t.zoomOut}>
          <Icon name="minus" size={14} />
        </button>
        <span class="zoom-level num">{zoomLabel}</span>
        <button type="button" class="icon-btn" onClick={() => zoomAt(1.2)} aria-label={t.zoomIn} title={t.zoomIn}>
          <Icon name="plus" size={14} />
        </button>
        <span class="zoom-sep" aria-hidden="true" />
        <button type="button" class="icon-btn" onClick={refit} aria-label={t.fit} title={`${t.fit} (0)`}>
          <Icon name="fit" size={14} />
        </button>
      </div>
    </section>
  );
}

const EDGE_STATES = ["idle", "done", "flow", "broken"] as const;

// The magenta line: the leg feeding a running task is the live route.
function Edge({ source, target }: { source: NodeState; target: NodeState }) {
  const sx = source.x + NODE_W;
  const sy = source.y + NODE_H / 2;
  const tx = target.x - 3;
  const ty = target.y + NODE_H / 2;
  const dx = Math.max(28, (tx - sx) / 2);
  const state =
    source.status === "done"
      ? target.status === "running"
        ? "flow"
        : "done"
      : source.status === "failed" || source.status === "skipped" || source.status === "cancelled"
        ? "broken"
        : "idle";
  return (
    <path
      class={`edge edge-${state}`}
      d={`M${sx} ${sy} C${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`}
      marker-end={`url(#arrow-${state})`}
    />
  );
}

function NodeCard({
  node,
  code,
  selected,
  onSelect,
}: {
  node: NodeState;
  code: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const live = node.status === "running";
  const elapsed = node.startedAt ? fmtElapsed((live ? now.value : (node.endedAt ?? node.startedAt)) - node.startedAt) : null;
  const problem = node.status === "failed" ? node.error : null;
  return (
    <button
      type="button"
      class={`node s-${node.status}${selected ? " is-selected" : ""}`}
      style={`left:${node.x}px;top:${node.y}px;width:${NODE_W}px;height:${NODE_H}px`}
      data-node={node.id}
      aria-pressed={selected}
      aria-label={`${code} ${node.title}, ${t.node[node.status]}`}
      onClick={() => onSelect(node.id)}
    >
      <span class="node-head" aria-hidden="true">
        <span class="node-code">{code}</span>
        <span class="node-state">
          <StatusGlyph status={node.status} size={12} />
          {t.node[node.status]}
          {elapsed && <span class="num"> · {elapsed}</span>}
        </span>
      </span>
      <span class="node-title" aria-hidden="true">
        {node.title}
      </span>
      {problem ? (
        <span class="node-error" aria-hidden="true">
          {problem}
        </span>
      ) : (
        <span class="node-meta" aria-hidden="true">{`${node.role} · ${t.agent[node.agent]}`}</span>
      )}
    </button>
  );
}

export function Plotting({ label, elapsed }: { label: string; elapsed: string }) {
  // Fixed 1-2-1 outline: hints at a branching route without pretending to know its shape.
  return (
    <div class="canvas plotting" aria-busy="true">
      <div class="plotting-graph" aria-hidden="true">
        <div class="plotting-col">
          <div class="plotting-node" />
        </div>
        <div class="plotting-col">
          <div class="plotting-node" />
          <div class="plotting-node" />
        </div>
        <div class="plotting-col">
          <div class="plotting-node" />
        </div>
      </div>
      <div class="plotting-label">
        <StatusGlyph status="planning" />
        <span>{label}</span>
        {elapsed && <span class="num">{elapsed}</span>}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
