import { useNavigate, useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { Check, ChevronDown, ListFilter, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useRuns } from "@/stores/runs";
import { loadSettings, saveSettings, useSettings } from "@/stores/settings";
import { CATALOG, CATEGORIES } from "../../../shared/catalog";
import type { Runtime } from "../../../shared/providers";
import type { McpServer } from "../../../shared/settings";
import type { PackId } from "../../../shared/skills";
import type { ToolSetting } from "../../../shared/tools";
import { ChannelsTab } from "./channels";
import { ConnectorDetail, Discover, type Filter, NO_FILTER, SETUP_TEST, ServerDialog, type Setup, Yours } from "./connectors";
import { ProvidersSection } from "./providers";
import { AddSkillMenu, AddSkillsDialog, PackDetail, SkillDetail, type SkillDialog, SkillEditor, SkillsTab } from "./skills";
import { ToolDetail, ToolDialog, ToolsTab, toolSaved } from "./tools";

const ti = t.integrations;

export interface IntegrationsSearch {
  tab?: "providers" | "skills" | "tools" | "channels";
  view?: "yours";
  connector?: string;
  skill?: string;
  pack?: PackId;
  tool?: string;
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    // Set on a detail page opened from the list, so its back link can return to that entry instead of adding one.
    fromList?: boolean;
  }
}

