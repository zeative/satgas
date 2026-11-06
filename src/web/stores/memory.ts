import { create } from "zustand";
import type { MemoryEntry, MemoryStore } from "../../shared/memory";
import { request } from "./runs";

export const useMemory = create<{ store: MemoryStore | null; error: string | null }>(() => ({ store: null, error: null }));

export async function loadMemory() {
  try {
    const res = await fetch("/api/memory");
    if (!res.ok) throw new Error(`(${res.status})`);
    useMemory.setState({ store: (await res.json()) as MemoryStore, error: null });
  } catch (e) {
    useMemory.setState({ error: (e as Error).message });
  }
}

// Every change reloads, so the page shows exactly what the server kept.
export async function saveEntry(input: Partial<MemoryEntry>, id?: string) {
  await request(id ? "PUT" : "POST", id ? `/api/memory/${id}` : "/api/memory", input);
  await loadMemory();
}

export async function deleteEntry(id: string) {
  await request("DELETE", `/api/memory/${id}`);
  await loadMemory();
}

export async function setAutoMemory(auto: boolean) {
  const store = useMemory.getState().store;
  if (store) useMemory.setState({ store: { ...store, auto } });
  await request("PATCH", "/api/memory", { auto });
}

export const undoMemory = (runId: string, round: number) => request("POST", `/api/runs/${runId}/memory/${round}/undo`, {});
