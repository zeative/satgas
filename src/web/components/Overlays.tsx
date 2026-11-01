import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { confirmRequest, toasts } from "../ui";

// Native <dialog> gives a real focus trap, Escape handling, an inert background and focus return.
export function ConfirmDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useSignal(false);
  const error = useSignal<string | null>(null);
  const req = confirmRequest.value;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (req && !dialog.open) {
      pending.value = false;
      error.value = null;
      dialog.showModal();
    } else if (!req && dialog.open) dialog.close();
  }, [req]);

  const confirm = async () => {
    if (!req || pending.peek()) return;
    pending.value = true;
    error.value = null;
    try {
      await req.onConfirm();
      confirmRequest.value = null;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      pending.value = false;
    }
  };

  return (
    <dialog
      ref={ref}
      class="confirm"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-text"
      onCancel={(e) => {
        // A request in flight cannot be abandoned halfway.
        if (pending.peek()) e.preventDefault();
      }}
      onClose={() => {
        confirmRequest.value = null;
      }}
    >
      {req && (
        <>
          <div class="confirm-body">
            <h2 id="confirm-title" class="confirm-title">
              {req.title}
            </h2>
            <p id="confirm-text" class="confirm-text">
              {req.text}
            </p>
            {error.value && (
              <p class="confirm-error" role="alert">
                {error.value}
              </p>
            )}
          </div>
          <div class="confirm-actions">
            <button type="button" class="btn btn-ghost" disabled={pending.value} onClick={() => (confirmRequest.value = null)}>
              {req.cancelLabel}
            </button>
            <button type="button" class={`btn ${req.danger ? "btn-danger" : "btn-primary"}`} disabled={pending.value} onClick={confirm}>
              {pending.value ? req.pendingLabel : req.confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((toast) => (
        <div key={toast.id} class={`toast${toast.tone === "hazard" ? " is-hazard" : ""}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
