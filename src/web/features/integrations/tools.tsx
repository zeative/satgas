import { Check, Copy, ListChecks, MoreHorizontal, Paintbrush, Pencil, ShieldCheck, SquareTerminal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LogoTile } from "@/components/logo-tile";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { newId } from "@/features/board/context";
import { lang, t } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { saveSettings } from "@/stores/settings";
import type { Settings } from "../../../shared/settings";
import { type Builtin, TOOL_CATALOG, TOOL_WHENS, type ToolDef, type ToolSetting, type ToolWhen, toolDef } from "../../../shared/tools";
import { DetailPage, DetailSection, ExternalText, Fact } from "./detail";
import { update } from "./update";

const tt = t.tools;
const ti = t.integrations;

interface ToolStatus {
  programs: Record<string, string | null>;
  rtk?: { saved: number; pct: number; commands: number };
}

// Which programs are installed here; asked again after a custom tool names a new one.
function useToolStatus(key: string) {
  const [status, setStatus] = useState<ToolStatus | null>(null);
  const load = useCallback(async (refresh: boolean) => {
    try {
      const res = await fetch(`/api/tools/status${refresh ? "?refresh=1" : ""}`);
      if (res.ok) setStatus(await res.json());
    } catch {
      // The cards still work without it; they just cannot say what is installed.
    }
  }, []);
  // key names the programs custom tools need, so naming a new one asks the server to look again.
  useEffect(() => {
    void load(key !== "");
  }, [key, load]);
  return status;
}

const ICON: Record<Builtin, typeof ShieldCheck> = { guard: ShieldCheck, format: Paintbrush, check: ListChecks };

function ToolLogo({ def, size }: { def?: ToolDef; size?: "sm" | "lg" }) {
  const Icon = def?.builtin ? ICON[def.builtin] : SquareTerminal;
  return (
    <LogoTile
      logo={def?.logo}
      size={size}
      fallback={<Icon className={cn("text-muted-foreground", size === "lg" ? "size-7" : "size-5")} aria-hidden="true" />}
    />
  );
}

const compact = new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { notation: "compact", maximumFractionDigits: 1 });

