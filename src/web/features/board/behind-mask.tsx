import { memo } from "react";

export interface MaskRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  frame: boolean;
}

// What shows of a thread where it passes behind a card: a trace, so the eye follows cards, not the lines under them.
const BEHIND = "#333";
const FAR = 1_000_000;

// Masks in board space that dim a thread wherever it runs under a card. "satgas-behind" also covers frames, for the
// card threads that cross other groups; "satgas-behind-cards" leaves frames clear, so a link between two cards inside
// one frame stays whole.
export const BehindMask = memo(function BehindMask({ rects }: { rects: MaskRect[] }) {
  const holes = (withFrames: boolean) =>
    rects
      .filter((r) => withFrames || !r.frame)
      .map((r) => <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} rx={12} fill={BEHIND} />);
  const mask = (id: string, withFrames: boolean) => (
    <mask id={id} maskUnits="userSpaceOnUse" x={-FAR} y={-FAR} width={FAR * 2} height={FAR * 2}>
      <rect x={-FAR} y={-FAR} width={FAR * 2} height={FAR * 2} fill="white" />
      {holes(withFrames)}
    </mask>
  );
  return (
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
      <defs>
        {mask("satgas-behind", true)}
        {mask("satgas-behind-cards", false)}
      </defs>
    </svg>
  );
});
