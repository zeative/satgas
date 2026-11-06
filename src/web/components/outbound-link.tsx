import type { ComponentProps } from "react";
import { withRef } from "@/lib/links";

// Every link that leaves Satgas goes through here: a new tab, no opener, and ref=satgas on the address.
// tests/web/outbound-links.test.ts fails on any target="_blank" or window.open written elsewhere.
export function OutboundLink({ href, ...props }: Omit<ComponentProps<"a">, "target" | "rel">) {
  return <a {...props} href={href && withRef(href)} target="_blank" rel="noopener noreferrer" />;
}

export function openExternal(url: string | undefined) {
  if (url) window.open(withRef(url), "_blank", "noopener");
}
