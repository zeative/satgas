import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { plain, RichText } from "@/components/rich-text";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProviderLogo } from "@/features/integrations/providers";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { loadProviders, useProviders } from "@/stores/providers";
import { loadSettings, saveSettings, useSettings } from "@/stores/settings";
import { CLAUDE_EFFORTS, nativeClaude, PROVIDERS, type ProviderKind, providerDef, type Runtime } from "../../../shared/providers";
import type { Settings } from "../../../shared/settings";
import type { ModelInfo, ProviderStatus } from "../../../shared/types";

const ti = t.integrations;
const AGENT: Record<Runtime, string> = { claude: t.agent.claude, codex: t.agent.codex };
const TOP_EFFORTS = new Set(["high", "xhigh", "max"]);

async function persist(next: Settings) {
  const problem = await saveSettings(next);
  if (problem) toast.error(problem);
}

// The models a provider offers, with the CLI's own default first where the CLI chooses one.
function modelsOf(kind: ProviderKind, status: ProviderStatus | undefined): ModelInfo[] {
  const list = status?.models ?? [];
  const cliDefault = kind === "claude" || kind === "codex" || kind === "claude-token";
  return cliDefault ? [{ id: "", name: ti.defaultModel, efforts: kind === "codex" ? undefined : CLAUDE_EFFORTS }, ...list] : list;
}

