// Bare http(s) URLs in plain text, minus trailing punctuation that ends the sentence rather than the link.
const URL_RE = /https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/g;
// Signed or tokened URLs break when a parameter is added, so they go out untouched.
const SIGNED = /[?&](x-amz-[a-z-]+|signature|sig|token|access_token|expires|key)=/i;
const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]$)|\.local$/;

// What sites see as the source of a visit from Satgas.
export const REF = "satgas.id";

// Where an outgoing link really points: the same address with ref=satgas, so the site can tell where its visitor
// came from. Only the target changes; the text on screen stays as written.
export function withRef(href: string, self = typeof location === "undefined" ? "" : location.hostname): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (!/^https?:$/.test(url.protocol)) return href;
  if (url.searchParams.has("ref") || SIGNED.test(url.search) || LOCAL.test(url.hostname) || url.hostname === self) return href;
  url.searchParams.set("ref", REF);
  return url.toString();
}

export type LinkPart = { text: string; href?: string };

export function splitLinks(text: string): LinkPart[] {
  const out: LinkPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], href: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
