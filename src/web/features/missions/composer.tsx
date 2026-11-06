import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { openMission } from "@/lib/actions";
import { useDraft } from "@/lib/drafts";
import { cn } from "@/lib/utils";
import { createRun, uploadAttachment } from "@/stores/runs";
import { loadSettings, useSettings } from "@/stores/settings";
import { AttachmentTiles, attach, SightNote, useFileDrop, useSight } from "./attachments";
import { ComposerMenu } from "./composer-menu";
import { ModelPicker } from "./model-picker";
import { TokenField, useTokenCatalog } from "./token-field";

// The one way a board starts: a brief with any files it needs, plus quick switches for the agents and connectors.
// The unsent brief and its files survive a reload.
export function Composer({ className }: { className?: string }) {
  const draft = useDraft("home");
  const value = draft.text;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { over, handlers } = useFileDrop(draft);
  const sight = useSight(draft.files);
  const catalog = useTokenCatalog();

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
      const attachments = await Promise.all(draft.files.map(uploadAttachment));
      const run = await createRun(value, undefined, attachments);
      draft.clear();
      openMission(run.id);
    } catch (e) {
      // Typed values and files stay in the form so the brief can be fixed and resubmitted.
      setError((e as Error).message);
      setPending(false);
    }
  };

  // A picked skill leads the message as /name, the same token the / menu writes.
  const pick = (name: string) => {
    const token = `/${name}`;
    if (!draft.text.split(/\s+/).includes(token)) draft.setText(`${token} ${draft.text.trimStart()}`);
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
        {...handlers}
        className={cn(
          "relative flex flex-col rounded-2xl border bg-card transition-colors focus-within:border-foreground/25",
          over && "border-signal/60 focus-within:border-signal/60",
        )}
      >
        {over && <DropHint />}
        <AttachmentTiles files={draft.files} onRemove={draft.removeFile} />
        <SightNote sight={sight} />
        <label htmlFor="mission" className="sr-only">
          {t.missionLabel}
        </label>
        <TokenField
          id="mission"
          fieldRef={textarea}
          catalog={catalog}
          rows={2}
          className="max-h-60 min-h-14 w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
          placeholder={t.missionPlaceholder}
          value={value}
          aria-invalid={invalid}
          aria-describedby={error ? "compose-error" : undefined}
          onValueChange={(text) => {
            draft.setText(text);
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
            <RichText text={error} />
          </p>
        )}
        <div className="flex items-center gap-1 px-2.5 pt-1 pb-2.5">
          <ComposerMenu onSkill={pick} onAddFiles={() => picker.current?.click()} />
          <ModelPicker />
          <Button
            type="submit"
            size="icon"
            disabled={pending || !value.trim()}
            aria-label={pending ? (draft.files.length ? t.attach.uploading : t.launching) : t.launch}
            title={t.launch}
            className="ms-auto size-8 rounded-full bg-signal text-signal-foreground hover:bg-signal/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            <ArrowUp />
          </Button>
        </div>
        <FilePicker inputRef={picker} onFiles={(files) => void attach(draft, files)} />
      </form>
    </div>
  );
}

// Shown over a composer while files are dragged onto it.
export function DropHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-signal/60 bg-card/90 text-sm text-muted-foreground">
      {t.attach.drop}
    </div>
  );
}

export function FilePicker({
  inputRef,
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      onChange={(e) => {
        onFiles([...(e.target.files ?? [])]);
        e.target.value = "";
      }}
    />
  );
}
