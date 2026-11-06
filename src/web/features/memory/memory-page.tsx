import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Folder, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow } from "@/hooks/use-now";
import { fmtAgo, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { deleteEntry, loadMemory, saveEntry, setAutoMemory, useMemory } from "@/stores/memory";
import { useRuns } from "@/stores/runs";
import { MEMORY_TYPES, type MemoryEntry, type MemoryType } from "../../../shared/memory";

const tm = t.memory;
// Entries read as labels, so a sentence's closing period goes; an ellipsis or a question stays.
const plain = (text: string) => text.replace(/(?<!\.)\.$/, "");
type Tab = "memory" | "rules";

// One page for what Satgas keeps across boards: memory (who the person is) and rules (do and don't), both learned by the
// lead as it works and both the person's to correct.
export function MemoryPage() {
  const { store, error } = useMemory();
  const search = useSearch({ from: "/_app/memory" });
  const navigate = useNavigate({ from: "/memory" });
  // The tab lives in the URL, so a link can open Rules and Back returns to the tab the person was on.
  const tab: Tab = search.tab === "rules" ? "rules" : "memory";
  const setTab = (next: Tab) => void navigate({ search: next === "rules" ? { tab: "rules" } : {}, replace: true });
  const [editing, setEditing] = useState<MemoryEntry | "new" | null>(null);
  const now = useNow(true, 60_000);
  // The lead may have saved something on another board meanwhile; coming back to the page shows it.
  useEffect(() => {
    void loadMemory();
    const again = () => document.visibilityState === "visible" && void loadMemory();
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);

  const entries = store?.entries ?? [];
  const memories = entries.filter((e) => e.kind === "memory");
  const rules = entries.filter((e) => e.kind === "rule");

  return (
    <main id="content" className="relative flex-1">
      <PageHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-12 pb-16">
        <header className="flex flex-col gap-6">
          <h1 className="brand-title text-[1.75rem] leading-tight">{tm.title}</h1>
          <div className="flex items-center gap-4 rounded-xl bg-muted/50 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <label htmlFor="auto-memory" className="text-sm font-medium">
                {tm.auto}
              </label>
              <p className="text-xs text-muted-foreground">{tm.autoHint}</p>
            </div>
            <Switch
              id="auto-memory"
              disabled={!store}
              checked={store?.auto ?? true}
              onCheckedChange={(auto) => void setAutoMemory(auto).catch((e: Error) => toast.error(e.message))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList>
                <TabsTrigger value="memory">
                  {tm.tabs.memory}
                  <span className="text-xs text-muted-foreground tabular-nums">{memories.length}</span>
                </TabsTrigger>
                <TabsTrigger value="rules">
                  {tm.tabs.rules}
                  <span className="text-xs text-muted-foreground tabular-nums">{rules.length}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" className="ms-auto" onClick={() => setEditing("new")}>
              <Plus />
              {tab === "memory" ? tm.addMemory : tm.addRule}
            </Button>
          </div>
        </header>

        {error && !store ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <p>{tm.loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadMemory()}>
              {t.retry}
            </Button>
          </div>
        ) : !store ? (
          <div className="flex flex-col gap-2">
            {["a", "b", "c"].map((k) => (
              <Skeleton key={k} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : tab === "memory" ? (
          memories.length ? (
            <div className="flex flex-col gap-6">
              {MEMORY_TYPES.map((type) => {
                const list = memories.filter((e) => (e.type ?? "about") === type);
                if (!list.length) return null;
                return (
                  <section key={type} className="flex flex-col gap-2">
                    <h2 className="text-xs font-medium text-muted-foreground">{tm.types[type]}</h2>
                    <ul className="flex flex-col gap-2">
                      {list.map((e) => (
                        <EntryRow key={e.id} entry={e} now={now} onEdit={() => setEditing(e)} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <Empty title={tm.emptyMemory} hint={tm.emptyMemoryHint} />
          )
        ) : rules.length ? (
          <ul className="flex flex-col gap-2">
            {rules.map((e) => (
              <EntryRow key={e.id} entry={e} now={now} onEdit={() => setEditing(e)} />
            ))}
          </ul>
        ) : (
          <Empty title={tm.emptyRules} hint={tm.emptyRulesHint} />
        )}
      </div>
      {editing && (
        <EntryDialog
          entry={editing === "new" ? undefined : editing}
          kind={tab === "rules" ? "rule" : "memory"}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

const Empty = ({ title, hint }: { title: string; hint: string }) => (
  <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center">
    <p className="text-sm font-medium">{title}</p>
    <p className="text-sm text-muted-foreground">{hint}</p>
  </div>
);

function EntryRow({ entry, now, onEdit }: { entry: MemoryEntry; now: number; onEdit: () => void }) {
  const board = useRuns((s) => (entry.source.boardId ? s.runs?.find((r) => r.id === entry.source.boardId) : undefined));
  const fail = (e: Error) => toast.error(e.message);
  return (
    <li className="relative flex gap-4 rounded-xl bg-muted/50 px-4 py-3 transition-colors hover:bg-muted/80">
      <div className={cn("flex min-w-0 flex-1 flex-col", !entry.enabled && "opacity-60")}>
        <p className="text-sm leading-5 font-medium">
          <button
            type="button"
            onClick={onEdit}
            className="text-start [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {plain(entry.text)}
          </button>
        </p>
        {entry.why && <p className="mt-0.5 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{plain(entry.why)}</p>}
        <p className="relative z-10 mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
          {entry.scope && (
            <>
              <span className="flex min-w-0 items-center gap-1" title={entry.scope}>
                <Folder className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate font-mono">{entry.scope}</span>
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          {entry.source.by === "lead" ? (
            board ? (
              <span className="flex min-w-0 items-center gap-1">
                {tm.from}
                <Link
                  to="/boards/$boardId"
                  params={{ boardId: board.id }}
                  className="truncate rounded text-foreground/80 underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {board.title ?? board.prompt.slice(0, 40)}
                </Link>
              </span>
            ) : (
              <span>{tm.learnedFrom}</span>
            )
          ) : (
            <span>{tm.addedByYou}</span>
          )}
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{fmtAgo(entry.updatedAt, now)}</span>
        </p>
      </div>
      {/* Centred on the first line of text, so the switch and the menu sit level with what they act on. */}
      <div className="relative z-10 -my-1 flex h-7 shrink-0 items-center gap-2">
        <Switch
          checked={entry.enabled}
          onCheckedChange={(enabled) => void saveEntry({ ...entry, enabled }, entry.id).catch(fail)}
          aria-label={`${tm.on}: ${entry.text}`}
          title={tm.on}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={t.moreActions}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil />
              {tm.edit}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void deleteEntry(entry.id).catch(fail)}>
              <Trash2 />
              {tm.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function EntryDialog({ entry, kind, onClose }: { entry?: MemoryEntry; kind: MemoryEntry["kind"]; onClose: () => void }) {
  const k = entry?.kind ?? kind;
  const [text, setText] = useState(entry?.text ?? "");
  const [why, setWhy] = useState(entry?.why ?? "");
  const [type, setType] = useState<MemoryType>(entry?.type ?? "about");
  const [scope, setScope] = useState(entry?.scope ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await saveEntry({ kind: k, text, why, enabled: entry?.enabled ?? true, ...(k === "rule" ? { scope } : { type }) }, entry?.id);
      onClose();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const field = "flex flex-col gap-1.5";
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? (k === "rule" ? tm.editRule : tm.editMemory) : k === "rule" ? tm.addRule : tm.addMemory}</DialogTitle>
          <DialogDescription>{k === "rule" ? tm.emptyRulesHint : tm.autoHint}</DialogDescription>
        </DialogHeader>
        <form
          id="memory-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={field}>
            <label htmlFor="memory-text" className="text-sm font-medium">
              {k === "rule" ? tm.ruleText : tm.text}
            </label>
            <Input
              id="memory-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={k === "rule" ? tm.rulePlaceholder : tm.memoryPlaceholder}
              maxLength={300}
            />
          </div>
          {k === "memory" ? (
            <div className={field}>
              <label htmlFor="memory-type" className="text-sm font-medium">
                {tm.type}
              </label>
              <Select value={type} onValueChange={(v) => setType(v as MemoryType)}>
                <SelectTrigger id="memory-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tm.types[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className={field}>
              <label htmlFor="memory-scope" className="text-sm font-medium">
                {tm.scope}
              </label>
              <Input
                id="memory-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder={tm.scopePlaceholder}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>
          )}
          <div className={field}>
            <label htmlFor="memory-why" className="text-sm font-medium">
              {tm.why}
            </label>
            <Input id="memory-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder={tm.whyPlaceholder} maxLength={300} />
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              <RichText text={problem} />
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {tm.cancel}
          </Button>
          <Button type="submit" form="memory-form" disabled={saving || !text.trim()}>
            {saving ? tm.saving : tm.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
