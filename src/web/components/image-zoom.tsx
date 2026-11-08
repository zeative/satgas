import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ExternalLink, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { OutboundLink } from "@/components/outbound-link";
import { t } from "@/i18n";

// A picture in the chat or composer opens large over the page, like a chat app does, instead of in another tab.
// `href` keeps the original one click away when there is a file to open.
export function ImageZoom({ src, name, href, children }: { src: string; name: string; href?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>{children}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // The content covers the screen, so a click beside the picture closes it the way a click on a backdrop would.
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-12"
        >
          <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>
          <img src={src} alt={name} className="max-h-[calc(100dvh-7rem)] max-w-full rounded-lg object-contain shadow-2xl" />
          <div className="flex max-w-full items-center gap-3 text-xs text-white/70">
            <span className="min-w-0 truncate">{name}</span>
            {href && (
              <OutboundLink
                href={href}
                className="flex shrink-0 items-center gap-1 rounded transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {t.attach.openOriginal}
              </OutboundLink>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label={t.close}
            className="fixed top-4 right-4 flex size-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
