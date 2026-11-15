import { Check, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtAgo, t } from "@/i18n";
import { sendBoardOps, sendPrompt } from "@/stores/runs";
import type { Card, Pin } from "../../../shared/board";
import { randomUuid } from "../../../shared/random-uuid";

const tp = t.board.pins;

export type PinRects = Record<string, [number, number, number, number]>;

// What the team gets for one pinned comment: the page, the element as it read, and how to find it.
export function pinPrompt(app: string, pin: Pin): string {
  return [
    `A comment pinned on the \`${app}\` app, page \`${pin.route}\`, on ${pin.label ? `"${pin.label}"` : "an element"} (selector \`${pin.selector}\`):`,
    "",
    pin.text,
    "",
    "Change it in the source, in the project's own styling, and check the page in the browser afterwards.",
  ].join("\n");
}

const patchPins = (runId: string, card: Card, pins: Pin[]) =>
  void sendBoardOps(runId, [{ op: "patch", id: card.id, patch: { pins: pins.length ? pins : null } as Partial<Card> }]);

// Comments pinned to elements of the page a frame shows: a numbered marker at each element's top-right corner, one
// size on screen at any zoom, opening to the comment with ways to send it to the team, close it or delete it.
export function PinLayer({
  runId,
  card,
  app,
  route,
  rects,
  scale,
}: {
  runId: string;
  card: Card;
  app: string;
  route: string;
  rects: PinRects;
  scale: number;
}) {
  const pins = (card.pins ?? []).filter((p) => p.route === route && !p.done);
  if (!pins.length) return null;
  const all = card.pins ?? [];
  const update = (id: string, patch: Partial<Pin>) =>
    patchPins(
      runId,
      card,
      all.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      {pins.map((pin) => {
        const r = rects[pin.id];
        if (!r) return null;
        const n = all.indexOf(pin) + 1;
        return (
          // A zero-size anchor on the element's top-right corner; the marker's tail sits on it at any zoom.
          <div key={pin.id} className="absolute size-0" style={{ left: (r[0] + r[2]) * scale, top: r[1] * scale }}>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={tp.open(n)}
                  title={pin.text}
                  className="satgas-pin nodrag pointer-events-auto absolute bottom-0 left-0 flex size-6 items-center justify-center rounded-full rounded-bl-none bg-foreground text-[11px] font-semibold text-background shadow-md ring-2 ring-background focus-visible:ring-ring focus-visible:outline-none"
                >
                  {n}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="nodrag w-72 p-0 text-sm">
                <div className="flex flex-col gap-1 p-3">
                  <p className="truncate text-xs text-muted-foreground" title={pin.selector}>
                    {pin.label || pin.selector} · {fmtAgo(pin.at)}
                  </p>
                  <p className="whitespace-pre-wrap">{pin.text}</p>
                  {pin.sentAt && <p className="text-xs text-muted-foreground">{tp.sent}</p>}
                </div>
                <div className="flex items-center gap-1 border-t p-1.5">
                  <Button
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                    disabled={!!pin.sentAt}
                    onClick={() =>
                      sendPrompt(runId, pinPrompt(app, pin), [], [card.id])
                        .then(() => {
                          update(pin.id, { sentAt: Date.now() });
                          toast.success(tp.sentToast);
                        })
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    <Send className="size-3.5" aria-hidden="true" />
                    {tp.send}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => update(pin.id, { done: true })}>
                    <Check className="size-3.5" aria-hidden="true" />
                    {tp.resolve}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={tp.remove}
                    title={tp.remove}
                    className="ms-auto size-7 text-muted-foreground hover:text-destructive [&_svg]:size-3.5"
                    onClick={() =>
                      patchPins(
                        runId,
                        card,
                        all.filter((p) => p.id !== pin.id),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      })}
    </div>
  );
}

// A new pin from the design panel, on the element it has picked.
export function addPin(runId: string, card: Card, pin: Omit<Pin, "id" | "at">) {
  const next: Pin = { ...pin, id: randomUuid().slice(0, 12), at: Date.now() };
  patchPins(runId, card, [...(card.pins ?? []), next]);
  return next;
}

export const pinCount = (card: Card | undefined) => (card?.pins ?? []).filter((p) => !p.done).length;
