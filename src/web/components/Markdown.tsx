import { type Inline, parseBlocks, parseInline } from "../markdown";

// Renders VNodes only (never innerHTML), so agent output cannot inject markup.
export function Markdown({ text }: { text: string }) {
  return (
    <div class="md">
      {parseBlocks(text).map((b, i) => {
        const key = `${b.type}-${i}`;
        switch (b.type) {
          case "h":
            return (
              <h4 key={key}>
                <InlineText text={b.text} />
              </h4>
            );
          case "code":
            return (
              <pre key={key}>
                <code>{b.text}</code>
              </pre>
            );
          case "ul":
          case "ol": {
            const items = b.items.map((it, j) => (
              <li key={`${key}-${j}`}>
                <InlineText text={it} />
              </li>
            ));
            return b.type === "ul" ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>;
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
}

function InlineText({ text }: { text: string }) {
  return <InlineParts parts={parseInline(text)} />;
}

function InlineParts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "strong")
          return (
            <strong key={`s${i}`}>
              <InlineParts parts={part.children} />
            </strong>
          );
        if (part.type === "link")
          return part.external ? (
            <a key={`l${i}`} href={part.href} target="_blank" rel="noopener noreferrer">
              {part.text}
            </a>
          ) : (
            <span key={`l${i}`} class="md-path" title={part.href}>
              {part.text}
            </span>
          );
        return part.type === "code" ? <code key={`c${i}`}>{part.text}</code> : part.text;
      })}
    </>
  );
}