// Picks where each agent's model calls go: connected providers on the rail, their models, then reasoning.
// Providers that failed their check stay on the rail, dimmed, so the reason is one click away; unset ones are hidden.
export function ModelPicker() {
  const settings = useSettings((s) => s.settings);
  const loadError = useSettings((s) => s.error);
  const statuses = useProviders((s) => s.statuses);
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState<ProviderKind | null>(null);
  const [retrying, setRetrying] = useState(false);

  // The board can be the first page opened, so the picker loads what it needs itself.
  useEffect(() => {
    if (!useProviders.getState().statuses) void loadProviders();
    if (!useSettings.getState().settings) void loadSettings();
  }, []);

  if (!settings) {
    if (!loadError) return null;
    // A failed load keeps the pill's place and says so; pressing it tries again.
    return (
      <button
        type="button"
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          void loadSettings().finally(() => setRetrying(false));
        }}
        className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none"
      >
        <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span className="truncate">{t.picker.loadFailed}</span>
        <span className="shrink-0 font-medium text-foreground">{retrying ? t.picker.retrying : t.retry}</span>
      </button>
    );
  }
  const statusOf = (kind: ProviderKind) => statuses?.find((s) => s.kind === kind);
  const shown = PROVIDERS.filter((p) => {
    const st = statusOf(p.kind)?.state;
    return st === "ok" || st === "failed";
  });
  // The lead's provider may not be connected; then the rail opens on one that is.
  const selected = settings.agents.claude.provider;
  const current = rail ?? (shown.some((p) => p.kind === selected) ? selected : (shown[0]?.kind ?? selected));
  const def = providerDef.get(current);
  const runtime = def?.runtime ?? "claude";
  const status = statusOf(current);
  const agent = settings.agents[runtime];
  const active = agent.provider === current;
  const models = modelsOf(current, status);
  const chosen = active ? models.find((m) => m.id === agent.model) : undefined;
  const efforts = chosen?.efforts ?? (runtime === "claude" && nativeClaude(current) ? CLAUDE_EFFORTS : []);
  const off = (r: Runtime) => r === "codex" && !settings.agents.codex.tasks;
  const locked = off(runtime);

  const choose = (m: ModelInfo) => {
    const keep = m.efforts?.includes(agent.effort) ? agent.effort : "";
    void persist({ ...settings, agents: { ...settings.agents, [runtime]: { ...agent, provider: current, model: m.id, effort: keep } } });
  };
  const setEffort = (effort: string) => void persist({ ...settings, agents: { ...settings.agents, [runtime]: { ...agent, effort } } });
  const turnOn = () => void persist({ ...settings, agents: { ...settings.agents, codex: { ...settings.agents.codex, tasks: true } } });

  // The pill names one model, Claude Code's, since it plans every mission; Codex's choice sits on its own rail inside.
  const lead = settings.agents.claude;
  const leadDef = providerDef.get(lead.provider);
  const leadName = lead.model
    ? (statusOf(lead.provider)?.models.find((m) => m.id === lead.model)?.name ?? lead.model)
    : t.picker.defaultOf(leadDef?.name ?? t.agent.claude);
  // A saved model the provider no longer lists would only fail at the next mission, so the pill says so now.
  const leadStatus = statusOf(lead.provider);
  const missing =
    !!lead.model && leadStatus?.state === "ok" && leadStatus.models.length > 0 && !leadStatus.models.some((m) => m.id === lead.model);
  const missingNote = missing ? t.picker.unavailable(lead.model, leadDef?.name ?? lead.provider) : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setRail(null);
          void loadProviders();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={missingNote ? `${t.picker.label}: ${missingNote}` : t.picker.label}
          title={missingNote}
          className="flex h-8 max-w-[24rem] min-w-0 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          {missing ? (
            <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            leadDef && <ProviderLogo def={leadDef} className="size-4 shrink-0" />
          )}
          <span className={cn("truncate", missing ? "text-muted-foreground line-through" : "text-foreground")}>{leadName}</span>
          {lead.effort && <span className={cn("shrink-0", TOP_EFFORTS.has(lead.effort) && "satgas-gold")}>{ti.effort[lead.effort]}</span>}
          <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[36rem] overflow-hidden p-0">
        {shown.length === 0 ? (
          <div className="flex flex-col items-start gap-2 p-4 text-sm">
            <p className="text-muted-foreground">{t.picker.none}</p>
            <Link to="/integrations" search={{ tab: "agents" }} className="text-sm underline-offset-4 hover:underline">
              {t.picker.manage}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[3rem_minmax(0,1fr)_11rem]">
              <ul className="flex flex-col items-center gap-1 border-e py-2" aria-label={ti.providers}>
                {shown.map((p, i) => {
                  const failed = statusOf(p.kind)?.state === "failed";
                  const dim = failed || off(p.runtime);
                  const prev = shown[i - 1];
                  return (
                    <li key={p.kind} className="flex flex-col items-center">
                      {/* A hairline between the Claude Code providers and the Codex ones. */}
                      {prev && prev.runtime !== p.runtime && <span aria-hidden="true" className="mb-1 h-px w-5 bg-border" />}
                      <button
                        type="button"
                        aria-pressed={current === p.kind}
                        aria-disabled={dim || undefined}
                        title={
                          failed
                            ? `${p.name}: ${plain(statusOf(p.kind)?.error ?? ti.checkFailed)}`
                            : off(p.runtime)
                              ? t.picker.agentOff(AGENT[p.runtime])
                              : p.name
                        }
                        onClick={() => setRail(p.kind)}
                        className={cn(
                          "relative flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          current === p.kind && "bg-muted",
                          dim && "opacity-40 grayscale",
                        )}
                      >
                        <ProviderLogo def={p} className="size-4" />
                        {current === p.kind && <span aria-hidden="true" className="absolute -end-2 h-4 w-0.5 rounded-full bg-signal" />}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex min-w-0 flex-col border-e">
                {status?.state === "failed" ? (
                  <div className="flex flex-col gap-2 p-4 text-sm">
                    <p className="flex items-center gap-1.5 font-medium">
                      <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />
                      {def?.name} · {ti.checkFailed}
                    </p>
                    <p className="text-muted-foreground">
                      <RichText text={status.error ?? ""} />
                    </p>
                  </div>
                ) : (
                  <Command className="rounded-none bg-transparent" loop>
                    <CommandInput placeholder={t.picker.search} className="h-9 py-0" disabled={locked} />
                    {locked && (
                      <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs text-muted-foreground">
                        <span>{t.picker.offShort(AGENT[runtime])}</span>
                        <button
                          type="button"
                          onClick={turnOn}
                          className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {t.picker.turnOn}
                        </button>
                      </div>
                    )}
                    <CommandList className="max-h-72 p-1">
                      <CommandEmpty className="px-2 py-6 text-center text-sm text-muted-foreground">
                        {models.length ? t.picker.noModels : t.picker.noList}
                      </CommandEmpty>
                      <CommandGroup className="p-0">
                        {models.map((m) => {
                          const on = active && agent.model === m.id;
                          return (
                            <CommandItem
                              key={m.id || "default"}
                              value={`${m.name} ${m.id}`}
                              disabled={locked}
                              onSelect={() => choose(m)}
                              className="min-h-7 gap-2 rounded-md px-2 py-1 data-[disabled=true]:bg-transparent data-[disabled=true]:opacity-50"
                            >
                              {def && <ProviderLogo def={def} className="size-4 shrink-0" />}
                              <span className="truncate">{m.name}</span>
                              {on && <Check className="ms-auto size-4 text-foreground" aria-hidden="true" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                )}
              </div>

              <div className="flex flex-col">
                <div className="flex h-9 items-center justify-between gap-2 border-b px-3 text-xs text-muted-foreground">
                  <span>{ti.reasoning}</span>
                  {chosen && <span className="truncate">{chosen.id ? chosen.name : def?.name}</span>}
                </div>
                <ul className="flex flex-col p-1">
                  {active && efforts.length > 0 ? (
                    ["", ...efforts].map((e) => (
                      <li key={e || "default"}>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => setEffort(e)}
                          className="flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-start text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                        >
                          <span className={cn(TOP_EFFORTS.has(e) && "satgas-gold")}>{ti.effort[e] ?? e}</span>
                          {e && chosen?.defaultEffort === e && <span className="text-xs text-muted-foreground">{ti.effort[""]}</span>}
                          {agent.effort === e && <Check className="ms-auto size-4" aria-hidden="true" />}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-2 py-2 text-xs text-muted-foreground">{ti.reasoningHint}</li>
                  )}
                </ul>
              </div>
            </div>
            <div className="flex h-9 items-center justify-between border-t px-3 text-xs text-muted-foreground">
              <span>{t.picker.usedBy(AGENT[runtime])}</span>
              <Link
                to="/integrations"
                search={{ tab: "agents" }}
                onClick={() => setOpen(false)}
                className="rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t.picker.manage}
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
