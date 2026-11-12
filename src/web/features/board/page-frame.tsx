import { type Ref, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Device } from "../../../shared/board";

// The widths pages are drawn at: a common laptop, an iPad in portrait, an iPhone. Phones are where pages break.
export const DEVICE_W: Record<Device, number> = { desktop: 1280, tablet: 768, phone: 390 };

export function BarButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn("nodrag size-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5", pressed && "bg-accent text-foreground")}
    >
      {children}
    </Button>
  );
}

// A page at a real screen width, shrunk to fit its card, so a small card shows it as built instead of reflowing it. The
// page runs sandboxed and only takes clicks while its card is selected, so the board stays draggable.
export function PageFrame({
  src,
  title,
  page,
  device = "desktop",
  interactive,
  w,
  h,
  frameRef,
  onLoad,
  onGeometry,
}: {
  src: string | undefined;
  title: string;
  page: boolean;
  device?: Device;
  interactive: boolean;
  w: number;
  h: number;
  frameRef?: Ref<HTMLIFrameElement>;
  onLoad?: () => void;
  // How the page is shrunk and offset inside the card, for anything that maps a point on the page to the board.
  onGeometry?: (g: { scale: number; left: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w, h: Math.max(h - 32, 0) });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // Layout size, untouched by the canvas zoom, so the page keeps one width whatever the zoom.
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const view = device === "desktop" ? Math.max(DEVICE_W.desktop, size.w) : DEVICE_W[device];
  const scale = size.w > 0 ? Math.min(1, size.w / view) : 1;
  const left = Math.max(0, (size.w - view * scale) / 2);
  useLayoutEffect(() => onGeometry?.({ scale, left }), [onGeometry, scale, left]);
  return (
    <div ref={box} className={cn("relative min-h-0 flex-1 overflow-hidden", device !== "desktop" && "bg-muted/40")}>
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        onLoad={onLoad}
        // A PDF needs the browser's own viewer, which a sandboxed frame refuses; it carries no page script to contain.
        sandbox={page ? "allow-scripts allow-forms allow-popups allow-modals" : undefined}
        loading="lazy"
        style={
          page
            ? {
                width: view,
                height: size.h / scale,
                left,
                transform: scale < 1 ? `scale(${scale})` : undefined,
              }
            : undefined
        }
        className={cn(
          "nodrag nowheel absolute top-0 left-0 origin-top-left bg-white",
          !page && "size-full",
          device !== "desktop" && "border-x",
          !interactive && "pointer-events-none",
        )}
      />
    </div>
  );
}
