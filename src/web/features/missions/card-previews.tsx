import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { kindName, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Card } from "../../../shared/board";
import { cardLabel } from "../../../shared/refs";
import type { Run } from "../../../shared/types";
import { CardBody } from "../board/cards";
import { type BoardApi, BoardContext } from "../board/context";
import { KIND_ICON } from "./token-field";

const SHOWN = 4;
// Readable without scrolling the chat away: tall enough for a table or a page, never taller than a screenful.
const HEIGHT = 260;
const MAX_IMAGE = 420;
// Kinds that only read; their scroll and links stay usable here. Pages and widgets act, so they act on the canvas.
const READS = new Set<Card["kind"]>(["doc", "table", "code", "files", "note", "text", "image"]);
const noop = () => {};

// In Chat Only, what a round made shows in the chat at a size to read, each with the way to its place on the canvas.
export function CardPreviews({ run, cards, onOpen }: { run: Run; cards: Card[]; onOpen: (cardId?: string) => void }) {
  const api = useMemo<BoardApi>(
    () => ({ runId: run.id, fileKey: run.fileKey, commit: noop, setEditingId: noop, expand: noop, hasCard: () => true }),
    [run.id, run.fileKey],
  );
  const shown = cards.filter((c) => c.kind !== "drawing" && c.kind !== "frame").slice(0, SHOWN);
  const rest = cards.length - shown.length;
  return (
    <BoardContext value={api}>
      <div className="flex flex-col gap-3">
        {shown.map((c) => {
          const Icon = KIND_ICON[c.kind];
          const reads = READS.has(c.kind) && c.kind !== "image";
          const height = c.kind === "image" ? Math.min(MAX_IMAGE, Math.round((c.h / c.w) * 640)) : HEIGHT;
          return (
            <figure key={c.id} className="flex flex-col gap-1.5">
              <figcaption className="flex h-6 items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{cardLabel(c) || kindName(c)}</span>
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="ms-auto flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t.view.openOnCanvas}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </button>
              </figcaption>
              {/* Text kinds take their own height up to the cap and scroll past it; pages and widgets keep a fixed box. */}
              <div
                style={reads ? { maxHeight: height } : { height }}
                className={cn("rounded-xl border bg-card text-card-foreground", reads ? "overflow-auto" : "overflow-hidden")}
              >
                <div className={cn("size-full", !READS.has(c.kind) && "pointer-events-none")}>
                  <CardBody card={c} />
                </div>
              </div>
            </figure>
          );
        })}
        {rest > 0 && (
          <button
            type="button"
            onClick={() => onOpen()}
            className="flex h-7 items-center gap-1 self-start rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t.view.more(rest)}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </BoardContext>
  );
}
