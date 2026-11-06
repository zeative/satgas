export type Side = "left" | "right" | "top" | "bottom";
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Cards side by side join sideways and stacked cards join top to bottom, so a thread never doubles back over a card.
function facing(a: Box, b: Box, vertical = false): Side {
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  // A thread hanging down a tree drops whenever the other end sits above or below, even when it is off to one side.
  if (vertical && gapY > 0) return dy < 0 ? "top" : "bottom";
  // Overlapping both ways: whichever axis they are further apart on, relative to their size.
  const sideways = gapX > 0 || (gapY <= 0 && Math.abs(dx) / (a.w + b.w) >= Math.abs(dy) / (a.h + b.h));
  if (sideways) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

function anchor(box: Box, side: Side): [number, number] {
  if (side === "left") return [box.x, box.y + box.h / 2];
  if (side === "right") return [box.x + box.w, box.y + box.h / 2];
  if (side === "top") return [box.x + box.w / 2, box.y];
  return [box.x + box.w / 2, box.y + box.h];
}

// Where a connector from `a` to `b` leaves and lands: the middle of the sides that face each other.
export function connectorEnds(a: Box, b: Box, vertical = false) {
  const from = facing(a, b, vertical);
  const to = facing(b, a, vertical);
  const [sx, sy] = anchor(a, from);
  const [tx, ty] = anchor(b, to);
  return { sx, sy, from, tx, ty, to };
}
