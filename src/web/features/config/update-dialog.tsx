import { ArrowRight, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { OutboundLink } from "@/components/outbound-link";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useRuns } from "@/stores/runs";
import { loadSettings, saveSettings, useSettings } from "@/stores/settings";
import { installUpdate, loadUpdates, useUpdates } from "@/stores/updates";

const tu = t.update;
// As often as the server asks GitHub; this only reads the server's cached answer.
const REFRESH = 15 * 60 * 1000;

function AutoCheck() {
  const settings = useSettings((s) => s.settings);
  useEffect(() => {
    if (!useSettings.getState().settings) void loadSettings();
  }, []);
  if (!settings) return null;
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <label htmlFor="update-auto">{tu.auto}</label>
      <Switch
        id="update-auto"
        checked={settings.checkUpdates}
        onCheckedChange={(checkUpdates) => void saveSettings({ ...settings, checkUpdates })}
      />
    </div>
  );
}

function Progress() {
  const info = useUpdates((s) => s.info);
  const stage = info?.stage === "verifying" || info?.stage === "restarting" ? info.stage : "downloading";
  const share = stage === "downloading" ? info?.progress : null;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="satgas-shimmer">{tu[stage]}</span>
        {share != null && <span className="text-xs text-muted-foreground tabular-nums">{Math.round(share * 100)}%</span>}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-left rounded-full bg-signal transition-transform duration-300"
          style={{ transform: `scaleX(${share ?? (stage === "downloading" ? 0.04 : 1)})` }}
        />
      </div>
    </div>
  );
}

function UpdateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const info = useUpdates((s) => s.info);
  const target = useUpdates((s) => s.target);
  const error = useUpdates((s) => s.error);
  if (!info?.latest) return null;
  const working = !!target;
  const source = info.mode === "source";
  return (
    <Dialog open={open} onOpenChange={(o) => !working && onOpenChange(o)}>
      <DialogContent className="gap-4 sm:max-w-lg" showCloseButton={!working}>
        <DialogHeader className="text-start">
          <DialogTitle>{tu.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
            v{info.current}
            <ArrowRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">v{info.latest}</span>
          </DialogDescription>
        </DialogHeader>

        {working ? (
          <Progress />
        ) : (
          <>
            <div className="max-h-56 overflow-y-auto rounded-xl bg-muted/50 p-3 text-sm">
              {info.notes.trim() ? <Markdown text={info.notes} /> : <p className="text-muted-foreground">{tu.noNotes}</p>}
            </div>
            {source ? (
              <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                <p>{tu.source}</p>
                <code className="rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
                  git pull && bun install && bun run build
                </code>
              </div>
            ) : (
              <p className={cn("text-sm", info.busy ? "text-foreground" : "text-muted-foreground")}>
                {info.busy ? tu.busy : tu.restartNote}
              </p>
            )}
            <AutoCheck />
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            <RichText text={error} />
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          {info.url ? (
            <OutboundLink
              href={info.url}
              className="rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {tu.notes}
            </OutboundLink>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={working} onClick={() => onOpenChange(false)}>
              {t.integrations.cancel}
            </Button>
            {!source && (
              <Button disabled={working || info.busy} onClick={() => void installUpdate()}>
                <Download />
                {tu.now}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The sidebar's notice; it takes the star card's place, so only one thing asks for attention at a time.
export function UpdateButton() {
  const info = useUpdates((s) => s.info);
  const cloud = useRuns((s) => !!s.config.cloud);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Satgas Cloud updates its workspaces itself, so there is nothing to ask GitHub.
    if (cloud) return;
    void loadUpdates();
    const timer = setInterval(() => void loadUpdates(), REFRESH);
    return () => clearInterval(timer);
  }, [cloud]);
  if (cloud || !info?.available) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`v${info.current} → v${info.latest}`}
        className="flex h-8 w-full items-center gap-2 rounded-lg border bg-card px-2.5 text-[13px] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      >
        <Download className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate group-data-[collapsible=icon]:sr-only">{tu.available}</span>
        <span aria-hidden="true" className="ms-auto size-1.5 shrink-0 rounded-full bg-signal group-data-[collapsible=icon]:hidden" />
      </button>
      <UpdateDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export const useUpdateAvailable = () => useUpdates((s) => !!s.info?.available);

// About's row: where this copy stands, with the check people can run themselves.
export function UpdateStatus() {
  const info = useUpdates((s) => s.info);
  const checking = useUpdates((s) => s.checking);
  const cloud = useRuns((s) => !!s.config.cloud);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!cloud && !useUpdates.getState().info) void loadUpdates();
  }, [cloud]);
  if (cloud) return <span className="font-sans">{tu.managed}</span>;
  const state = !info
    ? ""
    : info.available
      ? tu.newer(info.latest ?? "")
      : info.check === "ok"
        ? tu.upToDate
        : info.check === "none"
          ? tu.noRelease
          : info.check === "failed"
            ? tu.checkFailed
            : tu.notChecked;
  return (
    <span className="inline-flex items-center gap-2 font-sans">
      <span className={cn(info?.check === "failed" && "text-destructive")}>{state}</span>
      {info?.available ? (
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setOpen(true)}>
          {tu.now}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={checking}
          onClick={() => void loadUpdates(true)}
        >
          {checking ? tu.checking : tu.check}
        </Button>
      )}
      <UpdateDialog open={open} onOpenChange={setOpen} />
    </span>
  );
}
