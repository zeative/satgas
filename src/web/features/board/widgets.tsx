import { Link } from "@tanstack/react-router";
import { ArrowUp, CalendarClock, Check, Copy, CornerDownRight, ExternalLink, type LucideIcon, Play, Plus, Webhook, X } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { toast } from "sonner";
import { LinkedText } from "@/components/linked-text";
import { openExternal } from "@/components/outbound-link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fmtDateTime, isMac, t } from "@/i18n";
import { mergeMission } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { loadMemory, saveEntry, useMemory } from "@/stores/memory";
import { openReview } from "@/stores/review";
import { branchAction, loadGit, sendPrompt, useRuns, watchPull } from "@/stores/runs";
import { loadSchedules, runScheduleNow, saveSchedule, useSchedules } from "@/stores/schedules";
import type { Card } from "../../../shared/board";
import { nextRun, type Trigger } from "../../../shared/schedules";
import type { GitInfo } from "../../../shared/types";
import { type CheckItem, linkedCards, validVariable } from "../../../shared/widgets";
import { useRevert } from "../workspace/revert-dialog";
import { Chip, ChoiceChip } from "./chip";
import { useBoard } from "./context";

const tw = t.widget;
const fail = (e: Error) => toast.error(e.message);
const FIELD =
  "nodrag nowheel w-full resize-none rounded-md bg-muted/40 px-2.5 py-2 text-xs leading-5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40";

// A widget's body: what it is for, the live state of the thing it stands for, and its one main action at the foot.
export const WidgetBody = memo(function WidgetBody({ card }: { card: Card }) {
  switch (card.widget) {
    case "trigger":
      return <TriggerWidget card={card} />;
    case "button":
      return <ButtonWidget card={card} />;
    case "checklist":
      return <ChecklistWidget card={card} />;
    case "variables":
      return <VariablesWidget card={card} />;
    case "comment":
      return <CommentWidget card={card} />;
    case "pull":
      return <PullWidget card={card} />;
    case "branch":
      return <BranchWidget card={card} />;
    case "changes":
      return <ChangesWidget card={card} />;
    case "round":
      return <RoundWidget card={card} />;
    case "fork":
      return <ForkWidget />;
    case "memory":
      return <MemoryWidget card={card} />;
    default:
      return null;
  }
});

function Shell({ children, foot }: { children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="flex size-full flex-col gap-2.5 p-2.5">
      <div className="nowheel flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border bg-muted/25">{children}</div>
      {foot}
    </div>
  );
}

