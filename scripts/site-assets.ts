// Copies what the landing page in site/ shows from the app itself: its fonts, the brands' own logos and the team's drawn
// faces (DiceBear Notionists, CC0), so the page and the product look the same. Run: bun scripts/site-assets.ts
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAvatar } from "@dicebear/core";
import * as notionists from "@dicebear/notionists";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "site/assets");
const FACES = ["lead", "dewi", "raka", "sinta", "bima"];
const LOGOS = [
  "claude.svg",
  "codex.svg",
  "openai.png",
  "deepseek.svg",
  "qwen-color.svg",
  "openrouter.png",
  "ollama.png",
  "zai.png",
  "groq.svg",
  "lmstudio.png",
  "github.png",
  "gitlab.png",
  "notion.png",
  "linear.png",
  "vercel.png",
  "supabase.png",
  "sentry.png",
  "zapier.png",
  "plane.png",
  "posthog.png",
  "cloudflare.jpg",
  "neon.png",
  "telegram.svg",
  "whatsapp.svg",
  "repliz.png",
  "airtable.png",
];

await mkdir(join(OUT, "faces"), { recursive: true });
await mkdir(join(OUT, "brands"), { recursive: true });
await mkdir(join(OUT, "fonts"), { recursive: true });
for (const seed of FACES) await writeFile(join(OUT, "faces", `${seed}.svg`), createAvatar(notionists, { seed }).toString());
for (const logo of LOGOS) await copyFile(join(ROOT, "src/web/public/brands", logo), join(OUT, "brands", logo));
await copyFile(join(ROOT, "src/web/public/icon.svg"), join(OUT, "icon.svg"));
await copyFile(join(ROOT, "docs/dcloud-dark.svg"), join(OUT, "dcloud.svg"));
for (const [pkg, file] of [
  ["inter", "inter-latin-wght-normal.woff2"],
  ["sora", "sora-latin-wght-normal.woff2"],
] as const)
  await copyFile(join(ROOT, `node_modules/@fontsource-variable/${pkg}/files/${file}`), join(OUT, "fonts", file));
console.log(`Wrote ${FACES.length} faces, ${LOGOS.length} logos and 2 fonts to site/assets`);
