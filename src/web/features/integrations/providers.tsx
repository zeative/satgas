import { Check, ExternalLink, Plus, RotateCw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { LogoTile } from "@/components/logo-tile";
import { OutboundLink } from "@/components/outbound-link";
import { plain, RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { lang, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { loadProviders, useProviders } from "@/stores/providers";
import { saveSettings } from "@/stores/settings";
import { PROVIDERS, type ProviderDef, type Text } from "../../../shared/providers";
import { SECRET_MASK, type Settings } from "../../../shared/settings";
import type { ProviderStatus } from "../../../shared/types";

const ti = t.integrations;
const say = (text: Text) => text[lang];

export function ProviderLogo({ def, className }: { def: ProviderDef; className?: string }) {
  return (
    <>
      <img
        src={def.logo.src}
        alt=""
        draggable={false}
        className={cn("object-contain", def.logo.icon && "rounded-[22%]", def.logo.dark && "dark:hidden", className)}
      />
      {def.logo.dark && <img src={def.logo.dark} alt="" draggable={false} className={cn("hidden object-contain dark:block", className)} />}
    </>
  );
}

export function useProviderStatus() {
  const statuses = useProviders((s) => s.statuses);
  useEffect(() => {
    if (!useProviders.getState().statuses) void loadProviders();
  }, []);
  return (kind: ProviderDef["kind"]) => statuses?.find((s) => s.kind === kind);
}

// A status told by shape and word, not by color alone.
export function StatusText({ status, wrap }: { status: ProviderStatus | undefined; wrap?: boolean }) {
  // With no answer at all, a failed request reads as failed rather than checking forever.
  const unreachable = useProviders((s) => !s.checking && !!s.error);
  if (!status)
    return (
      <span className={unreachable ? "text-destructive" : "text-muted-foreground"}>{unreachable ? ti.checkFailed : ti.checkingShort}</span>
    );
  if (status.state === "ok")
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
        {ti.connected}
      </span>
    );
  if (status.state === "failed")
    return (
      <span
        className={cn("inline-flex min-w-0 gap-1.5 text-destructive", wrap ? "items-start" : "items-center")}
        title={status.error && plain(status.error)}
      >
        <TriangleAlert className={cn("size-3 shrink-0", wrap && "mt-0.5")} aria-hidden="true" />
        <span className={wrap ? undefined : "truncate"}>
          <RichText text={status.error ?? ti.checkFailed} />
        </span>
      </span>
    );
  return <span>{ti.notConnected}</span>;
}

export function ProvidersSection({ settings }: { settings: Settings }) {
  const statusOf = useProviderStatus();
  const checking = useProviders((s) => s.checking);
  const error = useProviders((s) => s.error);
  const [open, setOpen] = useState<ProviderDef | null>(null);

  return (
    <section aria-labelledby="providers" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="providers" className="text-base font-medium">
          {ti.providers}
        </h2>
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={checking} onClick={() => void loadProviders(true)}>
          <RotateCw className={cn(checking && "animate-spin motion-reduce:animate-none")} />
          {ti.recheck}
        </Button>
      </div>
      {error && !checking && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void loadProviders(true)}>
            {t.retry}
          </Button>
        </div>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {PROVIDERS.map((def) => {
          const status = statusOf(def.kind);
          const on = status?.state === "ok";
          const inUse = settings.agents[def.runtime].provider === def.kind;
          return (
            <li key={def.kind} className="relative flex gap-4 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/80">
              <LogoTile logo={def.logo} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h3 className="text-sm font-medium">
                  {/* The whole card opens the provider; the name is the accessible target. */}
                  <button
                    type="button"
                    onClick={() => setOpen(def)}
                    className="text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    {def.name}
                  </button>
                </h3>
                <p className="text-sm text-muted-foreground">
                  <RichText text={say(def.desc)} />
                </p>
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusText status={status} />
                  {inUse && on && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0 text-foreground">{ti.inUse}</span>
                    </>
                  )}
                </p>
              </div>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  on ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "border bg-background text-foreground",
                )}
              >
                {on ? <Check className="size-4" /> : <Plus className="size-4" />}
              </span>
            </li>
          );
        })}
      </ul>
      {open && <ProviderDialog def={open} settings={settings} onClose={() => setOpen(null)} />}
    </section>
  );
}

