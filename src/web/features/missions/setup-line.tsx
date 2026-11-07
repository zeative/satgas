import { KeyRound, Settings2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAddConnector } from "@/features/integrations/connectors";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { decideSetup, setupConnected, undoSetup } from "@/stores/runs";
import { loadSettings, useSettings } from "@/stores/settings";
import { byId, catalogOf } from "../../../shared/catalog";
import type { SetupCommand, SetupRecord } from "../../../shared/setup";
import { toolDef } from "../../../shared/tools";

const ts = t.setup;
const AGENT = { claude: "Claude Code", codex: "Codex" } as const;

// A setup change in a few words; names come from the catalog where there is one.
function label(c: SetupCommand): string {
  switch (c.op) {
    case "connect":
      return ts.connect(byId.get(c.id)?.name ?? c.id);
    case "connector":
    case "skill":
      return c.on ? ts.on(c.name) : ts.off(c.name);
    case "tool": {
      const name = toolDef.get(c.id)?.name ?? c.id;
      return c.on ? ts.on(name) : ts.off(name);
    }
    case "agent":
      return [
        c.tasks !== undefined && ts.agentTasks(AGENT[c.agent], c.tasks),
        c.model !== undefined && ts.agentModel(AGENT[c.agent], c.model),
      ]
        .filter(Boolean)
        .join(", ");
    case "install-skills":
      return `${ts.installSkills(c.repo)}${c.skills ? ` (${ts.only(c.skills.join(", "))})` : ""}`;
    case "custom-connector":
      return ts.customConnector(c.name);
    case "custom-tool":
      return ts.customTool(c.name);
    default:
      return "";
  }
}

// What exactly would run, so the person allows code they can read.
const detail = (c: SetupCommand) =>
  c.op === "custom-connector"
    ? (c.url ?? [c.command, ...(c.args ?? [])].join(" "))
    : c.op === "custom-tool"
      ? (c.command ?? c.needs ?? "")
      : "";

const quiet =
  "shrink-0 font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

// The lead's setup changes for one round: what applied (with Undo), what waits for the person's Allow, and connectors
// waiting for a key, which goes from a private field straight to settings and never into the chat.
export function SetupLine({ runId, round, rec }: { runId: string; round: number; rec: SetupRecord }) {
  const settings = useSettings((s) => s.settings);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (rec.keys.length && !useSettings.getState().settings) void loadSettings();
  }, [rec.keys.length]);

  const act = async (key: string, job: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await job();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const applied = rec.applied.map(label).filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {applied && (
        <p className="flex items-center gap-2">
          <Settings2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className={cn("min-w-0 flex-1", rec.undone && "line-through")}>{applied}</span>
          {rec.undone ? (
            <span className="shrink-0">{ts.undone}</span>
          ) : (
            <button type="button" disabled={!!busy} onClick={() => void act("undo", () => undoSetup(runId, round))} className={quiet}>
              {ts.undo}
            </button>
          )}
        </p>
      )}
      {rec.pending.map((p, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: the server addresses each waiting change by its position.
          key={i}
          className="flex items-start gap-2 rounded-xl border px-3 py-2"
        >
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-foreground">{label(p.cmd)}</span>
            {detail(p.cmd) && <code className="truncate font-mono text-[11px]">{detail(p.cmd)}</code>}
            <span className={cn(p.state === "failed" && "text-destructive")}>
              {p.state === "waiting"
                ? ts.outside
                : p.state === "skipped"
                  ? ts.skipped
                  : p.state === "failed"
                    ? p.note
                    : p.note && p.cmd.op === "install-skills"
                      ? ts.installed(p.note)
                      : ts.allowed}
            </span>
          </div>
          {p.state === "waiting" && (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                className="h-7 px-2.5 text-xs"
                variant="ghost"
                disabled={!!busy}
                onClick={() => void act(`skip${i}`, () => decideSetup(runId, round, i, false))}
              >
                {ts.skip}
              </Button>
              <Button
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={!!busy}
                onClick={() => void act(`allow${i}`, () => decideSetup(runId, round, i, true))}
              >
                {busy === `allow${i}` ? "…" : ts.allow}
              </Button>
            </div>
          )}
        </div>
      ))}
      {settings && rec.keys.length > 0 && <KeyRows ids={rec.keys} runId={runId} round={round} />}
    </div>
  );
}

function KeyRows({ ids, runId, round }: { ids: string[]; runId: string; round: number }) {
  const settings = useSettings((s) => s.settings);
  if (!settings) return null;
  return (
    <KeyRowsFor
      ids={ids}
      settings={settings}
      onConnected={() => void setupConnected(runId, round).catch((e: Error) => toast.error(e.message))}
    />
  );
}

function KeyRowsFor({
  ids,
  settings,
  onConnected,
}: {
  ids: string[];
  settings: NonNullable<ReturnType<typeof useSettings.getState>["settings"]>;
  onConnected: () => void;
}) {
  const { add, dialog } = useAddConnector(settings, onConnected);
  const connected = new Set(settings.mcpServers.map((m) => catalogOf(m)?.id));
  return (
    <>
      {ids.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <p key={id} className="flex items-center gap-2 rounded-xl border px-3 py-2">
            <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-foreground">{ts.needsKey(item.name)}</span>
            {connected.has(id) ? (
              <span className="shrink-0">{ts.keyAdded}</span>
            ) : (
              <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => void add(item)}>
                {ts.addKey}
              </Button>
            )}
          </p>
        );
      })}
      {dialog}
    </>
  );
}
