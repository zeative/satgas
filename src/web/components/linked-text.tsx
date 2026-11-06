import { OutboundLink } from "@/components/outbound-link";
import { splitLinks } from "@/lib/links";

// Plain text with its URLs live. A link keeps the surrounding color, so it reads the same on a sticky note or a bubble.
export function LinkedText({ text }: { text: string }) {
  let at = 0;
  return (
    <>
      {splitLinks(text).map((p) => {
        const key = at;
        at += p.text.length;
        return p.href ? (
          <OutboundLink
            key={key}
            href={p.href}
            // On the canvas a press on a link opens it instead of picking up the card.
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="nodrag underline decoration-current/40 underline-offset-2 transition-colors [overflow-wrap:anywhere] hover:decoration-current focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {p.text}
          </OutboundLink>
        ) : (
          p.text
        );
      })}
    </>
  );
}
