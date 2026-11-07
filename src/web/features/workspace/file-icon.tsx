import {
  Atom,
  Braces,
  CodeXml,
  Database,
  File,
  FileText,
  Hash,
  Image,
  Lock,
  type LucideIcon,
  Settings2,
  Table2,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Each hue is drawn for both themes; the dark ones follow VS Code's default Seti icons.
const BLUE = "text-[#2f74b5] dark:text-[#519aba]";
const YELLOW = "text-[#9a7f00] dark:text-[#cbcb41]";
const ORANGE = "text-[#c2570c] dark:text-[#e37933]";
const PURPLE = "text-[#7c4dbd] dark:text-[#a074c4]";
const GREEN = "text-[#3f8f29] dark:text-[#8dc149]";
const RED = "text-[#c43c3c] dark:text-[#cc3e44]";
const GRAY = "text-muted-foreground";

type Mark = { icon?: LucideIcon; text?: string; tone: string };

const BY_EXT: Record<string, Mark> = {
  ts: { text: "TS", tone: BLUE },
  mts: { text: "TS", tone: BLUE },
  cts: { text: "TS", tone: BLUE },
  js: { text: "JS", tone: YELLOW },
  mjs: { text: "JS", tone: YELLOW },
  cjs: { text: "JS", tone: YELLOW },
  tsx: { icon: Atom, tone: BLUE },
  jsx: { icon: Atom, tone: BLUE },
  json: { icon: Braces, tone: YELLOW },
  css: { icon: Hash, tone: BLUE },
  scss: { icon: Hash, tone: PURPLE },
  html: { icon: CodeXml, tone: ORANGE },
  md: { text: "MD", tone: BLUE },
  mdx: { text: "MD", tone: BLUE },
  py: { text: "PY", tone: BLUE },
  go: { text: "GO", tone: BLUE },
  rs: { text: "RS", tone: ORANGE },
  sh: { icon: Terminal, tone: GREEN },
  zsh: { icon: Terminal, tone: GREEN },
  bash: { icon: Terminal, tone: GREEN },
  sql: { icon: Database, tone: YELLOW },
  csv: { icon: Table2, tone: GREEN },
  tsv: { icon: Table2, tone: GREEN },
  xlsx: { icon: Table2, tone: GREEN },
  pdf: { icon: FileText, tone: RED },
  png: { icon: Image, tone: PURPLE },
  jpg: { icon: Image, tone: PURPLE },
  jpeg: { icon: Image, tone: PURPLE },
  gif: { icon: Image, tone: PURPLE },
  webp: { icon: Image, tone: PURPLE },
  avif: { icon: Image, tone: PURPLE },
  svg: { icon: Image, tone: PURPLE },
  ico: { icon: Image, tone: PURPLE },
  yml: { icon: Settings2, tone: PURPLE },
  yaml: { icon: Settings2, tone: PURPLE },
  toml: { icon: Settings2, tone: GRAY },
  ini: { icon: Settings2, tone: GRAY },
  env: { icon: Settings2, tone: GRAY },
  lock: { icon: Lock, tone: GRAY },
};

const markOf = (name: string): Mark => {
  const lower = name.toLowerCase();
  if (lower.startsWith(".env")) return { icon: Settings2, tone: GRAY };
  if (lower.startsWith(".git") || lower === "tsbuildinfo" || lower.endsWith(".tsbuildinfo")) return { icon: Settings2, tone: GRAY };
  return BY_EXT[lower.slice(lower.lastIndexOf(".") + 1)] ?? { icon: File, tone: GRAY };
};

// A file's kind at a glance, in a fixed 16px box so every name starts on one line. `muted` drops the colour where
// something else in the row already carries one, such as a change's letter.
export function FileIcon({ name, muted }: { name: string; muted?: boolean }) {
  const { icon: Icon, text, tone } = markOf(name);
  return (
    <span aria-hidden="true" className={cn("flex size-4 shrink-0 items-center justify-center", muted ? GRAY : tone)}>
      {Icon ? (
        <Icon className="size-3.5" strokeWidth={1.75} />
      ) : (
        <span className="font-mono text-[9px] leading-none font-bold">{text}</span>
      )}
    </span>
  );
}
