import { create } from "zustand";
import { t } from "@/i18n";
import type { Lane } from "../../shared/pipeline";

interface PipelineState {
  // Every live or recent board's lane by board id; null until the first snapshot arrives.
  lanes: Record<string, Lane> | null;
  error: string | null;
}

export const usePipeline = create<PipelineState>(() => ({ lanes: null, error: null }));

const set = usePipeline.setState;

// The snapshot fills the page; lane events keep it current, so one that arrives first is simply replaced.
export async function loadPipeline() {
  try {
    const res = await fetch("/api/pipeline");
    if (!res.ok) throw new Error(String(res.status));
    const list = (await res.json()) as Lane[];
    set({ lanes: Object.fromEntries(list.map((l) => [l.id, l])), error: null });
  } catch {
    set({ error: t.pipeline.error });
  }
}

export function putLane(lane: Lane) {
  set((s) => (s.lanes ? { lanes: { ...s.lanes, [lane.id]: lane } } : s));
}

export function dropLane(id: string) {
  set((s) => {
    if (!s.lanes?.[id]) return s;
    const { [id]: _, ...rest } = s.lanes;
    return { lanes: rest };
  });
}
