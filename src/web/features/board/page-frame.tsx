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
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
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
      className={cn(
        "nodrag size-6 rounded-md text-muted-foreground hover:text-foreground [&_svg]:size-3.5",
        pressed && "bg-accent text-foreground",
        className,
      )}
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
  inset = 32,
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
  // How much of the card a bar above the page takes, for the first measure before layout.
  inset?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w, h: Math.max(h - inset, 0) });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // Layout size, untouched by the canvas zoom, so the page keeps one width whatever the zoom.
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The page is laid out at its device's width and fills the frame's width, like a design file's frame: a phone page in
  // a wider card grows to fit it instead of sitting on a mat.
  const view = device === "desktop" ? Math.max(DEVICE_W.desktop, size.w) : DEVICE_W[device];
  const scale = size.w > 0 ? size.w / view : 1;
  const left = 0;
  useLayoutEffect(() => onGeometry?.({ scale, left }), [onGeometry, scale, left]);
  return (
    // While the page does not take the pointer, the frame itself is where the card is picked up and moved.
    <div ref={box} className={cn("relative min-h-0 flex-1 overflow-hidden", !interactive && "card-handle")}>
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
                transform: scale !== 1 ? `scale(${scale})` : undefined,
              }
            : undefined
        }
        className={cn(
          "nodrag nowheel absolute top-0 left-0 origin-top-left bg-white",
          !page && "size-full",
          !interactive && "pointer-events-none",
        )}
      />
    </div>
  );
}

// A frame's Play: opens the page large and live, the way a design canvas presents one screen.
export function PlayChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="nodrag flex h-[18px] shrink-0 items-center gap-1 rounded-[5px] border border-current/25 ps-1 pe-1.5 text-[10px] leading-none font-medium tracking-[0.06em] text-muted-foreground uppercase transition-colors hover:border-current/50 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
    >
      <svg viewBox="0 0 10 10" aria-hidden="true" className="size-2">
        <path d="M2.5 1.6v6.8L8.2 5z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
