import { Check, ExternalLink, Info, MoreHorizontal, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LogoTile as Tile } from "@/components/logo-tile";
import { OutboundLink } from "@/components/outbound-link";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { newId } from "@/features/board/context";
import { lang, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { saveSettings } from "@/stores/settings";
import { byId, CATALOG, type CatalogItem, type Category, catalogOf, type Text, toServer } from "../../../shared/catalog";
import type { McpServer, Settings } from "../../../shared/settings";
import { DetailPage, DetailSection, ExternalText, Fact } from "./detail";
import { describe, ServerDialog } from "./server-dialog";
import { update } from "./update";

const ti = t.integrations;
const say = (text: Text) => text[lang];

const matches = (q: string, ...fields: (string | undefined)[]) => {
  const needle = q.trim().toLowerCase();
  return !needle || fields.some((f) => f?.toLowerCase().includes(needle));
};

function LogoTile({ item }: { item?: CatalogItem }) {
  return <Tile logo={item?.logo} fallback={<Server className="size-5 text-muted-foreground" aria-hidden="true" />} />;
}

// Under a connector only a note it cannot work without; keys and limits live on its page.
function Meta({ item }: { item: CatalogItem }) {
  return item.note ? <p className="text-xs text-muted-foreground">{say(item.note)}</p> : null;
}

export type Setup = "all" | "nokey" | "key" | "every" | "claude";
export interface Filter {
  category: Category | null;
  setup: Setup;
}
export const NO_FILTER: Filter = { category: null, setup: "all" };

const needsKey = (c: CatalogItem) => !!c.secrets?.some((s) => !s.optional);
export const SETUP_TEST: Record<Setup, (c: CatalogItem) => boolean> = {
  all: () => true,
  nokey: (c) => !needsKey(c),
  key: needsKey,
  every: (c) => c.server.transport === "stdio",
  claude: (c) => c.server.transport === "http",
};

export const applyFilter = (items: CatalogItem[], f: Filter) =>
  items.filter((c) => (!f.category || c.category === f.category) && SETUP_TEST[f.setup](c));

interface DiscoverProps {
  settings: Settings;
  query: string;
  filter: Filter;
  onClearFilter: () => void;
  onCustom: () => void;
  onOpen: (id: string) => void;
}

// Adds a catalog connector: straight away when it needs nothing, through the key dialog when it does.
export function useAddConnector(settings: Settings) {
  const [connecting, setConnecting] = useState<CatalogItem | null>(null);
  const add = async (item: CatalogItem) => {
    // Only a required key needs asking for; an optional one can be added later from Edit.
    if (needsKey(item)) return setConnecting(item);
    const servers = settings.mcpServers;
    if (await update({ ...settings, mcpServers: [...servers, toServer(item, {}, newId(), servers)] }))
      toast.success(ti.addedToast(item.name), { description: ti.addedHint });
  };
  const dialog = connecting && (
    <ConnectDialog
      item={connecting}
      onClose={() => setConnecting(null)}
      onSave={async (values) => {
        const servers = settings.mcpServers;
        const problem = await saveSettings({ ...settings, mcpServers: [...servers, toServer(connecting, values, newId(), servers)] });
        if (!problem) toast.success(ti.addedToast(connecting.name), { description: ti.addedHint });
        return problem;
      }}
    />
  );
  return { add, dialog };
}

export function Discover({ settings, query, filter, onClearFilter, onCustom, onOpen }: DiscoverProps) {
  const { add, dialog } = useAddConnector(settings);
  // Added and on gets the check; added but switched off says so, so the catalog never makes an off connector look active.
  const on = new Set(settings.mcpServers.filter((s) => s.enabled).map((s) => catalogOf(s)?.id));
  const off = new Set(settings.mcpServers.filter((s) => !s.enabled).map((s) => catalogOf(s)?.id));
  const filtered = filter.category !== null || filter.setup !== "all";
  const items = applyFilter(CATALOG, filter).filter((c) => matches(query, c.name, c.by, say(c.desc)));

  return (
    <>
      <section aria-labelledby="catalog" className="flex flex-col gap-4">
        <h2 id="catalog" className="flex items-center gap-2 text-base font-medium">
          {ti.allConnectors}
          <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{items.length}</span>
        </h2>

        {items.length ? (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {items.map((item) => {
              const isOn = on.has(item.id);
              const isOff = !isOn && off.has(item.id);
              return (
                <li key={item.id} className="relative flex gap-4 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/80">
                  <LogoTile item={item} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h3 className="text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => onOpen(item.id)}
                        className="text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      >
                        {item.name}
                      </button>
                    </h3>
                    <p className="text-sm text-muted-foreground">{say(item.desc)}</p>
                    <Meta item={item} />
                  </div>
                  {isOn ? (
                    <span
                      role="img"
                      aria-label={`${item.name}: ${ti.added}`}
                      title={ti.added}
                      className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    >
                      <Check className="size-4" aria-hidden="true" />
                    </span>
                  ) : isOff ? (
                    <span
                      title={ti.addedOff}
                      className="relative z-10 flex h-8 shrink-0 items-center rounded-lg border px-2.5 text-xs text-muted-foreground"
                    >
                      {ti.off}
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="icon"
                      className="relative z-10 size-8 shrink-0 rounded-lg bg-background"
                      aria-label={ti.addConnector(item.name)}
                      title={ti.addConnector(item.name)}
                      onClick={() => void add(item)}
                    >
                      <Plus />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-muted/50 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{query.trim() ? ti.noResults(query.trim()) : ti.noFilterMatches}</p>
            {filtered ? (
              <Button variant="outline" size="sm" onClick={onClearFilter}>
                {ti.clearFilters}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onCustom}>
                <Plus />
                {ti.addCustom}
              </Button>
            )}
          </div>
        )}
      </section>

      {dialog}
    </>
  );
}

interface YoursProps {
  settings: Settings;
  query: string;
  onDiscover: () => void;
  onCustom: () => void;
  onEdit: (server: McpServer) => void;
  onOpen: (id: string) => void;
}

export function Yours({ settings, query, onDiscover, onCustom, onEdit, onOpen }: YoursProps) {
  const [removing, setRemoving] = useState<McpServer | null>(null);
  const servers = settings.mcpServers;
  const shown = servers.filter((s) => matches(query, s.name, catalogOf(s)?.name, describe(s)));
  const replace = (next: McpServer[]) => update({ ...settings, mcpServers: next });
  const remove = async () => {
    if (!removing) return null;
    const problem = await saveSettings({ ...settings, mcpServers: servers.filter((x) => x.id !== removing.id) });
    if (!problem) setRemoving(null);
    return problem;
  };

  if (!servers.length)
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-14 text-center">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{ti.noYours}</p>
          <p className="text-sm text-muted-foreground">{ti.noYoursHint}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onDiscover}>
            {ti.browse}
          </Button>
          <Button size="sm" variant="outline" onClick={onCustom}>
            <Plus />
            {ti.addCustom}
          </Button>
        </div>
      </div>
    );

  return (
    <section aria-labelledby="yours" className="flex flex-col gap-4">
      <h2 id="yours" className="flex items-center gap-2 text-base font-medium">
        {ti.connectors}
        <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{shown.length}</span>
      </h2>
      {shown.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.map((s) => {
            const item = catalogOf(s);
            return (
              <li key={s.id} className="relative flex items-start gap-4 rounded-xl bg-muted/50 p-4">
                <LogoTile item={item} />
                <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !s.enabled && "opacity-60")}>
                  <h3 className="truncate text-sm font-medium">
                    {item ? (
                      <button
                        type="button"
                        onClick={() => onOpen(item.id)}
                        className="text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      >
                        {item.name}
                      </button>
                    ) : (
                      s.name
                    )}
                  </h3>
                  {item ? (
                    <p className="text-sm text-muted-foreground">{say(item.desc)}</p>
                  ) : (
                    <p className="truncate font-mono text-xs text-muted-foreground" title={describe(s)}>
                      {describe(s)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{s.transport === "http" ? `${ti.remote} · ${ti.claudeOnly}` : ti.local}</p>
                </div>
                <div className="relative z-10 flex shrink-0 items-center gap-1">
                  <Switch
                    checked={s.enabled}
                    aria-label={`${ti.enabled}: ${item?.name ?? s.name}`}
                    onCheckedChange={(enabled) => void replace(servers.map((x) => (x.id === s.id ? { ...x, enabled } : x)))}
                  />
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                        aria-label={`${t.moreActions}: ${item?.name ?? s.name}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(s)}>
                        <Pencil />
                        {ti.edit}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setRemoving(s)}>
                        <Trash2 />
                        {ti.remove}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl bg-muted/50 px-6 py-10 text-center text-sm text-muted-foreground">{ti.noResults(query.trim())}</p>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={ti.removeTitle(removing ? (catalogOf(removing)?.name ?? removing.name) : "")}
        desc={ti.removeText}
        confirmText={ti.remove}
        cancelBtnText={ti.cancel}
        destructive
        handleConfirm={remove}
      />
    </section>
  );
}

interface ConnectProps {
  item: CatalogItem;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<string | null>;
}

// Asks only for the keys a connector needs, links to where they are made, and shows exactly what will run.
function ConnectDialog({ item, onClose, onSave }: ConnectProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const uid = useId();
  const secrets = item.secrets ?? [];
  const missing = secrets.some((s) => !s.optional && !values[s.key]?.trim());
  const runs = item.server.transport === "http" ? item.server.url : [item.server.command, ...item.server.args].join(" ");

  const submit = async () => {
    if (missing) return;
    setSaving(true);
    const result = await onSave(values);
    setSaving(false);
    if (result) setProblem(result);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-center gap-4 text-start">
          <LogoTile item={item} />
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle>{ti.connect(item.name)}</DialogTitle>
            <DialogDescription>{say(item.desc)}</DialogDescription>
          </div>
        </DialogHeader>
        <form
          id={`${uid}-form`}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {secrets.map((s) => (
            <div key={s.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`${uid}-${s.key}`} className="text-sm font-medium">
                  {say(s.label)}
                </label>
                <OutboundLink
                  href={s.help}
                  className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {ti.getKey}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </OutboundLink>
              </div>
              <Input
                id={`${uid}-${s.key}`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
                value={values[s.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                required={!s.optional}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{ti.keyStored}</p>
          <div className="flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {ti.runs}
              {item.server.transport === "http" && ` · ${ti.claudeOnly}`}
            </span>
            <code className="font-mono text-xs [overflow-wrap:anywhere]">{runs}</code>
          </div>
          {item.note && <p className="text-xs text-muted-foreground">{say(item.note)}</p>}
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
          <Button type="submit" form={`${uid}-form`} disabled={saving || missing}>
            {saving ? ti.saving : ti.connectBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// A connector's own page: what it does, exactly what runs, the keys it needs and who makes it.
export function ConnectorDetail({ settings, id, onBack }: { settings: Settings; id: string; onBack: () => void }) {
  const { add, dialog } = useAddConnector(settings);
  const [removing, setRemoving] = useState(false);
  const item = byId.get(id);
  if (!item)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">{ti.connectorMissing}</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          {ti.connectors}
        </Button>
      </div>
    );
  const server = settings.mcpServers.find((s) => catalogOf(s)?.id === item.id);
  // Once added, show what this machine actually runs, edits included.
  const runs = server
    ? describe(server)
    : item.server.transport === "http"
      ? item.server.url
      : [item.server.command, ...item.server.args].join(" ");
  const keys = item.secrets ?? [];
  const replace = (next: McpServer[]) => update({ ...settings, mcpServers: next });
  const remove = async () => {
    if (!server) return null;
    const problem = await saveSettings({ ...settings, mcpServers: settings.mcpServers.filter((x) => x.id !== server.id) });
    if (!problem) setRemoving(false);
    return problem;
  };

  return (
    <>
      <DetailPage
        back={ti.connectors}
        onBack={onBack}
        logo={<Tile logo={item.logo} size="lg" />}
        title={item.name}
        desc={say(item.desc)}
        action={
          server ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" aria-hidden="true" />
                {ti.added}
              </span>
              <Switch
                checked={server.enabled}
                aria-label={`${ti.enabled}: ${item.name}`}
                onCheckedChange={(enabled) => void replace(settings.mcpServers.map((x) => (x.id === server.id ? { ...x, enabled } : x)))}
              />
              <Button variant="outline" onClick={() => setRemoving(true)}>
                {ti.remove}
              </Button>
            </>
          ) : (
            <Button onClick={() => void add(item)}>
              <Plus />
              {needsKey(item) ? ti.connectBtn : ti.add}
            </Button>
          )
        }
        aside={
          <>
            <Fact label={ti.madeBy}>
              <ExternalText href={item.site}>{item.by}</ExternalText>
            </Fact>
            <Fact label={ti.categoryLabel}>
              <span className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-xs">{ti.category[item.category]}</span>
            </Fact>
            <Fact label={ti.keyLabel}>{needsKey(item) ? ti.keyRequired : keys.length ? ti.keyOptional : ti.keyNone}</Fact>
            <Fact label={ti.worksWith}>{item.server.transport === "http" ? ti.worksClaude : ti.worksEvery}</Fact>
            <Fact label={ti.transport}>
              <RichText text={item.server.transport === "http" ? ti.remote : ti.localNpx} />
            </Fact>
            <Fact label={ti.moreInfo}>
              <ExternalText href={item.docs}>{ti.documentation}</ExternalText>
            </Fact>
          </>
        }
      >
        <p className="max-w-prose text-sm leading-6">{say(item.about)}</p>
        {item.note && (
          <p className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {say(item.note)}
          </p>
        )}
        <DetailSection title={ti.whatRuns}>
          <code className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs [overflow-wrap:anywhere]">{runs}</code>
          <p className="text-xs text-muted-foreground">{item.server.transport === "http" ? ti.whatRunsRemote : ti.whatRunsLocal}</p>
        </DetailSection>
        {keys.length > 0 && (
          <DetailSection title={ti.keys}>
            <ul className="divide-y rounded-xl bg-muted/50">
              {keys.map((k) => (
                <li key={k.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm">{say(k.label)}</span>
                    <code className="font-mono text-xs text-muted-foreground">{k.key}</code>
                  </div>
                  <ExternalText href={k.help}>
                    <span className="text-xs">{ti.getKey}</span>
                  </ExternalText>
                </li>
              ))}
            </ul>
          </DetailSection>
        )}
      </DetailPage>
      {dialog}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={ti.removeTitle(item.name)}
        desc={ti.removeText}
        confirmText={ti.remove}
        cancelBtnText={ti.cancel}
        destructive
        handleConfirm={remove}
      />
    </>
  );
}

export { ServerDialog };
