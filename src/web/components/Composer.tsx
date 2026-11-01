import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { modKey, t } from "../i18n";
import { createRun, defaultCwd, openRun, runs } from "../state";
import { Icon } from "./Icon";

export function Composer() {
  const mission = useSignal("");
  // Until the user edits it, the folder follows the latest mission's folder (or the server default).
  const folderOverride = useSignal<string | null>(null);
  const editingFolder = useSignal(false);
  const pending = useSignal(false);
  const error = useSignal<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  // Folders the user already launched missions in, most recent first.
  const recentFolders = useComputed(() => [...new Set((runs.value ?? []).map((r) => r.cwd))].slice(0, 8));

  const cwd = useComputed(() => folderOverride.value ?? recentFolders.value[0] ?? defaultCwd.value);

  useEffect(() => textarea.current?.focus(), []);
  useEffect(() => {
    if (editingFolder.value) folderInput.current?.select();
  }, [editingFolder.value]);

  const invalid = error.value === t.missionRequired;

  const submit = async (e?: Event) => {
    e?.preventDefault();
    if (pending.peek()) return;
    if (!mission.peek().trim()) {
      error.value = t.missionRequired;
      textarea.current?.focus();
      return;
    }
    pending.value = true;
    error.value = null;
    try {
      const r = await createRun(mission.peek(), cwd.peek());
      openRun(r.id);
    } catch (err) {
      // Typed values stay in the form so the brief can be fixed and resubmitted.
      error.value = (err as Error).message;
      pending.value = false;
    }
  };

  return (
    <div class="composer-wrap">
      <form class="composer" onSubmit={submit} noValidate>
        <span class="overline">{t.composeOverline}</span>
        <h1 class="composer-title">{t.composeTitle}</h1>
        <p class="composer-lead">{t.composeLead}</p>

        <div class={`brief${invalid ? " is-invalid" : ""}`}>
          <label class="sr-only" for="mission">
            {t.missionLabel}
          </label>
          <textarea
            id="mission"
            ref={textarea}
            class="brief-input"
            rows={4}
            placeholder={t.missionPlaceholder}
            value={mission.value}
            aria-invalid={invalid}
            aria-describedby={error.value ? "compose-error" : undefined}
            onInput={(e) => {
              mission.value = e.currentTarget.value;
              if (invalid) error.value = null;
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
          />
          <div class="brief-bar">
            {editingFolder.value ? (
              <>
                <label class="sr-only" for="cwd">
                  {t.folderLabel}
                </label>
                <input
                  id="cwd"
                  ref={folderInput}
                  class="field folder-edit"
                  value={cwd.value}
                  list="recent-folders"
                  spellcheck={false}
                  onInput={(e) => {
                    folderOverride.value = e.currentTarget.value;
                  }}
                  onBlur={() => {
                    editingFolder.value = false;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      e.preventDefault();
                      editingFolder.value = false;
                      textarea.current?.focus();
                    }
                  }}
                />
                <datalist id="recent-folders">
                  {recentFolders.value.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </>
            ) : (
              <button
                type="button"
                class="folder-chip"
                title={`${t.folderLabel}: ${cwd.value}\n${t.folderHint}`}
                aria-label={`${t.changeFolder}: ${cwd.value}`}
                onClick={() => {
                  editingFolder.value = true;
                }}
              >
                <Icon name="folder" size={14} />
                <span>
                  <bdi>{cwd.value || "…"}</bdi>
                </span>
              </button>
            )}
            <span class="brief-hint" aria-hidden="true">
              <kbd>{modKey}</kbd>
              <kbd>↵</kbd>
            </span>
            <button type="submit" class="btn btn-primary" disabled={pending.value}>
              {pending.value ? t.launching : t.launch}
            </button>
          </div>
        </div>
        {error.value && (
          <p id="compose-error" class="compose-error" role="alert">
            {error.value}
          </p>
        )}

        <section class="examples" aria-label={t.examplesLabel}>
          <span class="overline">{t.examplesLabel}</span>
          <ul class="example-list">
            {t.examples.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  class="example"
                  onClick={() => {
                    mission.value = ex;
                    error.value = null;
                    textarea.current?.focus();
                  }}
                >
                  {ex}
                  <Icon name="arrow" size={14} class="example-arrow" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </form>
    </div>
  );
}
