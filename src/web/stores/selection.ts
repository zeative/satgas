import { create } from "zustand";

// The cards selected on the open board, so the chat can send them along as what the next message is about.
export const useSelection = create<{ runId: string | null; ids: string[] }>(() => ({ runId: null, ids: [] }));

export function setBoardSelection(runId: string, ids: string[]) {
  const now = useSelection.getState();
  if (now.runId === runId && now.ids.length === ids.length && now.ids.every((id, i) => id === ids[i])) return;
  useSelection.setState({ runId, ids });
}