// Connect, fix or disconnect one provider; saving re-runs its check so the result is known before the dialog closes.
export function ProviderDialog({
  def,
  settings,
  onClose,
  onConnected,
}: {
  def: ProviderDef;
  settings: Settings;
  onClose: () => void;
  onConnected?: () => void;
}) {
  const cfg = settings.providers[def.kind];
  const statusOf = useProviderStatus();
  const status = statusOf(def.kind);
  const checking = useProviders((s) => s.checking);
  // The saved key never reaches the page; leaving the field empty keeps it.
  const hasKey = !!cfg?.key;
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(cfg?.baseUrl ?? def.baseUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [test, setTest] = useState<"idle" | "testing" | "ok">("idle");
  const uid = useId();
  const inUse = settings.agents.claude.provider === def.kind || settings.agents.codex.provider === def.kind;

  const persist = async (next: Settings["providers"]) => {
    setBusy(true);
    setProblem(null);
    const refused = await saveSettings({ ...settings, providers: next });
    if (refused) {
      setBusy(false);
      return setProblem(refused);
    }
    await loadProviders(true);
    setBusy(false);
    const after = useProviders.getState().statuses?.find((s) => s.kind === def.kind);
    if (after?.state === "failed") return setProblem(`${ti.savedButFailed}: ${after.error ?? ti.checkFailed}`);
    toast.success(after?.state === "ok" ? `${def.name} · ${ti.connected}` : ti.saved);
    if (after?.state === "ok") onConnected?.();
    onClose();
  };

  const editedUrl = def.baseUrlEditable && baseUrl.trim() && baseUrl.trim() !== def.baseUrl ? baseUrl.trim() : undefined;

  // One short real message, through the values in the form, before anything is saved.
  const runTest = async () => {
    setTest("testing");
    setProblem(null);
    const res = await fetch("/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: def.kind, ...(key.trim() ? { key: key.trim() } : {}), ...(editedUrl ? { baseUrl: editedUrl } : {}) }),
    }).catch(() => null);
    const data = res?.ok ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string | null } | null) : null;
    if (data?.ok) {
      setTest("ok");
      return true;
    }
    setTest("idle");
    setProblem(data?.error ?? ti.checkFailed);
    return false;
  };

  const save = async () => {
    if (!(await runTest())) return;
    const entry = {
      ...(def.auth === "key" && key.trim() ? { key: key.trim() } : {}),
      ...(editedUrl ? { baseUrl: editedUrl } : {}),
    };
    void persist({ ...settings.providers, [def.kind]: entry });
  };

  const disconnect = () => {
    const { [def.kind]: _gone, ...rest } = settings.providers;
    void persist(rest);
  };

  const missing = def.auth === "key" && !key.trim() && !hasKey;
  const testing = test === "testing";
  const rechecking = def.auth === "cli" && checking;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && !testing && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-center gap-4 text-start">
          <LogoTile logo={def.logo} />
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle>{def.auth === "cli" ? def.name : ti.connect(def.name)}</DialogTitle>
            <DialogDescription>
              <RichText text={say(def.desc)} />
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          id={`${uid}-form`}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (def.auth === "cli") void runTest().then(() => loadProviders(true));
            else if (!missing) void save();
          }}
        >
          {def.auth === "cli" && (
            <p className="text-sm text-muted-foreground">
              <RichText text={ti.cliSignIn[def.runtime]} />
            </p>
          )}
          {def.auth === "local" && <p className="text-sm text-muted-foreground">{ti.localServer}</p>}
          {def.auth === "key" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`${uid}-key`} className="text-sm font-medium">
                  <RichText text={def.keyLabel ? say(def.keyLabel) : ti.keyLabel} />
                </label>
                {def.keyHelp && (
                  <OutboundLink
                    href={def.keyHelp}
                    className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {ti.getKey}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </OutboundLink>
                )}
              </div>
              <Input
                id={`${uid}-key`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
                value={key}
                placeholder={hasKey ? SECRET_MASK : undefined}
                onChange={(e) => setKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{hasKey ? ti.keySaved : ti.keyStored}</p>
            </div>
          )}
          {def.baseUrlEditable && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-url`} className="text-sm font-medium">
                {ti.endpoint}
              </label>
              <Input
                id={`${uid}-url`}
                spellCheck={false}
                className="font-mono text-xs"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{ti.endpointHint}</p>
            </div>
          )}
          <div className="flex items-start gap-3 rounded-lg bg-muted/60 px-3 py-2 text-xs">
            <span className="shrink-0 text-muted-foreground">{ti.status}</span>
            <span className="ms-auto min-w-0 text-end">
              {test === "testing" ? (
                <span className="satgas-shimmer">{ti.testing}</span>
              ) : test === "ok" ? (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
                  {ti.testOk}
                </span>
              ) : (
                <StatusText status={status} wrap />
              )}
            </span>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              <RichText text={problem} />
            </p>
          )}
          {cfg && def.auth !== "cli" && inUse && <p className="text-xs text-muted-foreground">{ti.inUseBy(t.agent[def.runtime])}</p>}
        </form>

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-1">
            {def.auth !== "cli" && (
              <Button
                variant="ghost"
                className="text-muted-foreground"
                disabled={busy || testing || missing}
                onClick={() => void runTest()}
              >
                {ti.testConn}
              </Button>
            )}
            {cfg && def.auth !== "cli" && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy || testing || inUse}
                onClick={disconnect}
              >
                {ti.disconnect}
              </Button>
            )}
          </div>
          <Button type="submit" form={`${uid}-form`} disabled={busy || testing || missing || rechecking}>
            {busy || rechecking || testing ? ti.checkingShort : def.auth === "cli" ? ti.testConn : ti.connectBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
