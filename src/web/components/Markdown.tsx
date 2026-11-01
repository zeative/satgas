import { memo, useMemo } from "react";
import { type Inline, parseBlocks, parseInline } from "@/markdown";

// Builds React elements only (never innerHTML), so agent output cannot inject markup.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
      {blocks.map((b, i) => {
        const key = `${b.type}-${i}`;
        switch (b.type) {
          case "h":
            return (
              <h4 key={key} className="mt-2 font-semibold text-foreground">
                <InlineText text={b.text} />
              </h4>
            );
          case "table": {
            const [head, ...body] = b.rows;
            return (
              <div key={key} className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-xs">
                  {head && (
                    <thead className="bg-muted/60 text-foreground">
                      <tr>
                        {head.map((cell, j) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity beyond their position.
                          <th key={j} className="border-b px-2.5 py-1.5 text-start font-medium">
                            <InlineText text={cell} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {body.map((row, r) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: rows are parsed from immutable text, so positions never shift.
                      <tr key={r} className="border-b last:border-0">
                        {row.map((cell, j) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: cells have no identity beyond their position.
                          <td key={j} className="px-2.5 py-1.5 align-top">
                            <InlineText text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case "code":
            return (
              <pre key={key} className="overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs leading-5">
                <code>{b.text}</code>
              </pre>
            );
          case "ul":
          case "ol": {
            const items = b.items.map((it, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items are parsed from immutable text, so positions never shift.
              <li key={`${key}-${j}`}>
                <InlineText text={it} />
              </li>
            ));
            return b.type === "ul" ? (
              <ul key={key} className="list-disc space-y-1 ps-5 marker:text-muted-foreground/60">
                {items}
              </ul>
            ) : (
              <ol key={key} className="list-decimal space-y-1 ps-5 marker:text-muted-foreground/60">
                {items}
              </ol>
            );
          }
          default:
            return (
              <p key={key}>
                <InlineText text={b.text} />
              </p>
            );
        }
      })}
    </div>
  );
});

function InlineText({ text }: { text: string }) {
  return <InlineParts parts={parseInline(text)} />;
}

function InlineParts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) => {
        const key = `${part.type}-${i}`;
        if (part.type === "strong")
          return (
            <strong key={key} className="font-semibold text-foreground">
              <InlineParts parts={part.children} />
            </strong>
          );
        if (part.type === "link")
          return part.external ? (
            <a
              key={key}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              {part.text}
            </a>
          ) : (
            <span key={key} title={part.href} className="font-mono text-xs text-foreground">
              {part.text}
            </span>
          );
        if (part.type === "code")
          return (
            <code key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {part.text}
            </code>
          );
        return part.text;
      })}
    </>
  );
}
