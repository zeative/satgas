import { useState } from "react";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { newId } from "@/features/board/context";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { MCP_NAME, type McpServer, SECRET_MASK, splitArgs } from "../../../shared/settings";

const ti = t.integrations;

export const describe = (s: McpServer) => (s.transport === "http" ? (s.url ?? "") : [s.command, ...(s.args ?? [])].join(" "));
const quote = (a: string) => (/[\s"']/.test(a) || !a ? JSON.stringify(a) : a);
const lines = (rec: Record<string, string> | undefined, sep: string) =>
  Object.entries(rec ?? {})
    .map(([k, v]) => `${k}${sep}${v}`)
    .join("\n");
const parseLines = (text: string, sep: string) =>
  Object.fromEntries(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const i = l.indexOf(sep);
        return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + sep.length).trim()];
      }),
  );

interface DialogProps {
  server: McpServer | null;
  onClose: () => void;
  onSave: (server: McpServer) => Promise<string | null>;
}

export function ServerDialog({ server, onClose, onSave }: DialogProps) {
  const [name, setName] = useState(server?.name ?? "");
  const [transport, setTransport] = useState<McpServer["transport"]>(server?.transport ?? "stdio");
  const [command, setCommand] = useState(
    server?.transport === "stdio" ? [server.command ?? "", ...(server.args ?? [])].map(quote).join(" ") : "",
  );
  const [env, setEnv] = useState(lines(server?.env, "="));
  const [url, setUrl] = useState(server?.url ?? "");
  const [headers, setHeaders] = useState(lines(server?.headers, ": "));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Saved secrets arrive masked; an untouched mask tells the server to keep the stored value.
  const masked = (rec: Record<string, string> | undefined) => Object.values(rec ?? {}).includes(SECRET_MASK);

  const submit = async () => {
    if (!MCP_NAME.test(name)) return setProblem(ti.nameHint);
    const [cmd = "", ...args] = splitArgs(command);
    const base = {
      id: server?.id ?? newId(),
      name,
      ...(server?.catalogId ? { catalogId: server.catalogId } : {}),
      enabled: server?.enabled ?? true,
    };
    const next: McpServer =
      transport === "http"
        ? { ...base, transport, url: url.trim(), headers: parseLines(headers, ":") }
        : { ...base, transport, command: cmd, args, env: parseLines(env, "=") };
    setSaving(true);
    const result = await onSave(next);
    setSaving(false);
    if (result) setProblem(result);
    else onClose();
  };

  const field = "flex flex-col gap-1.5";
  const area =
    "min-h-20 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{server ? ti.editServer : ti.addServer}</DialogTitle>
          <DialogDescription>{ti.serversLead}</DialogDescription>
        </DialogHeader>
        <form
          id="server-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={field}>
            <label htmlFor="mcp-name" className="text-sm font-medium">
              {ti.name}
            </label>
            <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-server" spellCheck={false} />
            <p className="text-xs text-muted-foreground">{ti.nameHint}</p>
          </div>
          <fieldset className={field}>
            <legend className="mb-1.5 text-sm font-medium">{ti.transport}</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["stdio", "http"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={transport === v}
                  onClick={() => setTransport(v)}
                  className={cn(
                    "h-8 rounded-md text-sm text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    transport === v && "bg-background text-foreground shadow-xs",
                  )}
                >
                  {v === "stdio" ? ti.local : ti.remote}
                </button>
              ))}
            </div>
          </fieldset>
          {transport === "stdio" ? (
            <>
              <div className={field}>
                <label htmlFor="mcp-command" className="text-sm font-medium">
                  {ti.command}
                </label>
                <Input
                  id="mcp-command"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx -y @playwright/mcp"
                  className="font-mono text-xs"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">{ti.commandHint}</p>
              </div>
              <div className={field}>
                <label htmlFor="mcp-env" className="text-sm font-medium">
                  {ti.env}
                </label>
                <textarea
                  id="mcp-env"
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                  placeholder="API_KEY=…"
                  className={area}
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  <RichText text={ti.envHint} />
                </p>
                {masked(server?.env) && <p className="text-xs text-muted-foreground">{ti.secretKept}</p>}
              </div>
            </>
          ) : (
            <>
              <div className={field}>
                <label htmlFor="mcp-url" className="text-sm font-medium">
                  {ti.url}
                </label>
                <Input
                  id="mcp-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/mcp"
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </div>
              <div className={field}>
                <label htmlFor="mcp-headers" className="text-sm font-medium">
                  {ti.headers}
                </label>
                <textarea
                  id="mcp-headers"
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder="Authorization: Bearer …"
                  className={area}
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  <RichText text={ti.headersHint} />
                </p>
                {masked(server?.headers) && <p className="text-xs text-muted-foreground">{ti.secretKept}</p>}
              </div>
            </>
          )}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              <RichText text={problem} />
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {ti.cancel}
          </Button>
          <Button type="submit" form="server-form" disabled={saving}>
            {saving ? ti.saving : ti.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
