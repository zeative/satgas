import { useRef, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { clampPanel, PANEL_DEFAULT, PANEL_MIN, setPanelWidth, usePanel } from "@/stores/panel";

const STEP = 16;

// The side panel's left edge: drag it, or focus it and use the arrow keys; a double-click puts the default width back.
export function PanelResizer() {
  const width = usePanel((s) => s.width);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: 0 });

  const end = () => {
    setDragging(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    setPanelWidth(usePanel.getState().width);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable splitter has no native element; role="separator" is the ARIA pattern.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resizePanel}
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={clampPanel(Number.POSITIVE_INFINITY)}
      tabIndex={0}
      title={t.resizePanelHint}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        setDragging(true);
        // The cursor and a frozen selection hold for the whole drag, even off the handle.
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        setPanelWidth(start.current.w + start.current.x - e.clientX, false);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => setPanelWidth(PANEL_DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? STEP * 4 : STEP;
        const next =
          e.key === "ArrowLeft"
            ? width + step
            : e.key === "ArrowRight"
              ? width - step
              : e.key === "Home"
                ? PANEL_MIN
                : e.key === "End"
                  ? Number.POSITIVE_INFINITY
                  : null;
        if (next === null) return;
        e.preventDefault();
        setPanelWidth(next);
      }}
      className="group absolute inset-y-3 right-[calc(var(--panel-w)+0.75rem)] z-30 flex w-3 translate-x-1/2 cursor-col-resize touch-none justify-center focus-visible:outline-none max-lg:hidden"
    >
      <span
        aria-hidden="true"
        className={cn(
          "my-6 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-border group-focus-visible:bg-ring",
          dragging && "bg-ring group-hover:bg-ring",
        )}
      />
    </div>
  );
}
