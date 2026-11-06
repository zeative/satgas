import { Check, ChevronDown, ChevronUp, MessageCircleQuestionMark, Square } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Kbd } from "@/components/kbd";
import { StatusIcon } from "@/components/status";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cancelMission } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { answerQuestions } from "@/stores/runs";
import { type Answer, type Asked, answerText } from "../../../shared/questions";
import type { Run } from "../../../shared/types";
import { ModelPicker } from "./model-picker";

// Where a round's questions stand in the chat: waiting below, answered, or set aside.
export function AskedNote({ asked, waiting }: { asked: Asked; waiting: boolean }) {
  const n = asked.questions.length;
  if (waiting)
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <MessageCircleQuestionMark className="size-3.5 shrink-0 text-signal-ink" aria-hidden="true" />
        <span>
          {t.ask.count(n)} · {t.ask.waiting}
        </span>
      </p>
    );
  if (!asked.answers)
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <StatusIcon status="cancelled" className="size-3.5" />
        {t.ask.setAside(n)}
      </p>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{t.ask.answered(n)}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2.5 text-[13px] leading-5">
        {asked.questions.map((q, i) => (
          <div key={q.question} className="contents">
            <dt className="max-w-28 truncate text-muted-foreground" title={q.question}>
              {q.header}
            </dt>
            <dd className="whitespace-pre-wrap [overflow-wrap:break-word]">{answerText(asked.answers?.[i])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// The chat's door while the planner waits: one question at a time above the composer, whose text is the person's own answer.
export function QuestionComposer({ run, asked }: { run: Run; asked: Asked }) {
  const { questions } = asked;
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<string[][]>(() => questions.map(() => []));
  const [owns, setOwns] = useState<string[]>(() => questions.map(() => ""));
  const [folded, setFolded] = useState(false);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLFieldSetElement>(null);
  const id = useId();
  const q = questions[index];
  const picked = picks[index] ?? [];
  const own = owns[index] ?? "";
  const last = index === questions.length - 1;
  const answered = picked.length > 0 || !!own.trim();

  const options = () => [...(list.current?.querySelectorAll<HTMLInputElement>("[data-option]") ?? [])];

  // Lands on the options when nothing else holds focus, so number keys and Enter answer right away.
  useEffect(() => {
    if (document.activeElement === document.body) list.current?.querySelector<HTMLInputElement>("[data-option]")?.focus();
  }, []);

  // Grows with the text, up to about eight lines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the answer text.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [own]);

  if (!q) return null;

  // Returns the new picks too, so Enter can move on without waiting for the state to settle.
  const choose = (label: string) => {
    const mine = q.multiSelect ? (picked.includes(label) ? picked.filter((p) => p !== label) : [...picked, label]) : [label];
    const next = picks.map((p, i) => (i === index ? mine : p));
    setPicks(next);
    return next;
  };

  const submit = async (chosen: string[][]) => {
    setSending(true);
    // A single-choice question takes the typed answer instead of the pick; several picks keep the words as an addition.
    const answers: Answer[] = questions.map((question, i) => {
      const words = owns[i]?.trim() ?? "";
      const mine = chosen[i] ?? [];
      return words ? { picked: question.multiSelect ? mine : [], own: words } : { picked: mine };
    });
    try {
      // The run leaves "asking" through the socket, and this composer goes with it.
      await answerQuestions(run.id, answers);
    } catch (e) {
      toast.error((e as Error).message);
      setSending(false);
    }
  };

  const advance = (chosen = picks) => {
    if (sending || (!chosen[index]?.length && !owns[index]?.trim())) return;
    if (last) {
      void submit(chosen);
      return;
    }
    const onOptions = list.current?.contains(document.activeElement);
    setIndex(index + 1);
    setFolded(false);
    // Keyboard answers keep going option by option; a typed answer keeps the cursor in the box.
    if (onOptions) requestAnimationFrame(() => options()[0]?.focus());
  };

  const back = () => {
    setIndex(index - 1);
    setFolded(false);
  };

  const onOptionKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const items = options();
    const at = items.indexOf(document.activeElement as HTMLInputElement);
    // Radios move and pick with the arrows on their own; checkboxes only get the moving.
    if (q.multiSelect && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      return;
    }
    const n = Number(e.key);
    const option = q.options[n - 1];
    if (option && Number.isInteger(n)) {
      e.preventDefault();
      choose(option.label);
      items[n - 1]?.focus();
      return;
    }
    // Enter answers with the focused option (several picks stay as they are) and moves on.
    if (e.key === "Enter") {
      e.preventDefault();
      const focused = q.options[at];
      advance(focused && !q.multiSelect ? choose(focused.label) : picks);
    }
  };

  return (
    <div className="m-2 mt-0 flex shrink-0 flex-col">
      <section aria-labelledby={`${id}-q`} className="mx-2.5 -mb-3 rounded-t-xl border border-b-0 bg-background px-3 pt-2 pb-5">
        <button
          type="button"
          aria-expanded={!folded}
          aria-label={`${folded ? t.ask.unfold : t.ask.fold} · ${t.ask.position(index + 1, questions.length)}`}
          onClick={() => setFolded((v) => !v)}
          className="flex h-6 w-full items-center gap-1.5 rounded text-start text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="shrink-0 font-medium">{q.header}</span>
          {folded && (
            <>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate">{q.question}</span>
            </>
          )}
          <span className="ms-auto shrink-0 font-mono tabular-nums">
            {index + 1}/{questions.length}
          </span>
          {folded ? <ChevronUp className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
        </button>
        <p id={`${id}-q`} className={cn("mt-1 text-sm leading-5", folded && "sr-only")}>
          {q.question}
        </p>
        {!folded && (
          <fieldset ref={list} aria-labelledby={`${id}-q`} className="-mx-1.5 mt-1.5 flex max-h-[40vh] min-w-0 flex-col overflow-y-auto">
            {q.options.map((o, i) => {
              const on = picked.includes(o.label);
              return (
                <label
                  key={o.label}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted has-[:focus-visible]:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <input
                    type={q.multiSelect ? "checkbox" : "radio"}
                    name={`${id}-${index}`}
                    data-option
                    checked={on}
                    onChange={() => choose(o.label)}
                    onKeyDown={onOptionKey}
                    className="sr-only"
                  />
                  <Tick on={on} multi={q.multiSelect} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm leading-5">{o.label}</span>
                    {o.description && <span className="text-xs leading-4 text-muted-foreground">{o.description}</span>}
                  </span>
                  <Kbd className="mt-px border-transparent">{i + 1}</Kbd>
                </label>
              );
            })}
          </fieldset>
        )}
      </section>

      <form
        aria-label={t.ask.answer}
        onSubmit={(e) => {
          e.preventDefault();
          advance();
        }}
        className="relative flex flex-col rounded-xl border bg-background transition-colors focus-within:border-foreground/25"
      >
        <label htmlFor={`${id}-own`} className="sr-only">
          {t.ask.answer}
        </label>
        <textarea
          id={`${id}-own`}
          ref={field}
          rows={2}
          value={own}
          placeholder={picked.length ? t.ask.placeholder : t.ask.placeholderEmpty}
          onChange={(e) => {
            const text = e.target.value;
            setOwns((all) => all.map((v, i) => (i === index ? text : v)));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              advance();
            }
          }}
          className="max-h-40 min-h-12 w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-5 outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-1 px-1.5 pt-1 pb-1.5">
          <ModelPicker />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={t.ask.stop}
            title={t.ask.stop}
            disabled={stopping || sending}
            onClick={() => {
              setStopping(true);
              void cancelMission(run).then((ok) => ok || setStopping(false));
            }}
            className="ms-auto size-8 rounded-full"
          >
            {/* Filled, so it reads as stop and never as an empty checkbox. */}
            <Square className="size-3 fill-current" />
          </Button>
          {index > 0 && (
            <Button type="button" variant="ghost" size="sm" disabled={sending} onClick={back} className="h-8 rounded-full px-3">
              {t.ask.back}
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={!answered || sending}
            className="h-8 rounded-full bg-signal px-3.5 text-signal-foreground hover:bg-signal/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            {sending ? t.ask.sending : last ? t.ask.send : t.ask.next}
          </Button>
        </div>
      </form>
    </div>
  );
}

// A radio dot or a checkbox, filled with the signal color when picked; the shape says which kind it is.
function Tick({ on, multi }: { on: boolean; multi: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors",
        multi ? "rounded-[5px]" : "rounded-full",
        on ? "border-signal bg-signal text-signal-foreground" : "border-foreground/25",
      )}
    >
      {on && (multi ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-signal-foreground" />)}
    </span>
  );
}
