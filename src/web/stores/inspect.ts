import { create } from "zustand";

// One row of the layer tree: an element near the picked one, by the handle the page gave it.
export interface Layer {
  ref: number;
  kind: string;
  tag: string;
  text: string;
  depth: number;
  kids: number;
}

// A text style the page already uses (its first h1, h2, p…), offered as a preset the way a design file's styles are.
export interface TextStyle {
  name: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
}

export type Sizing = "fixed" | "hug" | "fill";

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
  // The values its stylesheets write (clamp(), %, em…), where the computed px would hide the intent.
  declared?: Record<string, string>;
  ref?: number;
  layers?: Layer[];
  parent?: { display: string; flexDirection: string; alignItems: string };
  sizing?: { w: Sizing; h: Sizing };
  href?: string;
  textStyles?: TextStyle[];
}

// A design token the page declares on :root, which Tweaks changes for the whole page at once.
export interface Token {
  name: string;
  value: string;
  hex?: string;
}

export type DesignTab = "properties" | "code" | "tweaks";

type Send = (msg: Record<string, unknown>) => void;

interface Inspect {
  // The frame on the board that is in pick mode, if any.
  picking: string | null;
  // The frame the design panel is open on, and the element picked in it (none yet when opened on Tweaks).
  target: { runId: string; cardId: string; app: string; el: PickedEl | null; send: Send } | null;
  tab: DesignTab;
  // Changes made in the panel, previewed on the page until the team writes them into the source.
  edits: Record<string, string>;
  text: string | null;
  attrs: Record<string, string>;
  tokens: Token[] | null;
  tokenEdits: Record<string, string>;
}

const blank = { edits: {}, text: null, attrs: {} };

export const useInspect = create<Inspect>(() => ({
  picking: null,
  target: null,
  tab: "properties",
  ...blank,
  tokens: null,
  tokenEdits: {},
}));

export function setPicking(cardId: string | null) {
  useInspect.setState({ picking: cardId });
}

export function setDesignTab(tab: DesignTab) {
  useInspect.setState({ tab });
  if (tab === "tweaks") useInspect.getState().target?.send({ type: "tokens" });
}

type Frame = Omit<NonNullable<Inspect["target"]>, "el">;

// A new frame starts clean; the same frame keeps its token tweaks while the person picks one element after another.
function onFrame(f: Frame, el: PickedEl | null, keep: boolean) {
  const now = useInspect.getState();
  const sameFrame = now.target?.cardId === f.cardId;
  const same = keep && sameFrame;
  useInspect.setState({
    target: { ...f, el: el ?? (sameFrame ? (now.target?.el ?? null) : null) },
    ...(same ? {} : blank),
    ...(sameFrame ? {} : { tokens: null, tokenEdits: {} }),
  });
}

export function pickElement(t: NonNullable<Inspect["target"]> & { el: PickedEl }, keep: boolean) {
  const first = !useInspect.getState().target;
  onFrame(t, t.el, keep);
  if (first || useInspect.getState().tab === "tweaks") useInspect.setState({ tab: "properties" });
}

// Opens the panel on a frame's Tweaks, with or without an element picked.
export function openTweaks(f: Frame) {
  onFrame(f, null, true);
  setDesignTab("tweaks");
}

export function setTokens(cardId: string, tokens: Token[]) {
  if (useInspect.getState().target?.cardId === cardId) useInspect.setState({ tokens });
}

export function editStyle(css: Record<string, string>) {
  const { target, edits } = useInspect.getState();
  if (!target?.el) return;
  useInspect.setState({ edits: { ...edits, ...css } });
  target.send({ type: "style", css });
}

export function editText(value: string) {
  const { target } = useInspect.getState();
  if (!target?.el) return;
  useInspect.setState({ text: value });
  target.send({ type: "text", value });
}

export function editAttr(name: string, value: string) {
  const { target, attrs } = useInspect.getState();
  if (!target?.el) return;
  useInspect.setState({ attrs: { ...attrs, [name]: value } });
  target.send({ type: "attr", name, value });
}

export function editToken(name: string, value: string) {
  const { target, tokenEdits } = useInspect.getState();
  if (!target) return;
  useInspect.setState({ tokenEdits: { ...tokenEdits, [name]: value } });
  target.send({ type: "tokens-set", vars: { [name]: value } });
}

export function selectLayer(ref: number) {
  useInspect.getState().target?.send({ type: "select", ref });
}

// Drops the previewed changes; the page goes back to what its source says.
export function resetEdits() {
  const { target } = useInspect.getState();
  target?.send({ type: "reset" });
  target?.send({ type: "tokens-reset" });
  useInspect.setState({ ...blank, tokenEdits: {} });
}

export function closeInspect(keepPreview = false) {
  const { target } = useInspect.getState();
  if (!keepPreview) {
    target?.send({ type: "reset" });
    target?.send({ type: "tokens-reset" });
  }
  target?.send({ type: "deselect" });
  useInspect.setState({ target: null, ...blank, tokens: null, tokenEdits: {} });
}
