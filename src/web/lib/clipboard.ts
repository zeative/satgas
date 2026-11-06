// navigator.clipboard only exists on https and localhost, and Satgas also runs on plain http. The old command still
// works there, as long as it runs inside the click, so nothing may be awaited before it.
function legacyCopy(text: string) {
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.setAttribute("aria-hidden", "true");
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  // An open dialog traps focus, so the field has to sit inside it to be selected.
  (previous?.closest("[role='dialog']") ?? document.body).appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  previous?.focus?.();
  if (!copied) throw new Error("Copy was refused.");
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return legacyCopy(text);
  await navigator.clipboard.writeText(text);
}
