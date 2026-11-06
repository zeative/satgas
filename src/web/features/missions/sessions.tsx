import { Archive, ArchiveRestore, Check, ChevronDown, MessagesSquare, PenLine, Plus, SquarePen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { newSession, pickSession, updateSession, useActiveSession } from "@/stores/chat-session";
import { type ChatSession, MAIN_SESSION, sessionOf, sessionsOf } from "../../../shared/sessions";
import type { Run } from "../../../shared/types";

const fail = (e: Error) => toast.error(e.message);

export const sessionTitle = (s: ChatSession) => (s.id === MAIN_SESSION ? t.session.main : s.title || t.session.untitled);

// Busy: the round running now belongs to this session.
const busyIn = (run: Run, id: string) =>
  (run.status === "planning" || run.status === "running" || run.status === "asking") && sessionOf(run, run.rounds?.length ?? 0) === id;

function start(runId: string) {
  void newSession(runId).catch(fail);
}

// One rename dialog for the board's sessions, opened from the sidebar or the switcher.
const useRenaming = create<{ runId: string; session: ChatSession } | { runId: null; session: null }>(() => ({
  runId: null,
  session: null,
}));
const rename = (runId: string, session: ChatSession) => useRenaming.setState({ runId, session });

export function RenameSessionDialog() {
  const { runId, session } = useRenaming();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  if (session && seen !== session.id) {
    setSeen(session.id);
    setTitle(session.title ?? "");
  }
  const close = () => {
    useRenaming.setState({ runId: null, session: null });
    setSeen(null);
  };
  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.session.rename}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!runId || !session) return;
            setBusy(true);
            void updateSession(runId, session.id, { title })
              .then(close, fail)
              .finally(() => setBusy(false));
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} aria-label={t.session.rename} autoFocus />
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {t.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The board's chat sessions down the side of the full-width chat, like a chat app's history.
export function SessionSidebar({ run }: { run: Run }) {
  const active = useActiveSession(run);
  const all = sessionsOf(run);
  const open = all.filter((s) => !s.archived);
  const archived = all.filter((s) => s.archived);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <nav aria-label={t.session.menu} className="flex w-64 shrink-0 flex-col border-e max-md:hidden">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b ps-3 pe-1.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{t.session.menu}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 rounded text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          aria-label={t.session.new}
          title={t.session.new}
          onClick={() => start(run.id)}
        >
          <SquarePen className="size-4" />
        </Button>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
        {[...open].reverse().map((s) => (
          <SessionRow key={s.id} run={run} s={s} active={s.id === active} />
        ))}
      </ul>
      {archived.length > 0 && (
        <div className="flex max-h-[40%] shrink-0 flex-col gap-0.5 overflow-y-auto border-t p-2">
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className="flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Archive className="size-3.5" aria-hidden="true" />
            <span className="flex-1 text-start">{t.session.archived(archived.length)}</span>
            <ChevronDown className={cn("size-3.5 transition-transform", showArchived && "rotate-180")} aria-hidden="true" />
          </button>
          {showArchived &&
            archived.map((s) => (
              <div key={s.id} className="flex h-9 shrink-0 items-center gap-2 rounded-lg ps-2.5 pe-1 text-sm text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">{sessionTitle(s)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={t.session.restore}
                  title={t.session.restore}
                  onClick={() => void updateSession(run.id, s.id, { archived: false }).catch(fail)}
                >
                  <ArchiveRestore className="size-3.5" />
                </Button>
              </div>
            ))}
        </div>
      )}
    </nav>
  );
}

function SessionRow({ run, s, active }: { run: Run; s: ChatSession; active: boolean }) {
  const busy = busyIn(run, s.id);
  return (
    <li className="group/s relative">
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={() => pickSession(run.id, s.id)}
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          s.id !== MAIN_SESSION && "group-hover/s:pe-13 group-focus-within/s:pe-13",
          active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{sessionTitle(s)}</span>
        {busy && (
          <>
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-signal" />
            <span className="sr-only">{t.run.running}</span>
          </>
        )}
      </button>
      {s.id !== MAIN_SESSION && (
        <span className="absolute inset-y-0 right-0.5 flex items-center opacity-0 group-focus-within/s:opacity-100 group-hover/s:opacity-100 [@media(hover:none)]:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded text-muted-foreground hover:text-foreground"
            aria-label={t.session.rename}
            title={t.session.rename}
            onClick={() => rename(run.id, s)}
          >
            <PenLine className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded text-muted-foreground hover:text-foreground"
            aria-label={t.session.archive}
            title={t.session.archive}
            onClick={() => void updateSession(run.id, s.id, { archived: true }).catch(fail)}
          >
            <Archive className="size-3.5" />
          </Button>
        </span>
      )}
    </li>
  );
}

// Switching sessions from a menu: the chat beside the canvas, and Chat Only on a screen too narrow for the sidebar.
function SessionMenu({ run, trigger }: { run: Run; trigger: React.ReactNode }) {
  const active = useActiveSession(run);
  const all = sessionsOf(run);
  const current = all.find((s) => s.id === active) ?? all[0];
  const open = all.filter((s) => !s.archived);
  if (!current) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t.session.menu}</DropdownMenuLabel>
        {[...open].reverse().map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => pickSession(run.id, s.id)}>
            <Check className={cn(s.id !== active && "invisible")} />
            <span className="truncate">{sessionTitle(s)}</span>
            {busyIn(run, s.id) && <span aria-hidden="true" className="ms-auto size-1.5 shrink-0 rounded-full bg-signal" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => start(run.id)}>
          <SquarePen />
          {t.session.new}
        </DropdownMenuItem>
        {current.id !== MAIN_SESSION && (
          <>
            <DropdownMenuItem onSelect={() => setTimeout(() => rename(run.id, current))}>
              <PenLine />
              {t.session.rename}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void updateSession(run.id, current.id, { archived: true }).catch(fail)}>
              <Archive />
              {t.session.archive}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const useCurrent = (run: Run) => {
  const active = useActiveSession(run);
  const all = sessionsOf(run);
  return all.find((s) => s.id === active) ?? all[0];
};

// The session switcher in the chat beside the canvas: the current one's name, the others a click away.
export function SessionBar({ run }: { run: Run }) {
  const current = useCurrent(run);
  if (!current) return null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b ps-2 pe-1.5">
      <SessionMenu
        run={run}
        trigger={
          <button
            type="button"
            aria-label={t.session.menu}
            className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <MessagesSquare className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{sessionTitle(current)}</span>
            <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
          </button>
        }
      />
      <Button
        variant="ghost"
        size="icon"
        className="ms-auto size-7 text-muted-foreground hover:text-foreground"
        aria-label={t.session.new}
        title={t.session.new}
        onClick={() => start(run.id)}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

// Chat Only's title bar names the open session after the board; on a narrow screen it is the switcher too.
export function SessionCrumb({ run }: { run: Run }) {
  const current = useCurrent(run);
  if (!current) return null;
  return (
    <>
      <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground/50">
        /
      </span>
      <span className="min-w-0 truncate px-1.5 text-sm text-muted-foreground max-md:hidden">{sessionTitle(current)}</span>
      <SessionMenu
        run={run}
        trigger={
          <button
            type="button"
            aria-label={t.session.menu}
            className="flex h-7 min-w-0 items-center gap-1 rounded-lg px-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
          >
            <span className="truncate">{sessionTitle(current)}</span>
            <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        }
      />
    </>
  );
}

// A session with nothing in it yet says what it starts from.
export function SessionEmpty() {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium">{t.session.emptyTitle}</p>
      <p className="max-w-80 text-xs text-muted-foreground">{t.session.emptyLead}</p>
    </div>
  );
}