function Row({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-10 flex-wrap items-center gap-1.5 border-b px-2.5 py-1.5 text-xs last:border-b-0", className)}>
      {label && <span className="w-20 shrink-0 text-muted-foreground">{label}</span>}
      {children}
    </div>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 py-3 text-xs text-muted-foreground">{children}</p>;
}

function Foot({
  label,
  icon: Icon,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" className="nodrag h-9 w-full gap-2" disabled={disabled || busy} onClick={onClick}>
      {label}
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
    </Button>
  );
}

// Saves on blur, so typing never sends a change per key.
function PromptField({ card, placeholder, onSaved }: { card: Card; placeholder: string; onSaved?: (text: string) => void }) {
  const { commit } = useBoard();
  const [text, setText] = useState(card.text ?? "");
  useEffect(() => setText(card.text ?? ""), [card.text]);
  return (
    <textarea
      value={text}
      rows={3}
      aria-label={placeholder}
      placeholder={placeholder}
      className={cn(FIELD, "min-h-16")}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
      onBlur={() => {
        const next = text.trim();
        if (next === (card.text ?? "")) return;
        commit([{ op: "patch", id: card.id, patch: { text: next } }]);
        onSaved?.(next);
      }}
    />
  );
}

// ——— Trigger: a schedule or webhook of this board, drawn as the sentence it reads as ———

const DEFAULT_TRIGGER: Trigger = { type: "daily", time: "09:00", weekdays: [] };
const EVERY = [15, 30, 60, 120, 360, 720, 1440];
const everyLabel = (m: number) =>
  m % 1440 === 0 ? tw.trigger.days(m / 1440) : m % 60 === 0 ? tw.trigger.hours(m / 60) : tw.trigger.minutes(m);
const DAY_SETS: { label: string; days: number[] }[] = [
  { label: tw.trigger.everyDay, days: [] },
  { label: tw.trigger.weekdays, days: [1, 2, 3, 4, 5] },
  { label: tw.trigger.weekends, days: [0, 6] },
];
const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((d, i) => d === b[i]);
const daysLabel = (days: number[]) =>
  DAY_SETS.find((s) => sameDays(s.days, days))?.label ?? days.map((d) => tw.trigger.dayNames[d]).join(", ");
const titleOf = (prompt: string) => prompt.replace(/\s+/g, " ").trim().slice(0, 60) || tw.kind.trigger;

function TriggerWidget({ card }: { card: Card }) {
  const { commit, runId } = useBoard();
  const list = useSchedules((s) => s.list);
  const hookBase = useSchedules((s) => s.hookBase);
  useEffect(() => {
    if (!useSchedules.getState().list) void loadSchedules();
  }, []);
  const s = card.ref ? list?.find((x) => x.id === card.ref) : undefined;
  const gone = !!card.ref && !!list && !s;
  const [draft, setDraft] = useState<Trigger>(DEFAULT_TRIGGER);
  const [busy, setBusy] = useState(false);
  const trigger = s?.trigger ?? draft;
  const prompt = card.text?.trim() ?? "";

  const change = (next: { trigger?: Trigger; prompt?: string; enabled?: boolean }) => {
    if (!s) {
      if (next.trigger) setDraft(next.trigger);
      return;
    }
    void saveSchedule({ ...s, ...next, ...(next.prompt ? { title: titleOf(next.prompt) } : {}) }, s.id).catch(fail);
  };
  const create = () => {
    if (!prompt) return;
    setBusy(true);
    void saveSchedule({ title: titleOf(prompt), prompt, boardId: runId, trigger: s?.trigger ?? draft, enabled: true })
      .then((saved) => commit([{ op: "patch", id: card.id, patch: { ref: saved.id } }]))
      .catch(fail)
      .finally(() => setBusy(false));
  };
  const runNow = () => {
    if (!s) return;
    setBusy(true);
    void runScheduleNow(s.id)
      .then(() => toast.success(tw.trigger.started))
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const kind = trigger.type === "webhook" ? "webhook" : "schedule";
  const next = s ? (s.enabled ? s.nextRunAt : null) : nextRun({ trigger, enabled: true, createdAt: Date.now() });
  const url = trigger.type === "webhook" && "token" in trigger ? `${hookBase}/hooks/${trigger.token}` : "";

  return (
    <Shell
      foot={
        !s || gone ? (
          <Foot label={gone ? tw.trigger.setUpAgain : tw.trigger.turnOn} busy={busy} disabled={!prompt} onClick={create} />
        ) : (
          <div className="flex items-center gap-2">
            <Switch className="nodrag" checked={s.enabled} aria-label={tw.trigger.on_} onCheckedChange={(enabled) => change({ enabled })} />
            <Button type="button" className="nodrag h-9 flex-1 gap-2" disabled={busy} onClick={runNow}>
              {tw.trigger.runNow}
              <Play className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )
      }
    >
      <Row className="justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          {kind === "webhook" ? (
            <Webhook className="size-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <ChoiceChip
            title={tw.kind.trigger}
            value={kind}
            options={[
              { value: "schedule", label: tw.trigger.schedule },
              { value: "webhook", label: tw.trigger.webhook },
            ]}
            onChange={(v) =>
              change({ trigger: v === "webhook" ? ({ type: "webhook", filters: [] } as unknown as Trigger) : DEFAULT_TRIGGER })
            }
          />
        </span>
        {gone && <span className="text-destructive">{tw.trigger.gone}</span>}
      </Row>
      {trigger.type === "webhook" ? (
        <Row>
          {url ? (
            <>
              <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={url}>
                {url}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="nodrag size-7"
                aria-label={tw.trigger.copy}
                title={tw.trigger.copy}
                onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success(tw.trigger.copied), fail)}
              >
                <Copy className="size-3.5" />
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground">{tw.trigger.url}</span>
          )}
        </Row>
      ) : (
        <Row>
          <ChoiceChip
            title={tw.trigger.schedule}
            value={trigger.type}
            options={[
              { value: "daily", label: tw.trigger.daily },
              { value: "interval", label: tw.trigger.interval },
            ]}
            onChange={(v) => change({ trigger: v === "daily" ? DEFAULT_TRIGGER : { type: "interval", everyMinutes: 60 } })}
          />
          {trigger.type === "interval" ? (
            <ChoiceChip
              title={tw.trigger.interval}
              value={trigger.everyMinutes}
              options={[...new Set([...EVERY, trigger.everyMinutes])]
                .sort((a, b) => a - b)
                .map((m) => ({ value: m, label: everyLabel(m) }))}
              onChange={(m) => change({ trigger: { type: "interval", everyMinutes: m } })}
            />
          ) : (
            trigger.type === "daily" && (
              <>
                <span className="text-muted-foreground">{tw.trigger.on}</span>
                <DaysChip days={trigger.weekdays} onChange={(weekdays) => change({ trigger: { ...trigger, weekdays } })} />
                <span className="text-muted-foreground">{tw.trigger.at}</span>
                <TimeChip time={trigger.time} onChange={(time) => change({ trigger: { ...trigger, time } })} />
              </>
            )
          )}
        </Row>
      )}
      <Row label={trigger.type === "webhook" ? tw.trigger.lastRun : tw.trigger.nextRun}>
        <span className="tabular-nums">
          {trigger.type === "webhook"
            ? s?.lastRunAt
              ? fmtDateTime(s.lastRunAt)
              : tw.trigger.notYet
            : s && !s.enabled
              ? tw.trigger.paused
              : next
                ? fmtDateTime(next)
                : "—"}
        </span>
        {trigger.type === "webhook" && s && (
          <Link to="/schedules" className="nodrag ms-auto text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {tw.trigger.filters}
          </Link>
        )}
      </Row>
      <div className="p-2.5">
        <PromptField card={card} placeholder={tw.trigger.prompt} onSaved={(text) => text && change({ prompt: text })} />
        {!s && !prompt && <p className="pt-1.5 text-[11px] text-muted-foreground">{tw.trigger.needsPrompt}</p>}
        {s?.lastError && <p className="pt-1.5 text-[11px] text-destructive">{s.lastError}</p>}
      </div>
    </Shell>
  );
}

