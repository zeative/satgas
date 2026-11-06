import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { renameBoard } from "@/stores/runs";
import type { Run } from "../../../shared/types";

const MAX = 80;

// The board's name, renamed in place by a double-click (or from a menu through `editing`): Enter or leaving the
// field keeps the new name, Escape keeps the old one.
export function BoardName({
  run,
  as: Tag = "h1",
  className,
  editing: asked = false,
  onEditingChange,
}: {
  run: Run;
  as?: "h1" | "h2";
  className?: string;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const shown = run.title ?? run.prompt;
  const [own, setOwn] = useState(false);
  const editing = asked || own;
  const [value, setValue] = useState(shown);
  const field = useRef<HTMLInputElement>(null);
  // Enter and blur both finish; the second one must not save again.
  const done = useRef(false);
  // The double-click's last mouseup can land on the new field and collapse the selection, so the first one is ignored.
  const fresh = useRef(false);

  // Starts from the name as it is when editing begins; a name arriving mid-edit must not wipe what is being typed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only entering edit mode resets the field.
  useEffect(() => {
    if (!editing) return;
    done.current = false;
    fresh.current = true;
    setValue(shown);
    requestAnimationFrame(() => field.current?.select());
  }, [editing]);

  const stop = () => {
    setOwn(false);
    onEditingChange?.(false);
  };
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    stop();
    const next = value.replace(/\s+/g, " ").trim().slice(0, MAX);
    if (!keep || !next || next === shown) return;
    renameBoard(run.id, next).catch((e: Error) => toast.error(e.message));
  };

  if (editing)
    return (
      <input
        ref={field}
        value={value}
        maxLength={MAX}
        aria-label={t.boardName}
        onChange={(e) => setValue(e.target.value)}
        onMouseUp={(e) => {
          if (!fresh.current) return;
          fresh.current = false;
          e.preventDefault();
        }}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            // The page's own Escape (closing a panel) waits for the field.
            e.preventDefault();
            e.stopPropagation();
            finish(false);
          }
        }}
        style={{ width: `${Math.min(Math.max(value.length, 8) + 2, MAX)}ch` }}
        className={cn(
          className,
          "h-7 max-w-full min-w-0 rounded-md bg-background px-1.5 outline-none ring-2 ring-ring/60 [text-overflow:clip]",
        )}
      />
    );

  return (
    <Tag
      title={`${shown}\n${t.renameHint}`}
      onDoubleClick={() => {
        setOwn(true);
        onEditingChange?.(true);
      }}
      className={cn("cursor-text truncate select-none", className)}
    >
      {shown}
    </Tag>
  );
}
