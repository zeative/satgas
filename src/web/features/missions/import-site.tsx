import { Globe } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import type { Draft } from "@/lib/drafts";
import { attach } from "./attachments";

const ti = t.importSite;

// Never start from scratch: a site the person names comes in as a picture of how it looks today, attached to the brief,
// with a line that tells the team what it is. They rebuild or redesign it from there.
export function ImportSite({
  open,
  onOpenChange,
  draft,
  onBrief,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Draft;
  // Puts the brief in the composer the way a template does, with its {sample} selected to type over.
  onBrief: (prompt: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? ti.failed);
      const href = decodeURI(res.headers.get("x-satgas-url") ?? "") || url.trim();
      const host = new URL(href).hostname.replace(/^www\./, "");
      await attach(draft, [new File([await res.blob()], `${host}.png`, { type: "image/png" })]);
      if (draft.text.trim()) draft.setText(`${draft.text.trimEnd()}\n\n${ti.line(href)}`);
      else onBrief(ti.brief(href));
      setUrl("");
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ti.title}</DialogTitle>
          <DialogDescription>{ti.lead}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            // Rendered in a portal but still inside the composer's form in React, whose submit would send the brief.
            e.stopPropagation();
            void run();
          }}
        >
          <div className="relative">
            <Globe
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              // biome-ignore lint/a11y/noAutofocus: the dialog opens to take this one address.
              autoFocus
              type="url"
              inputMode="url"
              aria-label={ti.field}
              placeholder="kopisenja.id"
              value={url}
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby={error ? "import-site-error" : undefined}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              className="ps-8"
            />
          </div>
          {error && (
            <p id="import-site-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? ti.working : ti.action}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
