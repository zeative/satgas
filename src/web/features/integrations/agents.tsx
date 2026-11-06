import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { type Logo, LogoTile } from "@/components/logo-tile";
import { RichText } from "@/components/rich-text";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useRuns } from "@/stores/runs";
import { nativeClaude, PROVIDERS, providerDef, type Runtime } from "../../../shared/providers";
import { CODEX_SANDBOXES, type CodexSandbox, PERMISSION_MODES, type PermissionMode, type Settings } from "../../../shared/settings";
import { DetailPage, DetailSection, ExternalText, Fact } from "./detail";
import { ModelSelect } from "./model-select";
import { ProviderLogo, ProvidersSection, StatusText, useProviderStatus } from "./providers";
import { update } from "./update";

const ti = t.integrations;

interface AgentInfo {
  runtime: Runtime;
  name: string;
  by: string;
  site: string;
  docs: string;
  bin: string;
  install: string;
  logo: Logo;
}

const AGENTS: Record<Runtime, AgentInfo> = {
  claude: {
    runtime: "claude",
    name: t.agent.claude,
    by: "Anthropic",
    site: "https://www.anthropic.com",
    docs: "https://code.claude.com/docs/en/overview",
    bin: "claude",
    install: "npm install -g @anthropic-ai/claude-code",
    logo: { src: "/brands/claude.svg" },
  },
  codex: {
    runtime: "codex",
    name: t.agent.codex,
    by: "OpenAI",
    site: "https://openai.com",
    docs: "https://github.com/openai/codex",
    bin: "codex",
    install: "npm install -g @openai/codex",
    logo: { src: "/brands/codex.svg", icon: true },
  },
};

// What this machine reports about an agent CLI: undefined while unknown, null when missing.
function useInstalled() {
  const installed = useRuns((s) => s.config.agents);
  const checking = useRuns((s) => s.config.version === null);
  return (runtime: Runtime) => ({ version: installed ? installed[runtime] : undefined, checking });
}

function VersionText({ version, checking }: { version: string | null | undefined; checking: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", version === null && "text-destructive")}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          version === undefined ? "bg-muted-foreground/40" : version ? "bg-emerald-500" : "bg-destructive",
        )}
      />
      {version === undefined ? (checking ? ti.checking : ti.unchecked) : version ? ti.installed(version) : ti.notFound}
    </span>
  );
}

const setAgent = (settings: Settings, runtime: Runtime, patch: Record<string, unknown>) =>
  void update({ ...settings, agents: { ...settings.agents, [runtime]: { ...settings.agents[runtime], ...patch } } });

