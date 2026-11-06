import { Link } from "@tanstack/react-router";
import { Plus, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { plain } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProviderDialog, ProviderLogo, StatusText } from "@/features/integrations/providers";
import { lang, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { loadProviders, useProviders } from "@/stores/providers";
import { loadSettings, saveSettings, useSettings } from "@/stores/settings";
import { LEAD_PROVIDERS, leadBlocked, type ProviderDef, type ProviderKind, providerDef } from "../../../shared/providers";
import { activeAgent, withAgent } from "../../../shared/settings";

const tp = t.picker;

// True once the checks answer and the lead has no working provider; an unknown answer never blocks anyone.
export function useNeedsProvider() {
  const selected = useSettings((s) => (s.settings ? s.settings.agents[activeAgent(s.settings.agents)].provider : undefined));
  const statuses = useProviders((s) => s.statuses);
  useEffect(() => {
    if (!useProviders.getState().statuses) void loadProviders();
    if (!useSettings.getState().settings) void loadSettings();
  }, []);
  return !!selected && leadBlocked(selected, statuses);
}

function setLeadProvider(kind: ProviderKind) {
  const settings = useSettings.getState().settings;
  if (!settings) return;
  const runtime = providerDef.get(kind)?.runtime ?? "claude";
  const agents = withAgent(settings.agents, runtime, true);
  void saveSettings({ ...settings, agents: { ...agents, [runtime]: { ...agents[runtime], provider: kind, model: "", effort: "" } } });
}

function ProviderChoices() {
  const settings = useSettings((s) => s.settings);
  const statuses = useProviders((s) => s.statuses);
  const [open, setOpen] = useState<ProviderDef | null>(null);
  if (!settings) return null;
  return (
    <>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {LEAD_PROVIDERS.map((def) => {
          const status = statuses?.find((s) => s.kind === def.kind);
          const ok = status?.state === "ok";
          // A CLI nobody signed in to yet is simply not connected; a saved key that fails is a real problem to show.
          const broken = status?.state === "failed" && def.auth !== "cli";
          return (
            <li key={def.kind}>
              <button
                type="button"
                title={plain(def.desc[lang])}
                onClick={() => (ok ? setLeadProvider(def.kind) : setOpen(def))}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-start transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <ProviderLogo def={def} className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{def.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ok || broken ? <StatusText status={status} /> : plain(def.desc[lang])}
                  </span>
                </span>
                {ok ? (
                  <span className="shrink-0 text-xs font-medium">{tp.gateUse}</span>
                ) : (
                  <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <ProviderDialog def={open} settings={settings} onConnected={() => setLeadProvider(open.kind)} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function GateActions() {
  const checking = useProviders((s) => s.checking);
  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={checking} onClick={() => void loadProviders(true)}>
        <RotateCw className={cn(checking && "animate-spin motion-reduce:animate-none")} />
        {t.integrations.recheck}
      </Button>
      <Link
        to="/integrations"
        search={{ tab: "providers" }}
        className="rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {tp.manage}
      </Link>
    </div>
  );
}

// Stands where Home's composer goes until the team has a model, so nobody writes a brief that cannot run.
export function ProviderGate({ className }: { className?: string }) {
  return (
    <section aria-labelledby="provider-gate" className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-3", className)}>
      <div className="flex flex-col gap-0.5 px-2 pt-1">
        <h2 id="provider-gate" className="text-[15px] font-medium">
          {tp.gateTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{tp.gateLead}</p>
      </div>
      <ProviderChoices />
      <GateActions />
    </section>
  );
}

// The same choice inside a board, where the draft and the chat stay in place around it.
export function ProviderNotice() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground">
      <span className="min-w-0">{tp.gateNotice}</span>
      <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        {tp.gateConnect}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 sm:max-w-2xl">
          <DialogHeader className="text-start">
            <DialogTitle>{tp.gateTitle}</DialogTitle>
            <DialogDescription>{tp.gateLead}</DialogDescription>
          </DialogHeader>
          <ProviderChoices />
          <GateActions />
        </DialogContent>
      </Dialog>
    </div>
  );
}