function CopyCommand({ command }: { command: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <code className="truncate rounded bg-background px-1 font-mono text-[11px]">{command}</code>
      <button
        type="button"
        aria-label={tt.copyInstall}
        title={done ? tt.copied : tt.copyInstall}
        onClick={() => {
          void copyText(command).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
        className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {done ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
      </button>
    </span>
  );
}

// The one line under a tool: what it needs and whether this machine has it; RTK also says what it has saved so far.
function Status({ def, needs, status }: { def?: ToolDef; needs?: string; status: ToolStatus | null }) {
  if (def?.builtin) return <p className="text-xs text-muted-foreground/70">{tt.builtIn}</p>;
  if (!needs) return <p className="text-xs text-muted-foreground/70">{tt.custom}</p>;
  const version = status?.programs[needs];
  if (status && version === null)
    return (
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/70">
        <span className="shrink-0">{tt.notInstalled}</span>
        {def?.install && (
          <>
            <span aria-hidden="true">·</span>
            <CopyCommand command={def.install} />
          </>
        )}
      </p>
    );
  if (!version) return <p className="text-xs text-muted-foreground/70">{def ? " " : tt.custom}</p>;
  if (def?.id === "rtk" && status?.rtk && status.rtk.saved > 0)
    return (
      <p className="text-xs text-emerald-600 tabular-nums dark:text-emerald-400">
        {tt.saved(compact.format(status.rtk.saved), status.rtk.pct)}
      </p>
    );
  return <p className="text-xs text-muted-foreground/70">{ti.installed(version)}</p>;
}

// Catalog tools are switched on and off where they stand; switching one on the first time stores it.
function toggleCatalog(settings: Settings, def: ToolDef, enabled: boolean) {
  const stored = settings.tools.find((x) => x.catalogId === def.id);
  const tools = stored
    ? settings.tools.map((x) => (x === stored ? { ...x, enabled } : x))
    : [...settings.tools, { id: newId(), catalogId: def.id, enabled }];
  return update({ ...settings, tools });
}

interface TabProps {
  settings: Settings;
  onOpen: (id: string) => void;
  onEdit: (tool: ToolSetting) => void;
}

export function ToolsTab({ settings, onOpen, onEdit }: TabProps) {
  const [removing, setRemoving] = useState<ToolSetting | null>(null);
  const custom = settings.tools.filter((x) => !x.catalogId);
  const status = useToolStatus(custom.flatMap((x) => (x.needs ? [x.needs] : [])).join(" "));
  const enabled = (def: ToolDef) => settings.tools.some((x) => x.catalogId === def.id && x.enabled);

  return (
    <div className="flex flex-col gap-10">
      {TOOL_WHENS.map((when) => {
        const defs = TOOL_CATALOG.filter((d) => d.when === when);
        const mine = custom.filter((x) => x.when === when);
        if (!defs.length && !mine.length) return null;
        return (
          <section key={when} aria-labelledby={`tools-${when}`} className="flex flex-col gap-4">
            <h2 id={`tools-${when}`} className="flex items-center gap-2 text-base font-medium">
              {tt.when[when]}
              <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{defs.length + mine.length}</span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {defs.map((def) => (
                <li key={def.id} className="relative flex items-start gap-4 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/80">
                  <ToolLogo def={def} />
                  <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !enabled(def) && "opacity-60")}>
                    <h3 className="text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => onOpen(def.id)}
                        className="text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      >
                        {def.name}
                      </button>
                    </h3>
                    <p className="line-clamp-2 text-sm text-muted-foreground" title={def.desc[lang]}>
                      {def.desc[lang]}
                    </p>
                    <div className="mt-1.5">
                      <Status def={def} needs={def.needs} status={status} />
                    </div>
                  </div>
                  <Switch
                    className="relative z-10 mt-0.5"
                    checked={enabled(def)}
                    aria-label={tt.toggle(def.name)}
                    onCheckedChange={(on) => void toggleCatalog(settings, def, on)}
                  />
                </li>
              ))}
              {mine.map((x) => (
                <li key={x.id} className="relative flex items-start gap-4 rounded-xl bg-muted/50 p-4">
                  <ToolLogo />
                  <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !x.enabled && "opacity-60")}>
                    <h3 className="truncate text-sm font-medium">{x.name}</h3>
                    <p className="truncate font-mono text-xs text-muted-foreground" title={x.command || x.note}>
                      {x.command || x.note || x.needs}
                    </p>
                    <div className="mt-1.5">
                      <Status needs={x.needs} status={status} />
                    </div>
                  </div>
                  <div className="relative z-10 flex shrink-0 items-center gap-1">
                    <Switch
                      checked={x.enabled}
                      aria-label={tt.toggle(x.name ?? "")}
                      onCheckedChange={(on) =>
                        void update({ ...settings, tools: settings.tools.map((y) => (y.id === x.id ? { ...y, enabled: on } : y)) })
                      }
                    />
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          aria-label={`${t.moreActions}: ${x.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(x)}>
                          <Pencil />
                          {ti.edit}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoving(x)}>
                          <Trash2 />
                          {ti.remove}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={tt.removeTitle(removing?.name ?? "")}
        desc={tt.removeText}
        confirmText={ti.remove}
        cancelBtnText={ti.cancel}
        destructive
        handleConfirm={async () => {
          if (!removing) return null;
          const problem = await saveSettings({ ...settings, tools: settings.tools.filter((x) => x.id !== removing.id) });
          if (!problem) setRemoving(null);
          return problem;
        }}
      />
    </div>
  );
}

export function ToolDetail({ settings, id, onBack }: { settings: Settings; id: string; onBack: () => void }) {
  const def = toolDef.get(id);
  const status = useToolStatus("");
  if (!def) return null;
  const on = settings.tools.some((x) => x.catalogId === def.id && x.enabled);
  const version = def.needs ? status?.programs[def.needs] : undefined;
  return (
    <DetailPage
      back={tt.tab}
      onBack={onBack}
      logo={<ToolLogo def={def} size="lg" />}
      title={def.name}
      desc={def.desc[lang]}
      action={
        <div className="flex items-center gap-2 text-sm">
          <Switch
            id="tool-enabled"
            checked={on}
            aria-label={tt.toggle(def.name)}
            onCheckedChange={(next) => void toggleCatalog(settings, def, next)}
          />
          <label htmlFor="tool-enabled">{ti.enabled}</label>
        </div>
      }
      aside={
        <>
          <Fact label={tt.runs}>{tt.when[def.when]}</Fact>
          {def.needs ? (
            <Fact label={tt.program}>
              {version ? (
                ti.installed(version)
              ) : status ? (
                <span className="flex flex-col gap-1">
                  {tt.notInstalled}
                  {def.install && <CopyCommand command={def.install} />}
                </span>
              ) : (
                <code className="font-mono text-xs">{def.needs}</code>
              )}
            </Fact>
          ) : (
            <Fact label={tt.program}>{tt.builtIn}</Fact>
          )}
          <Fact label={tt.madeBy}>{def.by}</Fact>
          {def.site && (
            <Fact label={tt.project}>
              <ExternalText href={def.site}>{def.site.replace(/^https:\/\/(www\.)?/, "")}</ExternalText>
            </Fact>
          )}
        </>
      }
    >
      <DetailSection title={tt.about}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <RichText text={def.about[lang]} />
        </p>
      </DetailSection>
      {def.needs && version === null && def.install && (
        <DetailSection title={tt.install}>
          <p className="text-sm text-muted-foreground">{tt.turnsOn}</p>
          <CopyCommand command={def.install} />
        </DetailSection>
      )}
    </DetailPage>
  );
}

interface DialogProps {
  tool: ToolSetting | null;
  onClose: () => void;
  onSave: (tool: ToolSetting) => Promise<string | null>;
}

export function ToolDialog({ tool, onClose, onSave }: DialogProps) {
  const [name, setName] = useState(tool?.name ?? "");
  const [when, setWhen] = useState<ToolWhen>(tool?.when ?? "edit");
  const [command, setCommand] = useState(tool?.command ?? "");
  const [needs, setNeeds] = useState(tool?.needs ?? "");
  const [note, setNote] = useState(tool?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    const result = await onSave({
      id: tool?.id ?? newId(),
      enabled: tool?.enabled ?? true,
      name: name.trim(),
      when,
      ...(when !== "available" && command.trim() ? { command: command.trim() } : {}),
      ...(needs.trim() ? { needs: needs.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setSaving(false);
    if (result) setProblem(result);
    else onClose();
  };

  const field = "flex flex-col gap-1.5";
  const PLACEHOLDER: Record<ToolWhen, string> = {
    command: 'my-filter "$SATGAS_COMMAND"',
    edit: 'npx eslint "$SATGAS_FILE"',
    finish: "bun test",
    available: "",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tool ? tt.editTitle : tt.addTitle}</DialogTitle>
          <DialogDescription>{tt.formLead}</DialogDescription>
        </DialogHeader>
        <form
          id="tool-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={field}>
            <label htmlFor="tool-name" className="text-sm font-medium">
              {ti.name}
            </label>
            <Input id="tool-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ESLint" />
          </div>
          <fieldset className={field}>
            <legend className="mb-1.5 text-sm font-medium">{tt.whenLabel}</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {TOOL_WHENS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={when === v}
                  onClick={() => setWhen(v)}
                  className={cn(
                    "h-8 rounded-md px-2 text-sm text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    when === v && "bg-background text-foreground shadow-xs",
                  )}
                >
                  {tt.when[v]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              <RichText text={tt.whenHint[when]} />
            </p>
          </fieldset>
          {when !== "available" && (
            <div className={field}>
              <label htmlFor="tool-command" className="text-sm font-medium">
                {tt.command}
              </label>
              <Input
                id="tool-command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={PLACEHOLDER[when]}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>
          )}
          <div className={field}>
            <label htmlFor="tool-needs" className="text-sm font-medium">
              {tt.needs}
            </label>
            <Input
              id="tool-needs"
              value={needs}
              onChange={(e) => setNeeds(e.target.value)}
              placeholder="eslint"
              className="font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              <RichText text={tt.needsHint} />
            </p>
          </div>
          <div className={field}>
            <label htmlFor="tool-note" className="text-sm font-medium">
              {tt.note}
            </label>
            <Input id="tool-note" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="text-xs text-muted-foreground">{tt.noteHint}</p>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              <RichText text={problem} />
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {ti.cancel}
          </Button>
          <Button type="submit" form="tool-form" disabled={saving || !name.trim()}>
            {saving ? ti.saving : ti.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const toolSaved = () => toast.success(ti.saved, { description: tt.nextTask });
