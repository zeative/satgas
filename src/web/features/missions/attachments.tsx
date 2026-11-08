import { Eye, EyeOff, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImageZoom } from "@/components/image-zoom";
import { t } from "@/i18n";
import type { Draft, DraftFile } from "@/lib/drafts";
import { MAX_FILES } from "@/lib/drafts";
import { cn } from "@/lib/utils";
import { useSettings } from "@/stores/settings";
import { isPicture } from "../../../shared/types";

const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? name
        .slice(dot + 1)
        .toUpperCase()
        .slice(0, 5)
    : "";
};

// Files dropped, pasted or picked into a composer; refusals are said once, in plain words.
export async function attach(draft: Draft, files: File[]) {
  if (!files.length) return;
  const { tooBig, dropped } = await draft.addFiles(files);
  if (tooBig.length) toast.error(t.attach.tooBig(tooBig.join(", ")));
  if (dropped) toast.error(t.attach.tooMany(MAX_FILES));
}

// Drag-and-drop and paste for a composer: files only, so dragging text or pasting words behaves as usual.
export function useFileDrop(draft: Draft) {
  const [over, setOver] = useState(false);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  return {
    over,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        // The board under the chat would otherwise take the drop as an image card too.
        e.stopPropagation();
        setOver(false);
        void attach(draft, [...e.dataTransfer.files]);
      },
      onPaste: (e: React.ClipboardEvent) => {
        const files = [...e.clipboardData.files];
        if (!files.length) return;
        e.preventDefault();
        void attach(draft, files);
      },
    },
  };
}

// Claude-style tiles above the message: a thumbnail for images, name, lines and type for everything else.
export function AttachmentTiles({ files, onRemove, compact }: { files: DraftFile[]; onRemove: (id: string) => void; compact?: boolean }) {
  if (!files.length) return null;
  return (
    <ul aria-label={t.attach.label} className={cn("flex gap-2 overflow-x-auto", compact ? "px-2 pt-2" : "px-3 pt-3")}>
      {files.map((f) => (
        <li key={f.id} className="shrink-0">
          <Tile file={f} onRemove={() => onRemove(f.id)} compact={compact} />
        </li>
      ))}
    </ul>
  );
}

function Tile({ file, onRemove, compact }: { file: DraftFile; onRemove: () => void; compact?: boolean }) {
  const image = file.type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);
  // Made inside the effect so a remount (StrictMode, list reorder) never reuses a revoked URL.
  useEffect(() => {
    if (!image) return;
    const next = URL.createObjectURL(file.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image, file.blob]);
  const ext = extOf(file.name);
  return (
    <div className={cn("group relative overflow-hidden rounded-xl border bg-muted/40", compact ? "size-24" : "size-30")} title={file.name}>
      {image ? (
        url && (
          <ImageZoom src={url} name={file.name}>
            <button
              type="button"
              aria-label={t.attach.view(file.name)}
              className="block size-full cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            >
              <img src={url} alt="" className="size-full object-cover" />
            </button>
          </ImageZoom>
        )
      ) : (
        <div className="flex size-full flex-col gap-1 p-2.5">
          <p className="line-clamp-2 text-sm leading-5 font-medium break-all">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {file.lines ? t.attach.lines(file.lines) : <FileText className="size-3.5" aria-hidden="true" />}
          </p>
          {ext && (
            <span className="mt-auto self-start rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
              {ext}
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t.attach.remove(file.name)}
        className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full border bg-background/90 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:none)]:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

interface SightInfo {
  // The model that cannot see attached images, or null when every agent can.
  blind: string | null;
  // Who reads them for it, or null when no strong vision model is connected.
  reader: string | null;
}

// One answer per agent setup, shared by every composer; asked only once an image is attached.
const sightCache = new Map<string, Promise<SightInfo | null>>();

export function useSight(files: DraftFile[]): SightInfo | null {
  const hasImage = files.some((f) => isPicture(f.name));
  const agents = useSettings((s) => s.settings?.agents);
  const key = JSON.stringify([
    agents?.claude.provider,
    agents?.claude.model,
    agents?.codex.provider,
    agents?.codex.model,
    agents?.codex.tasks,
  ]);
  const [answer, setAnswer] = useState<{ key: string; info: SightInfo | null } | null>(null);
  useEffect(() => {
    if (!hasImage || !agents) return;
    let alive = true;
    let ask = sightCache.get(key);
    if (!ask) {
      ask = fetch("/api/vision")
        .then((r) => (r.ok ? (r.json() as Promise<SightInfo>) : null))
        .catch(() => null);
      sightCache.set(key, ask);
    }
    void ask.then((info) => alive && setAnswer({ key, info }));
    return () => {
      alive = false;
    };
  }, [hasImage, agents, key]);
  return hasImage && answer?.key === key ? answer.info : null;
}

// Said under the tiles only when an agent cannot see images: who reads them instead, or that nobody can.
export function SightNote({ sight, compact }: { sight: SightInfo | null; compact?: boolean }) {
  if (!sight?.blind) return null;
  const Icon = sight.reader ? Eye : EyeOff;
  const text = sight.reader ? t.attach.readBy(sight.blind, sight.reader) : t.attach.cannotSee(sight.blind);
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", compact ? "px-3 pt-2" : "px-4 pt-2.5")} title={text}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </p>
  );
}
