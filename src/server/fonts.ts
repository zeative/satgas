import mono400 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2" with { type: "file" };
import mono500 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2" with { type: "file" };
import mono400Ext from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-400-normal.woff2" with { type: "file" };
import mono500Ext from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-500-normal.woff2" with { type: "file" };
import sansLatinExt from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-ext-wght-normal.woff2" with { type: "file" };
import sansLatin from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2" with { type: "file" };

// Served as separate, immutable files (and embedded in the compiled binary) instead of being inlined into the CSS bundle.
const files: Record<string, string> = {
  "plex-sans-latin.woff2": sansLatin,
  "plex-sans-latin-ext.woff2": sansLatinExt,
  "plex-mono-400-latin.woff2": mono400,
  "plex-mono-400-latin-ext.woff2": mono400Ext,
  "plex-mono-500-latin.woff2": mono500,
  "plex-mono-500-latin-ext.woff2": mono500Ext,
};

export function serveFont(name: string): Response {
  const path = files[name];
  if (!path) return Response.json({ error: "Not found." }, { status: 404 });
  return new Response(Bun.file(path), {
    headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" },
  });
}
