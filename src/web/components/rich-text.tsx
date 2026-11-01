// For title attributes and other plain-text spots: the same copy without its code marks.
export const plain = (text: string) => text.replaceAll("`", "");

// Backticks in copy mark commands, flags, paths, env vars and model ids; they render as inline code so they read like a terminal.
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed split of one string never reorders
          <code key={i} className="rounded-md border bg-muted px-1 py-px font-mono text-[0.85em] whitespace-nowrap text-foreground">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
