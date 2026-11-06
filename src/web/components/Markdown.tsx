import { Check, Copy, Download } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OutboundLink } from "@/components/outbound-link";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { type Inline, parseBlocks, parseInline, tableText } from "@/markdown";

// Builds React elements only (never innerHTML), so agent output cannot inject markup.
// Muted by default, for activity and notes; what an agent says to the person passes text-foreground/80, so bold labels,
// headings and links (full foreground) stand out from the body instead of everything reading at one brightness.
export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div
      // Plain wrapping: text-wrap: pretty pulls a short reply's last lines in early, so its right edge reads ragged.
      className={cn("flex flex-col gap-3 text-sm leading-6 text-muted-foreground [overflow-wrap:break-word]", className)}
    >
      {blocks.map((b, i) => {
        const key = `${b.type}-${i}`;
        switch (b.type) {
          case "h":
            return (
              <h4 key={key} className="mt-2 font-semibold text-foreground first:mt-0">
                <InlineText text={b.text} />
              </h4>
            );
          case "table":
            return <MdTable key={key} rows={b.rows} />;
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
              <ul key={key} className="list-disc space-y-1.5 ps-5 marker:text-muted-foreground/60">
                {items}
              </ul>
            ) : (
              <ol key={key} className="list-decimal space-y-1.5 ps-5 marker:text-muted-foreground marker:tabular-nums">
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

const tool =
  "flex size-6 items-center justify-center rounded-md font-normal text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5";

// A table an agent wrote, with a copy and a download that show on hover, so its rows can leave the chat as data.
function MdTable({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = () =>
    navigator.clipboard.writeText(tableText(rows, "tsv")).then(
      () => setCopied(true),
      () => toast.error(t.mdTable.failed),
    );
  const download = () => {
    const url = URL.createObjectURL(new Blob([tableText(rows, "csv")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "table.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Shown when the table is pointed at or tabbed into, and always where nothing hovers.
  const actions = (
    <span className="-my-1 -me-1.5 flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/table:opacity-100 group-hover/table:opacity-100 [@media(hover:none)]:opacity-100">
      <button type="button" onClick={copy} aria-label={copied ? t.mdTable.copied : t.mdTable.copy} title={t.mdTable.copy} className={tool}>
        {copied ? <Check /> : <Copy />}
      </button>
      <button type="button" onClick={download} aria-label={t.mdTable.download} title={t.mdTable.download} className={tool}>
        <Download />
      </button>
    </span>
  );
  return (
    <div className="group/table">
      {/* break-word, unlike the wrapper's anywhere, keeps a column at least one word wide instead of one letter. */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs [overflow-wrap:break-word]">
          {head && (
            <thead className="bg-muted text-foreground">
              <tr>
                {head.map((cell, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity beyond their position.
                  <th key={j} className="border-b px-2.5 py-1.5 text-start font-medium whitespace-nowrap">
                    {j === head.length - 1 ? (
                      // The last header cell carries the table's own actions, so they never cover a row.
                      <div className="flex items-center gap-2">
                        <span className="flex-1">
                          <InlineText text={cell} />
                        </span>
                        {actions}
                      </div>
                    ) : (
                      <InlineText text={cell} />
                    )}
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
    </div>
  );
}

// Bold, italic, inline code and links inside one line, e.g. a table cell.
export function InlineText({ text }: { text: string }) {
  return <InlineParts parts={parseInline(text)} />;
}

function InlineParts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) => {
        const key = `${part.type}-${i}`;
        if (part.type === "strong")
          return (
            <strong key={key} className="font-medium text-foreground">
              <InlineParts parts={part.children} />
            </strong>
          );
        if (part.type === "link")
          return part.external ? (
            <OutboundLink
              key={key}
              href={part.href}
              className="text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            >
              {part.text}
            </OutboundLink>
          ) : (
            <span key={key} title={part.href} className="font-mono text-xs text-foreground">
              {part.text}
            </span>
          );
        if (part.type === "code")
          return (
            // The mono face alone marks code, so prose stays one calm texture instead of a row of boxes. A name or path
            // stays on one line (no break at its - or /); only a long one may wrap, anywhere.
            <code
              key={key}
              className={cn(
                "font-mono text-[0.9em] text-foreground",
                part.text.length <= 32 ? "whitespace-nowrap" : "[overflow-wrap:anywhere]",
              )}
            >
              {part.text}
            </code>
          );
        return part.text;
      })}
    </>
  );
}
