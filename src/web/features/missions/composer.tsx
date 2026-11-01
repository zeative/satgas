import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { openMission } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { createRun } from "@/stores/runs";
import { loadSettings, useSettings } from "@/stores/settings";
import { ComposerMenu } from "./composer-menu";
import { ModelPicker } from "./model-picker";

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

// The one way a board starts: a brief, plus quick switches for the agents and connectors that will take it.
export function Composer({ value, onChange, className }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const invalid = error === t.missionRequired;

  useEffect(() => {
    textarea.current?.focus();
    if (!useSettings.getState().settings) void loadSettings();
  }, []);

  const submit = async () => {
    if (pending) return;
    if (!value.trim()) {
      setError(t.missionRequired);
      textarea.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      openMission((await createRun(value)).id);
    } catch (e) {
      // Typed values stay in the form so the brief can be fixed and resubmitted.
      setError((e as Error).message);
      setPending(false);
    }
  };

  const pick = (prompt: string) => {
    onChange(prompt);
    setError(null);
    textarea.current?.focus();
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col rounded-2xl border bg-card transition-colors focus-within:border-foreground/25"
      >
        <label htmlFor="mission" className="sr-only">
          {t.missionLabel}
        </label>
        <textarea
          id="mission"
          ref={textarea}
          rows={2}
          className="max-h-60 min-h-14 w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
          placeholder={t.missionPlaceholder}
          value={value}
          aria-invalid={invalid}
          aria-describedby={error ? "compose-error" : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            if (invalid) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {error && (
          <p id="compose-error" role="alert" className="px-4 pt-1 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-1 px-2.5 pt-1 pb-2.5">
          <ComposerMenu onExample={pick} />
          <ModelPicker />
          <Button
            type="submit"
            size="icon"
            disabled={pending || !value.trim()}
            aria-label={pending ? t.launching : t.launch}
            title={t.launch}
            className="ms-auto size-8 rounded-full bg-signal text-signal-foreground hover:bg-signal/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            <ArrowUp />
          </Button>
        </div>
      </form>
    </div>
  );
}
