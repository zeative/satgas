import { create } from "zustand";

// What the page in a frame reports about the element the person picked.
export interface PickedEl {
  tag: string;
  id?: string;
  classes?: string;
  text: string;
  // The element holds its own words and no child elements, so its text can be rewritten in place.
  ownText: boolean;
  html: string;
  selector: string;
  loc?: string;
  path: string;
  styles: Record<string, string>;
}

type Send = (msg: Record<string, unknown>) => void;

interface Inspect {
  // The frame on the board that is in pick mode, if any.
  picking: string | null;
  target: { runId: string; cardId: string; app: string; el: PickedEl; send: Send } | null;
  // Changes made in the panel, previewed on the page until the team writes them into the source.
  edits: Record<string, string>;
  text: string | null;
}

export const useInspect = create<Inspect>(() => ({ picking: null, target: null, edits: {}, text: null }));

export function setPicking(cardId: string | null) {
  useInspect.setState({ picking: cardId });
}

export function pickElement(t: NonNullable<Inspect["target"]>, keep: boolean) {
  const now = useInspect.getState();
  const same = keep && now.target?.cardId === t.cardId;
  useInspect.setState({ target: t, edits: same ? now.edits : {}, text: same ? now.text : null });
}

export function editStyle(css: Record<string, string>) {
  const { target, edits } = useInspect.getState();
  if (!target) return;
  useInspect.setState({ edits: { ...edits, ...css } });
  target.send({ type: "style", css });
}

export function editText(value: string) {
  const { target } = useInspect.getState();
  if (!target) return;
  useInspect.setState({ text: value });
  target.send({ type: "text", value });
}

// Drops the previewed changes; the page goes back to what its source says.
export function resetEdits() {
  const { target } = useInspect.getState();
  target?.send({ type: "reset" });
  useInspect.setState({ edits: {}, text: null });
}

export function closeInspect(keepPreview = false) {
  const { target } = useInspect.getState();
  if (!keepPreview) target?.send({ type: "reset" });
  target?.send({ type: "deselect" });
  useInspect.setState({ target: null, edits: {}, text: null });
}