function DaysChip({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <Chip label={daysLabel(days)} title={tw.trigger.on}>
      {(close) => (
        <div className="flex flex-col gap-1 p-1">
          {DAY_SETS.map((set) => (
            <button
              key={set.label}
              type="button"
              onClick={() => {
                close();
                onChange(set.days);
              }}
              className={cn(
                "flex h-8 items-center rounded-md px-2 text-start text-xs hover:bg-muted",
                sameDays(set.days, days) && "bg-muted",
              )}
            >
              {set.label}
            </button>
          ))}
          <div className="flex gap-1 border-t pt-1.5">
            {tw.trigger.dayNames.map((name, d) => {
              const on = days.length === 0 || days.includes(d);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const base = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
                    const next = on ? base.filter((x) => x !== d) : [...base, d].sort();
                    if (next.length) onChange(next.length === 7 ? [] : next);
                  }}
                  className={cn(
                    "flex h-7 w-9 items-center justify-center rounded-md text-[11px] hover:bg-muted",
                    on ? "bg-foreground text-background hover:bg-foreground/90" : "text-muted-foreground",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Chip>
  );
}

function TimeChip({ time, onChange }: { time: string; onChange: (time: string) => void }) {
  const [value, setValue] = useState(time);
  useEffect(() => setValue(time), [time]);
  return (
    <Chip label={time} title={tw.trigger.at}>
      {(close) => (
        <form
          className="p-1"
          onSubmit={(e) => {
            e.preventDefault();
            close();
            if (/^\d{2}:\d{2}$/.test(value) && value !== time) onChange(value);
          }}
        >
          <input
            type="time"
            value={value}
            aria-label={tw.trigger.at}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              if (/^\d{2}:\d{2}$/.test(value) && value !== time) onChange(value);
            }}
            className="h-8 rounded-md border bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </form>
      )}
    </Chip>
  );
}

// ——— Button: one saved message, sent to the team on a click ———

export async function runButton(runId: string, card: Card) {
  const prompt = card.text?.trim();
  if (!prompt) return;
  const board = useRuns.getState().run?.board;
  await sendPrompt(runId, prompt, [], linkedCards(board, card.id));
  toast.success(tw.button.sent);
}

function ButtonWidget({ card }: { card: Card }) {
  const { runId } = useBoard();
  const [busy, setBusy] = useState(false);
  return (
    <Shell
      foot={
        <Foot
          label={tw.button.run}
          icon={Play}
          busy={busy}
          disabled={!card.text?.trim()}
          onClick={() => {
            setBusy(true);
            void runButton(runId, card)
              .catch(fail)
              .finally(() => setBusy(false));
          }}
        />
      }
    >
      <div className="p-2.5">
        <PromptField card={card} placeholder={tw.button.prompt} />
      </div>
    </Shell>
  );
}

// ——— Checklist: what done means, ticked by the person or the team ———

function ChecklistWidget({ card }: { card: Card }) {
  const { commit } = useBoard();
  const items = card.items ?? [];
  const [adding, setAdding] = useState("");
  const set = (next: CheckItem[]) => commit([{ op: "patch", id: card.id, patch: { items: next } }]);
  const done = items.filter((i) => i.done).length;
  return (
    <Shell>
      {items.length > 0 && (
        <Row className="justify-between text-muted-foreground">
          <span className="tabular-nums">{tw.checklist.progress(done, items.length)}</span>
        </Row>
      )}
      <ul className="flex flex-col">
        {items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: items have no identity beyond their place in the list.
          <li key={i} className="group/item flex min-h-9 items-center gap-2 border-b px-2.5 text-xs last:border-b-0">
            <input
              type="checkbox"
              checked={!!item.done}
              aria-label={item.text}
              onChange={(e) =>
                set(
                  items.map((x, j) => (j === i ? { text: x.text, ...(e.target.checked ? { done: true, by: "person" as const } : {}) } : x)),
                )
              }
              className="nodrag size-3.5 shrink-0 accent-foreground"
            />
            <span className={cn("min-w-0 flex-1 break-words", item.done && "text-muted-foreground line-through")}>{item.text}</span>
            {item.done && item.by === "ai" && (
              <span title={tw.checklist.byTeam} className="shrink-0 text-[11px] text-muted-foreground">
                {tw.checklist.team}
              </span>
            )}
            <button
              type="button"
              aria-label={tw.checklist.remove}
              title={tw.checklist.remove}
              onClick={() => set(items.filter((_, j) => j !== i))}
              className="nodrag flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2 px-2.5 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const text = adding.trim();
          if (!text) return;
          set([...items, { text }]);
          setAdding("");
        }}
      >
        <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={tw.checklist.add}
          aria-label={tw.checklist.add}
          className="nodrag h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </form>
    </Shell>
  );
}

// ——— Variables: names the board's messages can use as {{name}} ———

function VariablesWidget({ card }: { card: Card }) {
  const { commit } = useBoard();
  const rows = card.rows?.length ? card.rows : [["", ""]];
  const [draft, setDraft] = useState(rows);
  useEffect(() => setDraft(card.rows?.length ? card.rows : [["", ""]]), [card.rows]);
  const save = (next: string[][]) => commit([{ op: "patch", id: card.id, patch: { rows: next.filter((r) => r[0] || r[1]) } }]);
  return (
    <Shell>
      {draft.map((row, i) => {
        const name = row[0] ?? "";
        const bad = !!name && !validVariable(name);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond their place.
          <div key={i} className="group/var flex h-10 items-center gap-1.5 border-b px-2.5 text-xs">
            {(["name", "value"] as const).map((field, c) => (
              <input
                key={field}
                value={row[c] ?? ""}
                placeholder={tw.variables[field]}
                aria-label={tw.variables[field]}
                aria-invalid={c === 0 && bad}
                spellCheck={false}
                onChange={(e) =>
                  setDraft(draft.map((r, j) => (j === i ? (c === 0 ? [e.target.value, r[1] ?? ""] : [r[0] ?? "", e.target.value]) : r)))
                }
                onKeyDown={(e) => e.stopPropagation()}
                onBlur={() => save(draft)}
                className={cn(
                  "nodrag h-7 min-w-0 rounded-md bg-muted/40 px-2 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                  c === 0 ? "w-28 shrink-0 font-mono" : "flex-1",
                  bad && "ring-1 ring-destructive",
                )}
              />
            ))}
            <button
              type="button"
              aria-label={tw.variables.remove}
              title={tw.variables.remove}
              onClick={() => save(draft.filter((_, j) => j !== i))}
              className="nodrag flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/var:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setDraft([...draft, ["", ""]])}
          className="nodrag flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {tw.variables.add}
        </button>
      </div>
      <p className="mt-auto px-2.5 pb-2 text-[11px] text-muted-foreground">{tw.variables.hint}</p>
    </Shell>
  );
}

// ——— Comment: a note about one card that goes to the lead with that card as its context ———

function CommentWidget({ card }: { card: Card }) {
  const { commit, runId } = useBoard();
  const about = useRuns((s) => (card.ref ? s.run?.board?.cards.find((c) => c.id === card.ref) : undefined));
  const [text, setText] = useState(card.text ?? "");
  useEffect(() => setText(card.text ?? ""), [card.text]);
  const [busy, setBusy] = useState(false);
  const label = about ? about.title || about.text?.slice(0, 40) || t.board.kind[about.kind] : undefined;
  const save = (next: string) => next !== (card.text ?? "") && commit([{ op: "patch", id: card.id, patch: { text: next } }]);
  // Sends what is typed now, not the last saved text: the press on Send blurs the field before its save lands.
  const send = () => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setBusy(true);
    void sendPrompt(runId, prompt, [], card.ref ? [card.ref] : [])
      .then(() => commit([{ op: "patch", id: card.id, patch: { text: prompt, sentAt: Date.now() } }]))
      .catch(fail)
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex size-full flex-col gap-2 p-3">
      {label && (
        <p className="flex min-w-0 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <CornerDownRight className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{tw.comment.about(label)}</span>
        </p>
      )}
      <textarea
        value={text}
        aria-label={tw.comment.placeholder}
        placeholder={tw.comment.placeholder}
        className="nodrag nowheel min-h-0 w-full flex-1 resize-none bg-transparent text-[13px] leading-5 outline-none placeholder:text-muted-foreground"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        onBlur={() => save(text.trim())}
      />
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
          {card.sentAt && text.trim() === (card.text ?? "") ? (
            <>
              <Check className="size-3 shrink-0" aria-hidden="true" />
              {tw.comment.sent}
            </>
          ) : (
            tw.comment.hint(isMac ? "⌘↵" : "Ctrl ↵")
          )}
        </span>
        <Button type="button" size="sm" className="nodrag h-7 gap-1.5 px-2.5 text-xs" disabled={!text.trim() || busy} onClick={send}>
          {tw.comment.sendShort}
          <ArrowUp className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ——— Live widgets: a picker until they point at something, then that thing as it is now ———

function Picker({
  title,
  items,
  onPick,
  loading,
}: {
  title: string;
  items: { id: string; label: string; meta?: string }[];
  onPick: (id: string) => void;
  loading?: boolean;
}) {
  return (
    <Shell>
      <Row>
        <span className="font-medium">{title}</span>
      </Row>
      {loading ? (
        <Quiet>{tw.pick.loading}</Quiet>
      ) : items.length ? (
        <ul className="flex flex-col">
          {items.map((it) => (
            <li key={it.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(it.id)}
                className="nodrag flex min-h-9 w-full items-center gap-2 px-2.5 text-start text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.meta && <span className="shrink-0 text-muted-foreground tabular-nums">{it.meta}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>{tw.pick.none}</Quiet>
      )}
    </Shell>
  );
}

function usePick(card: Card) {
  const { commit } = useBoard();
  return (ref: string) => commit([{ op: "patch", id: card.id, patch: { ref } }]);
}

function PullWidget({ card }: { card: Card }) {
  const { runId } = useBoard();
  const pulls = useRuns((s) => s.run?.pulls);
  const pick = usePick(card);
  const pr = pulls?.find((p) => p.url === card.ref);
  if (!card.ref)
    return (
      <Picker
        title={tw.pick.pull}
        items={(pulls ?? []).map((p) => ({
          id: p.url,
          label: `#${p.number} ${p.title ?? p.repo}`,
          meta: p.state ? tw.pull.state[p.state] : undefined,
        }))}
        onPick={pick}
      />
    );
  if (!pr)
    return (
      <Shell>
        <Quiet>{tw.pull.gone}</Quiet>
      </Shell>
    );
  return (
    <Shell
      foot={
        <Button type="button" variant="outline" className="nodrag h-9 w-full gap-2" onClick={() => openExternal(pr.url)}>
          {tw.pull.open}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </Button>
      }
    >
      <Row>
        <span className="font-mono text-muted-foreground tabular-nums">#{pr.number}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={pr.title}>
          {pr.title ?? pr.repo}
        </span>
        {pr.state && <span className="shrink-0 text-muted-foreground">{tw.pull.state[pr.state]}</span>}
      </Row>
      <Row>
        <span className={cn(pr.checks === "failing" && "text-destructive")}>{tw.pull.checks[pr.checks ?? "none"]}</span>
        <span className="text-muted-foreground">/</span>
        <span className={cn(pr.review === "changes" && "text-destructive")}>{tw.pull.review[pr.review ?? "none"]}</span>
        {pr.conflict && <span className="text-destructive">{tw.pull.conflict}</span>}
      </Row>
      <Row className="justify-between">
        <span className="flex items-center gap-2">
          <Switch
            className="nodrag"
            aria-label={tw.pull.watch}
            checked={pr.watch}
            onCheckedChange={(watch) => void watchPull(runId, pr.repo, pr.number, watch).catch(fail)}
          />
          {tw.pull.watch}
        </span>
        {pr.watch && <span className="text-muted-foreground tabular-nums">{tw.pull.fixes(pr.fixes)}</span>}
      </Row>
      {pr.error && <Quiet>{pr.error}</Quiet>}
    </Shell>
  );
}

function BranchWidget({ card }: { card: Card }) {
  const { runId } = useBoard();
  const pick = usePick(card);
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [busy, setBusy] = useState(false);
  // Read on mount and after each action; git has no stream, and a branch rarely changes while a card is on screen.
  const reload = () => void loadGit(runId).then(setInfo, () => setInfo({ repo: false }));
  useEffect(reload, [runId]);
  const branches = info?.branches ?? [];
  if (!card.ref)
    return (
      <Picker
        title={tw.pick.branch}
        loading={!info}
        items={branches.map((b) => ({ id: b.name, label: b.name, meta: b.merged ? tw.branch.merged : undefined }))}
        onPick={pick}
      />
    );
  const b = branches.find((x) => x.name === card.ref);
  const act = (action: "merge" | "drop") => {
    setBusy(true);
    void branchAction(runId, action, card.ref ?? "")
      .then(reload)
      .catch(fail)
      .finally(() => setBusy(false));
  };
  return (
    <Shell
      foot={
        b && !b.merged ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="nodrag h-9" disabled={busy} onClick={() => act("drop")}>
              {tw.branch.drop}
            </Button>
            <Button type="button" className="nodrag h-9 flex-1" disabled={busy} onClick={() => act("merge")}>
              {tw.branch.merge}
            </Button>
          </div>
        ) : undefined
      }
    >
      <Row>
        <span className="min-w-0 flex-1 truncate font-mono" title={card.ref}>
          {card.ref}
        </span>
      </Row>
      <Row>
        <span className="text-muted-foreground">
          {!info ? tw.pick.loading : !b ? tw.branch.gone : b.merged ? tw.branch.merged : tw.branch.open}
        </span>
      </Row>
    </Shell>
  );
}

function ChangesWidget({ card }: { card: Card }) {
  const { runId } = useBoard();
  const pick = usePick(card);
  const nodes = useRuns((s) => s.run?.nodes);
  const { revert, dialog } = useRevert(runId);
  if (!card.ref)
    return (
      <Picker
        title={tw.pick.changes}
        items={(nodes ?? [])
          .filter((n) => n.changes?.files.length)
          .map((n) => ({ id: n.id, label: n.title, meta: tw.changes.files(n.changes?.files.length ?? 0) }))}
        onPick={pick}
      />
    );
  const node = nodes?.find((n) => n.id === card.ref);
  if (!node)
    return (
      <Shell>
        <Quiet>{tw.changes.gone}</Quiet>
      </Shell>
    );
  const files = node.changes?.files ?? [];
  const live = files.filter((f) => !node.changes?.reverted?.includes(f.path));
  return (
    <Shell
      foot={
        files.length ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="nodrag h-9"
              disabled={!live.length}
              onClick={() =>
                revert(
                  node.id,
                  live.map((f) => f.path),
                )
              }
            >
              {live.length ? tw.changes.undo : tw.changes.undone}
            </Button>
            <Button type="button" className="nodrag h-9 flex-1" onClick={() => openReview({ kind: "node", node: node.id })}>
              {tw.changes.review}
            </Button>
          </div>
        ) : undefined
      }
    >
      {dialog}
      <Row>
        <span className="min-w-0 flex-1 truncate font-medium">{node.title}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{tw.changes.files(files.length)}</span>
      </Row>
      {files.length ? (
        <ul className="flex flex-col">
          {files.slice(0, 40).map((f) => (
            <li key={f.path} className="flex h-8 items-center gap-2 border-b px-2.5 text-xs last:border-b-0">
              <span
                className={cn(
                  "w-4 shrink-0 font-mono",
                  f.change === "added" && "text-emerald-600 dark:text-emerald-500",
                  f.change === "deleted" && "text-destructive",
                )}
              >
                {f.change === "added" ? "A" : f.change === "deleted" ? "D" : "M"}
              </span>
              <span
                className={cn(
                  "min-w-0 truncate font-mono",
                  node.changes?.reverted?.includes(f.path) && "text-muted-foreground line-through",
                )}
                title={f.path}
              >
                {f.path}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>{tw.changes.none}</Quiet>
      )}
    </Shell>
  );
}

function RoundWidget({ card }: { card: Card }) {
  const pick = usePick(card);
  const run = useRuns((s) => s.run);
  const prompts = run ? [run.prompt, ...(run.rounds ?? [])] : [];
  if (!card.ref)
    return (
      <Picker
        title={tw.pick.round}
        items={prompts.map((p, i) => ({ id: String(i), label: p.replace(/\s+/g, " ").slice(0, 80), meta: tw.round.label(i) }))}
        onPick={pick}
      />
    );
  const index = Number(card.ref);
  const prompt = prompts[index];
  if (prompt === undefined || !run)
    return (
      <Shell>
        <Quiet>{tw.round.gone}</Quiet>
      </Shell>
    );
  const tasks = run.nodes.filter((n) => (n.round ?? 0) === index);
  const done = tasks.filter((n) => n.status === "done").length;
  const origin = run.origins?.[index];
  return (
    <Shell
      foot={
        tasks.some((n) => n.changes?.files.length) ? (
          <Button type="button" className="nodrag h-9 w-full" onClick={() => openReview({ kind: "round", round: index })}>
            {tw.round.review}
          </Button>
        ) : undefined
      }
    >
      <Row>
        <span className="font-medium">{tw.round.label(index)}</span>
        {origin && <span className="text-muted-foreground">{origin.label}</span>}
        {tasks.length > 0 && <span className="ms-auto text-muted-foreground tabular-nums">{tw.round.tasks(done, tasks.length)}</span>}
      </Row>
      <p className="px-2.5 py-2 text-xs leading-5 break-words whitespace-pre-wrap">
        <LinkedText text={prompt} />
      </p>
    </Shell>
  );
}

function ForkWidget() {
  const run = useRuns((s) => s.run);
  const [busy, setBusy] = useState(false);
  if (!run?.forkOf)
    return (
      <Shell>
        <Quiet>{tw.fork.none}</Quiet>
      </Shell>
    );
  return (
    <Shell
      foot={
        <Foot
          label={tw.fork.merge}
          busy={busy}
          onClick={() => {
            setBusy(true);
            void mergeMission(run).finally(() => setBusy(false));
          }}
        />
      }
    >
      <Row>
        <span className="min-w-0 truncate">{tw.fork.from(run.forkOf.title)}</span>
      </Row>
      {run.forkOf.branch && (
        <Row>
          <span className="truncate font-mono text-muted-foreground">{run.forkOf.branch}</span>
        </Row>
      )}
    </Shell>
  );
}

function MemoryWidget({ card }: { card: Card }) {
  const pick = usePick(card);
  const store = useMemory((s) => s.store);
  useEffect(() => {
    if (!useMemory.getState().store) void loadMemory();
  }, []);
  const entries = store?.entries ?? [];
  if (!card.ref)
    return (
      <Picker
        title={tw.pick.memory}
        loading={!store}
        items={entries.map((e) => ({ id: e.id, label: e.text, meta: e.kind === "rule" ? tw.memory.rule : tw.memory.memory }))}
        onPick={pick}
      />
    );
  const entry = entries.find((e) => e.id === card.ref);
  if (!entry)
    return (
      <Shell>
        <Quiet>{store ? tw.memory.gone : tw.pick.loading}</Quiet>
      </Shell>
    );
  return (
    <Shell>
      <Row className="justify-between">
        <span className="text-muted-foreground">{entry.kind === "rule" ? tw.memory.rule : tw.memory.memory}</span>
        <span className="flex items-center gap-2">
          {tw.memory.on}
          <Switch
            className="nodrag"
            aria-label={tw.memory.on}
            checked={entry.enabled}
            onCheckedChange={(enabled) => void saveEntry({ ...entry, enabled }, entry.id).catch(fail)}
          />
        </span>
      </Row>
      <p className={cn("px-2.5 py-2 text-xs leading-5 break-words", !entry.enabled && "text-muted-foreground")}>{entry.text}</p>
    </Shell>
  );
}
