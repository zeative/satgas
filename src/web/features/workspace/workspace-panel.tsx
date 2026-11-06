import { PanelLeftClose } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isMac, t } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  clampWorkspace,
  setWorkspaceWidth,
  toggleWorkspace,
  useWorkspace,
  WORKSPACE_DEFAULT,
  WORKSPACE_MIN,
  type WorkspaceTab,
} from "@/stores/workspace";
import type { Run } from "../../../shared/types";
import { ChangesTab } from "./changes-tab";
import { FilesTab } from "./files-tab";
import { GitTab } from "./git-tab";
import { OutlineTab } from "./outline-tab";

const tw = t.workspace;
const TABS: WorkspaceTab[] = ["changes", "files", "git", "outline"];

// Where a board opens: its changes when the team wrote files, its canvas outline when it only holds cards, else its files.
function firstTab(run: Run): WorkspaceTab {
  if (run.nodes.some((n) => n.changes?.files.length)) return "changes";
  if (run.board?.cards.length) return "outline";
  return "files";
}

// The board's left side: what is in its folder and what changed, docked so the canvas moves over instead of hiding.
export function WorkspacePanel({ run }: { run: Run }) {
  const width = useWorkspace((s) => s.width);
  const [tab, setTab] = useState<WorkspaceTab>(() => firstTab(run));
  const changed = run.nodes.reduce((n, t) => n + (t.changes?.files.length ? 1 : 0), 0);
  return (
    <aside
      aria-label={tw.label}
      className="relative flex h-full shrink-0 flex-col border-e bg-card max-md:absolute max-md:inset-0 max-md:z-30 max-md:w-full!"
      style={{ width }}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as WorkspaceTab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <header className="flex h-9 shrink-0 items-center border-b ps-1 pe-1">
          {/* Plain words with a line under the chosen one, like VS Code's panel tabs. */}
          <TabsList
            className="h-full min-w-0 flex-1 gap-0 overflow-x-auto no-scrollbar"
            markClassName="rounded-none bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-foreground"
          >
            {TABS.map((k) => (
              <TabsTrigger
                key={k}
                value={k}
                className="h-full gap-1.5 rounded-none px-2 text-xs focus-visible:ring-1 focus-visible:ring-inset"
              >
                {tw.tabs[k]}
                {k === "changes" && changed > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] leading-none tabular-nums">
                    {changed}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            variant="ghost"
            size="icon"
            aria-label={tw.close}
            title={`${tw.close} (${isMac ? "⌘B" : "Ctrl B"})`}
            className="size-6 shrink-0 rounded text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
            onClick={() => toggleWorkspace(false)}
          >
            <PanelLeftClose />
          </Button>
        </header>
        {TABS.map((k) => (
          <TabsContent key={k} value={k} className="min-h-0 overflow-y-auto">
            {k === "changes" ? (
              <ChangesTab run={run} />
            ) : k === "files" ? (
              <FilesTab run={run} />
            ) : k === "git" ? (
              <GitTab run={run} />
            ) : (
              <OutlineTab run={run} />
            )}
          </TabsContent>
        ))}
      </Tabs>
      <WorkspaceResizer width={width} />
    </aside>
  );
}

const STEP = 16;

// The panel's right edge: drag it, or focus it and use the arrow keys; a double-click puts the default width back.
function WorkspaceResizer({ width }: { width: number }) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: 0 });
  const end = () => {
    setDragging(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    setWorkspaceWidth(useWorkspace.getState().width);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable splitter has no native element; role="separator" is the ARIA pattern.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={tw.resize}
      aria-valuenow={width}
      aria-valuemin={WORKSPACE_MIN}
      aria-valuemax={clampWorkspace(Number.POSITIVE_INFINITY)}
      tabIndex={0}
      title={t.resizePanelHint}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        setDragging(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (dragging) setWorkspaceWidth(start.current.w + e.clientX - start.current.x, false);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => setWorkspaceWidth(WORKSPACE_DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? STEP * 4 : STEP;
        const next =
          e.key === "ArrowRight"
            ? width + step
            : e.key === "ArrowLeft"
              ? width - step
              : e.key === "Home"
                ? WORKSPACE_MIN
                : e.key === "End"
                  ? Number.POSITIVE_INFINITY
                  : null;
        if (next === null) return;
        e.preventDefault();
        setWorkspaceWidth(next);
      }}
      className="group absolute inset-y-0 -right-1.5 z-30 flex w-3 cursor-col-resize touch-none justify-center focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className={cn(
          "w-0.5 bg-transparent transition-colors group-hover:bg-border group-focus-visible:bg-ring",
          dragging && "bg-ring group-hover:bg-ring",
        )}
      />
    </div>
  );
}