export function AgentsTab({ settings, onOpen }: { settings: Settings; onOpen: (runtime: Runtime) => void }) {
  const installedOf = useInstalled();
  const statusOf = useProviderStatus();
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="agents" className="flex flex-col gap-4">
        <h2 id="agents" className="text-base font-medium">
          {ti.agents}
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {Object.values(AGENTS).map((a) => {
            const conf = settings.agents[a.runtime];
            const def = providerDef.get(conf.provider);
            const { version, checking } = installedOf(a.runtime);
            const modelName = conf.model && statusOf(conf.provider)?.models.find((m) => m.id === conf.model)?.name;
            return (
              <li key={a.runtime} className="relative flex gap-4 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/80">
                <LogoTile logo={a.logo} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h3 className="text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => onOpen(a.runtime)}
                      className="text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                      {a.name}
                    </button>
                  </h3>
                  <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                    {def && <ProviderLogo def={def} className="size-3.5 shrink-0" />}
                    <span className="truncate">
                      {/* A model with no display name is shown as its id, in code. */}
                      <RichText
                        text={[
                          def?.name,
                          modelName || (conf.model ? `\`${conf.model}\`` : ti.defaultModel),
                          conf.effort && ti.effort[conf.effort],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    </span>
                  </p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <VersionText version={version} checking={checking} />
                  </p>
                </div>
                {/* Above the card's stretched link, so toggling never opens the detail page. */}
                <Switch
                  className="relative z-10 shrink-0"
                  checked={conf.tasks}
                  onCheckedChange={(tasks) => setAgent(settings, a.runtime, { tasks })}
                  aria-label={`${ti.useForTasks}: ${a.name}`}
                  title={ti.useForTasks}
                />
              </li>
            );
          })}
        </ul>
      </section>
      <ProvidersSection settings={settings} />
    </div>
  );
}

export function AgentDetail({ settings, runtime, onBack }: { settings: Settings; runtime: Runtime; onBack: () => void }) {
  const a = AGENTS[runtime];
  const statusOf = useProviderStatus();
  const { version, checking } = useInstalled()(runtime);
  const conf = settings.agents[runtime];
  const provider = providerDef.get(conf.provider);
  const status = statusOf(conf.provider);
  const models = status?.models ?? [];
  const model = models.find((m) => m.id === conf.model);
  const efforts = model?.efforts ?? (runtime === "claude" ? ["low", "medium", "high", "xhigh", "max"] : []);
  const choices = PROVIDERS.filter((p) => p.runtime === runtime && statusOf(p.kind)?.state !== "off");
  const set = (patch: Record<string, unknown>) => setAgent(settings, runtime, patch);

  return (
    <DetailPage
      back={ti.agents}
      onBack={onBack}
      logo={<LogoTile logo={a.logo} size="lg" />}
      title={a.name}
      desc={runtime === "claude" ? ti.agentDesc.claude : ti.agentDesc.codex}
      action={
        <label htmlFor={`${runtime}-tasks`} className="flex items-center gap-2.5 text-sm text-muted-foreground">
          {ti.useForTasks}
          <Switch id={`${runtime}-tasks`} checked={conf.tasks} onCheckedChange={(tasks) => set({ tasks })} />
        </label>
      }
      aside={
        <>
          <Fact label={ti.madeBy}>
            <ExternalText href={a.site}>{a.by}</ExternalText>
          </Fact>
          <Fact label={ti.cli}>
            <RichText text={`\`${a.bin}\``} />
          </Fact>
          <Fact label={ti.version}>
            <VersionText version={version} checking={checking} />
          </Fact>
          <Fact label={ti.role}>
            {runtime === "claude" ? (conf.tasks ? ti.plans : ti.plansOnly) : conf.tasks ? ti.takesTasks : ti.noTasks}
          </Fact>
          <Fact label={ti.connectorsReach}>{runtime === "claude" ? ti.reachAll : ti.reachLocal}</Fact>
          <Fact label={ti.moreInfo}>
            <ExternalText href={a.docs}>{ti.documentation}</ExternalText>
          </Fact>
        </>
      }
    >
      <p className="max-w-prose text-sm leading-6">
        <RichText text={runtime === "claude" ? ti.agentAbout.claude : ti.agentAbout.codex} />
      </p>

      {version === null && (
        <DetailSection title={ti.install}>
          <code className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs">{a.install}</code>
          <p className="text-xs text-muted-foreground">{ti.installHint}</p>
        </DetailSection>
      )}

      <DetailSection title={ti.settingsTitle}>
        <div className="divide-y rounded-xl bg-muted/50">
          <Row label={ti.provider} hint={ti.providerHint} htmlFor={`${runtime}-provider`}>
            <Select value={conf.provider} onValueChange={(provider) => set({ provider, model: "", effort: "" })}>
              <SelectTrigger id={`${runtime}-provider`} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {choices.map((p) => {
                  const st = statusOf(p.kind);
                  return (
                    <SelectItem key={p.kind} value={p.kind} disabled={st?.state === "failed"}>
                      <ProviderLogo def={p} className="size-4" />
                      {p.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Row>
          {provider && status?.state !== "ok" && (
            <p className="px-4 py-2 text-xs">
              <StatusText status={status} />
            </p>
          )}
          <Row label={ti.model} hint={ti.modelHint} htmlFor={`${runtime}-model`}>
            {models.length ? (
              <ModelSelect
                id={`${runtime}-model`}
                def={provider}
                models={models}
                value={conf.model}
                withDefault={provider?.auth === "cli" || conf.provider === "claude-token"}
                onChange={(m) => set({ model: m, effort: "" })}
              />
            ) : (
              <ModelInput id={`${runtime}-model`} value={conf.model} onSave={(m) => set({ model: m })} />
            )}
          </Row>
          {efforts.length > 0 && (
            <Row label={ti.reasoning} hint={ti.reasoningHint} htmlFor={`${runtime}-effort`}>
              <Choice
                id={`${runtime}-effort`}
                value={conf.effort || "__default"}
                options={[["__default", ti.effort[""] ?? ""], ...efforts.map((e): [string, string] => [e, ti.effort[e] ?? e])]}
                onChange={(e) => set({ effort: e === "__default" ? "" : e })}
              />
            </Row>
          )}
          {runtime === "claude" && nativeClaude(conf.provider) && (
            <Row label={ti.plannerModel} hint={ti.plannerHint} htmlFor="claude-planner">
              <ModelInput
                id="claude-planner"
                value={settings.agents.claude.plannerModel}
                suggestions={["sonnet", "opus", "haiku", "fable"]}
                placeholder={ti.sameAsTasks}
                onSave={(plannerModel) => set({ plannerModel })}
              />
            </Row>
          )}
          {runtime === "claude" ? (
            <Row
              label={ti.permissions}
              hint={ti.permissionsHint}
              htmlFor="claude-permissions"
              warning={settings.agents.claude.permissionMode === "bypassPermissions" ? ti.bypassHint : undefined}
            >
              <Choice
                id="claude-permissions"
                value={settings.agents.claude.permissionMode}
                options={PERMISSION_MODES.map((m) => [m, ti.permission[m]])}
                onChange={(permissionMode) => set({ permissionMode: permissionMode as PermissionMode })}
              />
            </Row>
          ) : (
            <Row
              label={ti.sandbox}
              hint={ti.sandboxHint}
              htmlFor="codex-sandbox"
              warning={settings.agents.codex.sandbox === "danger-full-access" ? ti.bypassHint : undefined}
            >
              <Choice
                id="codex-sandbox"
                value={settings.agents.codex.sandbox}
                options={CODEX_SANDBOXES.map((m) => [m, ti.sandboxMode[m]])}
                onChange={(sandbox) => set({ sandbox: sandbox as CodexSandbox })}
              />
            </Row>
          )}
        </div>
      </DetailSection>
    </DetailPage>
  );
}

function Row({
  label,
  hint,
  htmlFor,
  warning,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  warning?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor={htmlFor} className="text-sm">
            {label}
          </label>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {children}
      </div>
      {warning && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      )}
    </div>
  );
}

// Saved on blur or Enter, so typing a model name never sends half a word.
function ModelInput({
  id,
  value,
  suggestions,
  placeholder,
  onSave,
}: {
  id: string;
  value: string;
  suggestions?: string[];
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const listId = suggestions ? `${id}-list` : undefined;
  useEffect(() => setDraft(value), [value]);
  return (
    <>
      <Input
        id={id}
        value={draft}
        placeholder={placeholder ?? ti.defaultModel}
        list={listId}
        spellCheck={false}
        autoComplete="off"
        className="w-56 font-mono text-xs placeholder:font-sans placeholder:text-sm"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (draft.trim() !== value) onSave(draft.trim());
        }}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

function Choice({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// A text setting saved when the person leaves the field or presses Enter, not on every key.
