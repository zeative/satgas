import { Quote, TextQuote, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { create } from "zustand";
import { t } from "@/i18n";
import { MAX_QUOTES, QUOTE_MAX } from "@/lib/quote";
import { cn } from "@/lib/utils";

// Passages cited per board, waiting for the next message; they leave with it.
const useQuotes = create<Record<string, string[]>>(() => ({}));
const NONE: string[] = [];

export const useBoardQuotes = (runId: string) => useQuotes((s) => s[runId] ?? NONE);

export function addQuote(runId: string, text: string) {
  const q = text.trim().slice(0, QUOTE_MAX);
  if (!q) return;
  useQuotes.setState((s) => ({ [runId]: [...(s[runId] ?? []).filter((x) => x !== q), q].slice(-MAX_QUOTES) }));
}

export const removeQuote = (runId: string, i: number) =>
  useQuotes.setState((s) => ({ [runId]: (s[runId] ?? []).filter((_, j) => j !== i) }));

export const clearQuotes = (runId: string) => useQuotes.setState({ [runId]: [] });

interface Spot {
  x: number;
  y: number;
  below: boolean;
  text: string;
  // Cited from a dialog: the composer sits behind it, so the person hears it was added instead.
  inDialog: boolean;
}

// The places whose text can be cited are marked data-cite: the conversation and an expanded card.
const citable = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest("[data-cite]");

// Text selected where citing makes sense gets a Cite button above it; one per board page, wherever the text is.
export function CiteButton({ runId }: { runId: string }) {
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    const place = () => {
      const sel = document.getSelection();
      const range = sel && !sel.isCollapsed && sel.rangeCount ? sel.getRangeAt(0) : null;
      const text = sel?.toString().trim();
      const area = range && citable(range.commonAncestorContainer);
      if (!range || !text || !area) return setSpot(null);
      const rects = range.getClientRects();
      const first = rects[0] ?? range.getBoundingClientRect();
      // Near the area's top edge there is no room above the selection, so the button drops below its last line.
      const below = first.top < area.getBoundingClientRect().top + 40;
      const anchor = below ? (rects[rects.length - 1] ?? first) : first;
      const x = Math.min(Math.max(anchor.left + anchor.width / 2, 48), window.innerWidth - 48);
      setSpot({ x, y: below ? anchor.bottom + 8 : anchor.top - 8, below, text, inDialog: !!area.closest("[role=dialog]") });
    };
    // Placed when a drag or a keyboard selection ends, so it does not chase the pointer mid-drag.
    const settle = () => requestAnimationFrame(place);
    const hide = () => {
      if (document.getSelection()?.isCollapsed) setSpot(null);
    };
    document.addEventListener("pointerup", settle);
    document.addEventListener("keyup", settle);
    document.addEventListener("scroll", place, { capture: true, passive: true });
    document.addEventListener("selectionchange", hide);
    return () => {
      document.removeEventListener("pointerup", settle);
      document.removeEventListener("keyup", settle);
      document.removeEventListener("scroll", place, { capture: true });
      document.removeEventListener("selectionchange", hide);
    };
  }, []);

  if (!spot) return null;
  const cite = () => {
    addQuote(runId, spot.text);
    document.getSelection()?.removeAllRanges();
    setSpot(null);
    const field = document.getElementById("next-prompt");
    if (field && !spot.inDialog) return field.focus();
    // The chat is closed or covered: it opens behind, and the person is told the passage waits there.
    window.dispatchEvent(new Event("satgas:open-chat"));
    toast.success(t.cite.added);
  };
  return createPortal(
    <button
      type="button"
      data-cite-button
      style={{ left: spot.x, top: spot.y }}
      // Keeps the selection alive through the press, so the click still knows what was picked.
      onPointerDown={(e) => e.preventDefault()}
      onClick={cite}
      // A modal dialog turns off pointer events on the page around it; this button sits outside it and must stay live.
      // A modal dialog turns off pointer events around it; this button lives outside it and must stay pressable.
      className={cn(
        "pointer-events-auto fixed z-[60] flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-md bg-foreground ps-2 pe-2.5 text-xs font-medium text-background shadow-md transition-[background-color,scale] hover:bg-[color-mix(in_oklch,var(--foreground)_85%,var(--background))] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.97]",
        !spot.below && "-translate-y-full",
      )}
    >
      <Quote className="size-3.5" aria-hidden="true" />
      {t.cite.cite}
    </button>,
    document.body,
  );
}

// The cited passages on top of the composer, each one removable before sending.
export function QuoteChips({ runId }: { runId: string }) {
  const quotes = useBoardQuotes(runId);
  if (!quotes.length) return null;
  return (
    <ul aria-label={t.cite.quoted} className="flex flex-col gap-1 px-2.5 pt-2.5">
      {quotes.map((q, i) => (
        <li key={q} className="flex items-start gap-2 rounded-lg bg-muted py-1.5 ps-2.5 pe-1 text-xs text-muted-foreground">
          <TextQuote className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap">{q}</p>
          <button
            type="button"
            onClick={() => removeQuote(runId, i)}
            aria-label={t.cite.remove}
            title={t.cite.remove}
            className="flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
