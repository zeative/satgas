import { Link } from "@tanstack/react-router";
import { CalendarClock, Clock, Copy, MoreHorizontal, Pencil, Play, Plus, Trash2, Webhook, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useNow } from "@/hooks/use-now";
import { fmtAgo, fmtDateTime, t } from "@/i18n";
import { openMission } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { useRuns } from "@/stores/runs";
import { deleteSchedule, type Listed, loadSchedules, runScheduleNow, saveSchedule, useSchedules } from "@/stores/schedules";
import type { Filter, Schedule, Trigger } from "../../../shared/schedules";

const ts = t.schedules;
const ICON = { interval: Clock, daily: CalendarClock, webhook: Webhook } as const;

export function SchedulesPage() {
  const { list, error } = useSchedules();
  const [editing, setEditing] = useState<Listed | "new" | null>(null);
  const now = useNow(true, 30_000);
  useEffect(() => {
    void loadSchedules();
  }, []);

  return (
    <main id="content" className="relative flex-1">
      <PageHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-12 pb-16">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="brand-title text-[1.75rem] leading-tight">{ts.title}</h1>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus />
            {ts.new}
          </Button>
        </header>

        {error && !list ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <p>{ts.loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadSchedules()}>
              {t.retry}
            </Button>
          </div>
        ) : !list ? (
          <div className="flex flex-col gap-2">
            {["a", "b"].map((k) => (
              <Skeleton key={k} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : !list.length ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="text-sm font-medium">{ts.empty}</p>
            <p className="text-sm text-muted-foreground">{ts.emptyHint}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((s) => (
              <ScheduleRow key={s.id} s={s} now={now} onEdit={() => setEditing(s)} />
            ))}
          </ul>
        )}
      </div>
      {editing && <ScheduleDialog schedule={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

export function describeTrigger(tr: Trigger): string {
  if (tr.type === "webhook") return ts.describe.webhook;
  if (tr.type === "daily")
    return ts.describe.daily(
      tr.time,
      tr.weekdays.length && tr.weekdays.length < 7 ? tr.weekdays.map((d) => ts.days[d]).join(", ") : ts.describe.everyDay,
    );
  const m = tr.everyMinutes;
  return m % 1440 === 0
    ? ts.describe.every(m / 1440, ts.units.days)
    : m % 60 === 0
      ? ts.describe.every(m / 60, ts.units.hours)
      : ts.describe.every(m, ts.units.minutes);
}

function ScheduleRow({ s, now, onEdit }: { s: Listed; now: number; onEdit: () => void }) {
  const boards = useRuns((st) => st.runs);
  const [confirm, setConfirm] = useState(false);
  const Icon = ICON[s.trigger.type];
  const target = s.boardId ? boards?.find((r) => r.id === s.boardId) : undefined;
  const fail = (e: Error) => toast.error(e.message);
  const meta = [
    !s.enabled ? ts.paused : s.trigger.type === "webhook" ? ts.waitingCall : s.nextRunAt ? ts.next(fmtDateTime(s.nextRunAt)) : undefined,
    s.lastRunAt ? ts.last(fmtAgo(s.lastRunAt, now)) : undefined,
    s.runs ? ts.runs(s.runs) : undefined,
  ].filter(Boolean);
  return (
    <li className="relative flex gap-4 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/80">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-sm font-medium">
          <button
            type="button"
            onClick={onEdit}
            className="text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {s.title}
          </button>
        </h2>
        <p className="truncate text-sm text-muted-foreground">
          {describeTrigger(s.trigger)} · {target ? (target.title ?? target.prompt) : ts.newBoard}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
          {meta.join(" · ")}
          {s.lastBoardId && (
            <Link
              to="/boards/$boardId"
              params={{ boardId: s.lastBoardId }}
              className="relative z-10 rounded underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {ts.openBoard}
            </Link>
          )}
        </p>
        {s.lastError && <p className="text-xs text-destructive">{s.lastError}</p>}
      </div>
      {/* Level with the icon tile on the left, so the row reads as one line of controls. */}
      <div className="relative z-10 flex h-9 shrink-0 items-center gap-2">
        <Switch
          checked={s.enabled}
          onCheckedChange={(enabled) => void saveSchedule({ ...s, enabled }, s.id).catch(fail)}
          aria-label={`${ts.on}: ${s.title}`}
          title={ts.on}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={t.moreActions}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil />
              {ts.edit}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void runScheduleNow(s.id)
                  .then((id) => {
                    toast.success(ts.started);
                    if (id) openMission(id);
                  })
                  .catch(fail)
              }
            >
              <Play />
              {ts.runNow}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
              <Trash2 />
              {ts.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={ts.deleteTitle}
        desc={ts.deleteText}
        confirmText={ts.delete}
        destructive
        handleConfirm={() => deleteSchedule(s.id)}
      />
    </li>
  );
}

type Unit = "minutes" | "hours" | "days";
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };
const OPS: Filter["op"][] = ["equals", "notEquals", "startsWith", "in", "exists"];

function splitEvery(minutes: number): { n: number; unit: Unit } {
  if (minutes % 1440 === 0) return { n: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { n: minutes / 60, unit: "hours" };
  return { n: minutes, unit: "minutes" };
}

// One form for every kind of schedule: what to do, where it lands, and what starts it.
function ScheduleDialog({ schedule, onClose }: { schedule?: Schedule; onClose: () => void }) {
  const boards = useRuns((s) => s.runs) ?? [];
  const hookBase = useSchedules((s) => s.hookBase);
  const tr = schedule?.trigger;
  const [title, setTitle] = useState(schedule?.title ?? "");
  const [prompt, setPrompt] = useState(schedule?.prompt ?? "");
  const [where, setWhere] = useState<"new" | "board">(schedule?.boardId ? "board" : "new");
  const [boardId, setBoardId] = useState(schedule?.boardId ?? "");
  const [cwd, setCwd] = useState(schedule?.cwd ?? "");
  const [kind, setKind] = useState<Trigger["type"]>(tr?.type ?? "daily");
  const every = splitEvery(tr?.type === "interval" ? tr.everyMinutes : 60);
  const [n, setN] = useState(String(every.n));
  const [unit, setUnit] = useState<Unit>(every.unit);
  const [time, setTime] = useState(tr?.type === "daily" ? tr.time : "09:00");
  const [days, setDays] = useState<number[]>(tr?.type === "daily" ? tr.weekdays : []);
  const hook = tr?.type === "webhook" ? tr : undefined;
  const [filters, setFilters] = useState<{ path: string; op: Filter["op"]; value: string }[]>(
    (hook?.filters ?? []).map((f) => ({ path: f.path, op: f.op, value: Array.isArray(f.value) ? f.value.join(", ") : (f.value ?? "") })),
  );
  const [signing, setSigning] = useState(!!hook?.signature);
  const [header, setHeader] = useState(hook?.signature?.header ?? "x-hub-signature-256");
  const [prefix, setPrefix] = useState(hook?.signature?.prefix ?? "sha256=");
  const [secret, setSecret] = useState(hook?.signature?.secret ?? "");
  const [encoding, setEncoding] = useState<"hex" | "base64">(hook?.signature?.encoding ?? "hex");
  const [dedupe, setDedupe] = useState(hook?.dedupeKey ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const trigger = (): Record<string, unknown> =>
    kind === "interval"
      ? { type: "interval", everyMinutes: Math.round(Number(n) * UNIT_MINUTES[unit]) }
      : kind === "daily"
        ? { type: "daily", time, weekdays: days }
        : {
            type: "webhook",
            filters: filters.filter((f) => f.path.trim()).map((f) => ({ path: f.path.trim(), op: f.op, value: f.value })),
            ...(signing ? { signature: { header, prefix, secret, encoding } } : {}),
            ...(dedupe.trim() ? { dedupeKey: dedupe.trim() } : {}),
          };

  const submit = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await saveSchedule(
        { title, prompt, enabled: schedule?.enabled ?? true, trigger: trigger(), ...(where === "board" ? { boardId } : { cwd }) },
        schedule?.id,
      );
      onClose();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = "flex flex-col gap-1.5";
  const url = hook ? `${hookBase}${hook.token}` : "";
  const localOnly = /\/\/(localhost|127\.0\.0\.1)[:/]/.test(hookBase);
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{schedule ? ts.edit : ts.new}</DialogTitle>
          <DialogDescription>{ts.emptyHint}</DialogDescription>
        </DialogHeader>
        <form
          id="schedule-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={field}>
            <label htmlFor="schedule-name" className="text-sm font-medium">
              {ts.name}
            </label>
            <Input id="schedule-name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ts.namePlaceholder} />
          </div>
          <div className={field}>
            <label htmlFor="schedule-prompt" className="text-sm font-medium">
              {ts.prompt}
            </label>
            <textarea
              id="schedule-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={ts.promptPlaceholder}
              rows={3}
              className="min-h-20 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          <fieldset className={field}>
            <legend className="mb-1.5 text-sm font-medium">{ts.where}</legend>
            <Segmented
              value={where}
              onChange={setWhere}
              options={[
                ["new", ts.newBoard],
                ["board", ts.onBoard],
              ]}
            />
            {where === "board" ? (
              <Select value={boardId} onValueChange={setBoardId}>
                <SelectTrigger aria-label={ts.pickBoard} className="w-full">
                  <SelectValue placeholder={ts.pickBoard} />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.icon ? `${b.icon} ` : ""}
                      {b.title ?? b.prompt.slice(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder="/home/me/projects/app"
                  aria-label={ts.folder}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">{ts.folderHint}</p>
              </>
            )}
          </fieldset>

          <fieldset className={field}>
            <legend className="mb-1.5 text-sm font-medium">{ts.when}</legend>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                ["interval", ts.interval],
                ["daily", ts.daily],
                ["webhook", ts.webhook],
              ]}
            />
            {kind === "interval" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{ts.every}</span>
                <Input
                  type="number"
                  min={1}
                  value={n}
                  onChange={(e) => setN(e.target.value)}
                  aria-label={ts.every}
                  className="w-20 tabular-nums"
                />
                <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
                  <SelectTrigger className="w-28" aria-label={ts.every}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["minutes", "hours", "days"] as Unit[]).map((u) => (
                      <SelectItem key={u} value={u}>
                        {ts.units[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === "daily" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{ts.at}</span>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label={ts.at}
                  className="w-28 tabular-nums"
                />
                <div className="flex gap-1">
                  {ts.days.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={days.includes(i)}
                      onClick={() => setDays((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]))}
                      className={cn(
                        "h-8 w-10 rounded-md border text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        days.includes(i) && "border-foreground/30 bg-accent text-foreground",
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {kind === "webhook" && (
              <div className="flex flex-col gap-4 rounded-lg border p-3">
                <div className={field}>
                  <span className="text-xs font-medium">{ts.url}</span>
                  {url ? (
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-[11px]">{url}</code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          void navigator.clipboard.writeText(url).then(
                            () => toast.success(ts.copied),
                            () => toast.error(t.copyFailed),
                          )
                        }
                      >
                        <Copy />
                        {ts.copy}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{ts.urlAfterSave}</p>
                  )}
                  {localOnly && <p className="text-xs text-muted-foreground">{ts.localOnly}</p>}
                </div>
                <div className={field}>
                  <span className="text-xs font-medium">{ts.filters}</span>
                  <p className="text-xs text-muted-foreground">{ts.filtersHint}</p>
                  {filters.map((f, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: filters have no id and only change through this list.
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={f.path}
                        onChange={(e) => setFilters((v) => v.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))}
                        placeholder="body.action"
                        aria-label={ts.path}
                        className="h-8 min-w-0 flex-1 font-mono text-xs"
                        spellCheck={false}
                      />
                      <Select
                        value={f.op}
                        onValueChange={(op) => setFilters((v) => v.map((x, j) => (j === i ? { ...x, op: op as Filter["op"] } : x)))}
                      >
                        <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label={ts.filters}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPS.map((op) => (
                            <SelectItem key={op} value={op}>
                              {ts.ops[op]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {f.op !== "exists" && (
                        <Input
                          value={f.value}
                          onChange={(e) => setFilters((v) => v.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                          placeholder={f.op === "in" ? "opened, reopened" : "opened"}
                          aria-label={ts.value}
                          className="h-8 min-w-0 flex-1 text-xs"
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={ts.removeFilter}
                        title={ts.removeFilter}
                        onClick={() => setFilters((v) => v.filter((_, j) => j !== i))}
                        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-fit"
                    onClick={() => setFilters((v) => [...v, { path: "", op: "equals", value: "" }])}
                  >
                    <Plus />
                    {ts.addFilter}
                  </Button>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <label htmlFor="schedule-signing" className="text-xs font-medium">
                        {ts.signature}
                      </label>
                      <p className="text-xs text-muted-foreground">{ts.signatureHint}</p>
                    </div>
                    <Switch id="schedule-signing" checked={signing} onCheckedChange={setSigning} />
                  </div>
                  {signing && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={header}
                        onChange={(e) => setHeader(e.target.value)}
                        aria-label={ts.header}
                        placeholder={ts.header}
                        className="h-8 font-mono text-xs"
                      />
                      <Input
                        value={prefix}
                        onChange={(e) => setPrefix(e.target.value)}
                        aria-label={ts.prefix}
                        placeholder={ts.prefix}
                        className="h-8 font-mono text-xs"
                      />
                      <Input
                        type="password"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        aria-label={ts.secret}
                        placeholder={ts.secret}
                        autoComplete="off"
                        className="h-8 font-mono text-xs"
                      />
                      <Select value={encoding} onValueChange={(v) => setEncoding(v as "hex" | "base64")}>
                        <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label={ts.encoding}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hex">hex</SelectItem>
                          <SelectItem value="base64">base64</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className={field}>
                  <label htmlFor="schedule-dedupe" className="text-xs font-medium">
                    {ts.dedupe}
                  </label>
                  <Input
                    id="schedule-dedupe"
                    value={dedupe}
                    onChange={(e) => setDedupe(e.target.value)}
                    placeholder="{{headers.x-github-delivery}}"
                    className="h-8 font-mono text-xs"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">{ts.dedupeHint}</p>
                </div>
              </div>
            )}
          </fieldset>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              <RichText text={problem} />
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {ts.cancel}
          </Button>
          <Button
            type="submit"
            form="schedule-form"
            disabled={saving || !title.trim() || !prompt.trim() || (where === "board" && !boardId)}
          >
            {saving ? ts.saving : ts.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Segmented<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: [V, string][] }) {
  return (
    <div className={cn("grid gap-1 rounded-lg bg-muted p-1", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-8 truncate rounded-md px-2 text-sm text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === v && "bg-background text-foreground shadow-xs",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