export function IntegrationsPage() {
  const settings = useSettings((s) => s.settings);
  const error = useSettings((s) => s.error);
  const search = useSearch({ from: "/_app/integrations" });
  const navigate = useNavigate({ from: "/integrations" });
  const router = useRouter();
  const fromList = useRouterState({ select: (s) => s.location.state.fromList === true });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [editing, setEditing] = useState<McpServer | "new" | null>(null);
  const [skillDialog, setSkillDialog] = useState<SkillDialog | null>(null);
  const [editingTool, setEditingTool] = useState<ToolSetting | "new" | null>(null);
  const channels = useRuns((r) => r.config.channels === true);
  const current = search.tab === "channels" && !channels ? "connectors" : (search.tab ?? "connectors");
  const view = search.view ?? "discover";
  const go = (next: IntegrationsSearch) => {
    const detail = !!(next.connector || next.skill || next.pack || next.tool);
    void navigate({ search: next, replace: !detail, state: detail ? { fromList: true } : undefined });
  };
  // A deep-linked detail has no list behind it, so the list takes its place instead.
  const back = () => (fromList ? router.history.back() : go({ tab: search.tab, view: search.view }));

  useEffect(() => {
    void loadSettings();
  }, []);

  // A detail page replaces the whole tab, the way a store listing opens from its catalog.
  const detail =
    settings && search.connector ? (
      <ConnectorDetail settings={settings} id={search.connector} onBack={back} />
    ) : search.skill ? (
      <SkillDetail name={search.skill} onBack={back} onOpen={setSkillDialog} />
    ) : settings && search.tool ? (
      <ToolDetail settings={settings} id={search.tool} onBack={back} />
    ) : search.pack ? (
      <PackDetail id={search.pack} onBack={back} onShow={(skill) => go({ tab: "skills", pack: search.pack, skill })} />
    ) : null;

  return (
    <main id="content" className="relative flex-1">
      <PageHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-12 pb-16 sm:px-6">
        {detail ?? (
          <Tabs
            value={current}
            onValueChange={(v) => {
              setQuery("");
              go({ tab: v === "providers" || v === "skills" || v === "tools" || v === "channels" ? v : undefined });
            }}
            className="gap-8"
          >
            <header className="flex flex-col gap-6">
              <h1 className="brand-title text-[1.75rem] leading-tight">{ti.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <TabsList>
                  <TabsTrigger value="connectors">{ti.connectors}</TabsTrigger>
                  <TabsTrigger value="providers">{ti.providers}</TabsTrigger>
                  <TabsTrigger value="skills">{t.skills.tab}</TabsTrigger>
                  <TabsTrigger value="tools">{t.tools.tab}</TabsTrigger>
                  {channels && <TabsTrigger value="channels">{t.channels.tab}</TabsTrigger>}
                </TabsList>
                {current === "tools" && (
                  <Button size="sm" className="ms-auto" onClick={() => setEditingTool("new")}>
                    <Plus />
                    {t.tools.add}
                  </Button>
                )}
                {current === "skills" && (
                  <div className="ms-auto flex items-center gap-2 max-sm:ms-0 max-sm:w-full">
                    <div className="relative max-sm:flex-1">
                      <Search
                        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t.skills.search}
                        aria-label={t.skills.search}
                        className="h-7 w-full ps-8 sm:w-60"
                      />
                    </div>
                    <AddSkillMenu onPick={setSkillDialog} />
                  </div>
                )}
                {current === "connectors" && (
                  <>
                    <span aria-hidden="true" className="mx-1 h-4 w-px bg-border max-sm:hidden" />
                    <fieldset className="flex h-7 items-center rounded-lg bg-muted/50">
                      <legend className="sr-only">{ti.connectors}</legend>
                      {(["yours", "discover"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={view === v}
                          onClick={() => go({ view: v === "yours" ? "yours" : undefined })}
                          className={cn(
                            "flex h-full items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            view === v && "border-border bg-muted text-foreground",
                          )}
                        >
                          {v === "yours" ? ti.yours : ti.discover}
                          {v === "yours" && settings && settings.mcpServers.length > 0 && (
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">{settings.mcpServers.length}</span>
                          )}
                        </button>
                      ))}
                    </fieldset>
                    <div className="ms-auto flex items-center gap-2 max-sm:ms-0 max-sm:w-full">
                      <div className="relative max-sm:flex-1">
                        <Search
                          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={ti.search}
                          aria-label={ti.search}
                          className="h-7 w-full ps-8 sm:w-60"
                        />
                      </div>
                      {view === "discover" && <FilterMenu filter={filter} onChange={setFilter} />}
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm">
                            <Plus />
                            {ti.add}
                            <ChevronDown className="opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onSelect={() => setEditing("new")}>{ti.addCustom}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </>
                )}
              </div>
            </header>

            {error && !settings ? (
              <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm">
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={() => void loadSettings()}>
                  {t.retry}
                </Button>
              </div>
            ) : !settings ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-busy="true">
                {SKELETONS.map((k) => (
                  <div key={k} className="flex gap-4 rounded-xl bg-muted/50 p-4">
                    <Skeleton className="size-12 rounded-xl" />
                    <div className="flex flex-1 flex-col gap-2 pt-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <TabsContent value="connectors">
                  {view === "discover" ? (
                    <Discover
                      settings={settings}
                      query={query}
                      filter={filter}
                      onClearFilter={() => setFilter(NO_FILTER)}
                      onCustom={() => setEditing("new")}
                      onOpen={(id) => go({ view: search.view, connector: id })}
                    />
                  ) : (
                    <Yours
                      settings={settings}
                      query={query}
                      onDiscover={() => go({})}
                      onCustom={() => setEditing("new")}
                      onEdit={setEditing}
                      onOpen={(id) => go({ view: "yours", connector: id })}
                    />
                  )}
                </TabsContent>
                <TabsContent value="channels">
                  <ChannelsTab />
                </TabsContent>
                <TabsContent value="providers">
                  <ProvidersSection settings={settings} />
                </TabsContent>
                <TabsContent value="tools">
                  <ToolsTab settings={settings} onOpen={(tool) => go({ tab: "tools", tool })} onEdit={setEditingTool} />
                </TabsContent>
                <TabsContent value="skills">
                  <SkillsTab
                    query={query}
                    onOpen={setSkillDialog}
                    onShow={(skill) => go({ tab: "skills", skill })}
                    onShowPack={(pack) => go({ tab: "skills", pack })}
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
      </div>

      {skillDialog === "write" && <SkillEditor onClose={() => setSkillDialog(null)} />}
      {typeof skillDialog === "object" && skillDialog && <SkillEditor name={skillDialog.edit} onClose={() => setSkillDialog(null)} />}
      {(skillDialog === "github" || skillDialog === "zip" || skillDialog === "local") && (
        <AddSkillsDialog from={skillDialog} onClose={() => setSkillDialog(null)} />
      )}
      {editingTool && settings && (
        <ToolDialog
          tool={editingTool === "new" ? null : editingTool}
          onClose={() => setEditingTool(null)}
          onSave={async (tool) => {
            const tools = settings.tools.some((x) => x.id === tool.id)
              ? settings.tools.map((x) => (x.id === tool.id ? tool : x))
              : [...settings.tools, tool];
            const problem = await saveSettings({ ...settings, tools });
            if (!problem) toolSaved();
            return problem;
          }}
        />
      )}
      {editing && settings && (
        <ServerDialog
          server={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (server) => {
            const servers = settings.mcpServers;
            const next = servers.some((x) => x.id === server.id)
              ? servers.map((x) => (x.id === server.id ? server : x))
              : [...servers, server];
            const problem = await saveSettings({ ...settings, mcpServers: next });
            if (!problem) toast.success(ti.saved);
            return problem;
          }}
        />
      )}
    </main>
  );
}

const SKELETONS = ["a", "b", "c", "d"];
const SETUPS: Setup[] = ["all", "nokey", "key"];
const SETUP_LABEL: Record<Setup, string> = {
  all: ti.setupAll,
  nokey: ti.noKey,
  key: ti.withKey,
};

// Categories and setup needs, with counts; the chosen row carries the check, like a store filter.
function FilterMenu({ filter, onChange }: { filter: Filter; onChange: (f: Filter) => void }) {
  const activeCount = (filter.category !== null ? 1 : 0) + (filter.setup !== "all" ? 1 : 0);
  const active = activeCount > 0;
  const count = (n: number) => <span className="ms-auto font-mono text-xs text-muted-foreground tabular-nums">{n}</span>;
  const tick = <Check className="ms-auto size-4 text-foreground" aria-hidden="true" />;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={active ? ti.filterActive(activeCount) : ti.filter}
          title={ti.filter}
          className={cn("relative text-muted-foreground hover:text-foreground", active && "bg-muted text-foreground")}
        >
          <ListFilter />
          {active && <span aria-hidden="true" className="absolute end-1 top-1 size-1.5 rounded-full bg-signal" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem
          role="menuitemradio"
          aria-checked={filter.category === null}
          onSelect={(e) => {
            e.preventDefault();
            onChange({ ...filter, category: null });
          }}
        >
          {ti.allCategories}
          {filter.category === null ? tick : count(CATALOG.length)}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {CATEGORIES.map((c) => (
          <DropdownMenuItem
            key={c}
            role="menuitemradio"
            aria-checked={filter.category === c}
            onSelect={(e) => {
              e.preventDefault();
              onChange({ ...filter, category: filter.category === c ? null : c });
            }}
          >
            {ti.category[c]}
            {filter.category === c ? tick : count(CATALOG.filter((x) => x.category === c).length)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{ti.setup}</DropdownMenuLabel>
        {SETUPS.map((s) => (
          <DropdownMenuItem
            key={s}
            role="menuitemradio"
            aria-checked={filter.setup === s}
            onSelect={(e) => {
              e.preventDefault();
              onChange({ ...filter, setup: s });
            }}
          >
            {SETUP_LABEL[s]}
            {filter.setup === s ? tick : count(CATALOG.filter(SETUP_TEST[s]).length)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
