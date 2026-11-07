import { Check, ExternalLink, LogIn, MoreHorizontal, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LogoTile as Tile } from "@/components/logo-tile";
import { OutboundLink, openExternal } from "@/components/outbound-link";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { newId } from "@/features/board/context";
import { lang, t } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import {
  type AuthSupport,
  detectSignIn,
  type LoginStart,
  loadLogins,
  signInStatus,
  startSignIn,
  useLogins,
} from "@/stores/connector-logins";
import { saveSettings } from "@/stores/settings";
import { byId, CATALOG, type CatalogItem, type Category, catalogOf, type Secret, type Text, toServer } from "../../../shared/catalog";
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

export type Setup = "all" | "nokey" | "key";
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

// Adding always goes through the dialog: it finds out how the server signs in and offers what it supports.
export function useAddConnector(settings: Settings, onConnected?: () => void) {
  const [connecting, setConnecting] = useState<CatalogItem | null>(null);
  const add = (item: CatalogItem) => setConnecting(item);
  const added = async (next: McpServer) => {
    const problem = await saveSettings({ ...settings, mcpServers: [...settings.mcpServers, next] });
    if (problem) return problem;
    if (connecting) toast.success(ti.addedToast(connecting.name), { description: ti.addedHint });
    void loadLogins();
    onConnected?.();
    return null;
  };
  const dialog = connecting && (
    <ConnectDialog
      target={targetOf(connecting)}
      onClose={() => setConnecting(null)}
      onSignedIn={(id, url) => added(toServer(connecting, {}, id, settings.mcpServers, url))}
      onKey={(id, values) => added(toServer(connecting, values, id, settings.mcpServers))}
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
                      onClick={() => add(item)}
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
  const [signingIn, setSigningIn] = useState<McpServer | null>(null);
  const logins = useLogins();
  useEffect(() => void loadLogins(), []);
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
                  {logins[s.id]?.broken ? (
                    <button
                      type="button"
                      onClick={() => setSigningIn(s)}
                      className="relative z-10 w-fit rounded text-start text-xs text-destructive underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {ti.signInAgain}
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">{s.transport === "http" ? ti.remote : ti.local}</p>
                  )}
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
                      {s.transport === "http" && (
                        <DropdownMenuItem onClick={() => setSigningIn(s)}>
                          <LogIn />
                          {ti.tabSignIn}
                        </DropdownMenuItem>
                      )}
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
      {signingIn && (
        <ConnectDialog
          target={{
            name: catalogOf(signingIn)?.name ?? signingIn.name,
            by: catalogOf(signingIn)?.by ?? signingIn.name,
            logo: catalogOf(signingIn)?.logo,
            keyUrl: signingIn.url ?? "",
            signInUrl: catalogOf(signingIn)?.oauthUrl ?? signingIn.url ?? "",
            secrets: [],
            serverId: signingIn.id,
          }}
          onClose={() => setSigningIn(null)}
          onSignedIn={async (_id, url) => {
            void loadLogins();
            // A server that signs in on its own address moves there, or the token would go to the wrong one.
            if (url === signingIn.url) return null;
            return saveSettings({ ...settings, mcpServers: servers.map((x) => (x.id === signingIn.id ? { ...x, url } : x)) });
          }}
        />
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

// What the dialog needs to know: a catalog entry, or a server someone added by hand.
interface Target {
  name: string;
  by: string;
  desc?: string;
  logo?: CatalogItem["logo"];
  // Where a key goes, and where to sign in; they differ on servers that keep sign-ins on their own address.
  keyUrl: string;
  signInUrl: string;
  secrets: Secret[];
  preferSignIn?: boolean;
  serverId?: string;
}

const urlOf = (item: CatalogItem) => (item.server.transport === "http" ? item.server.url : "");
const targetOf = (item: CatalogItem): Target => ({
  name: item.name,
  by: item.by,
  desc: say(item.desc),
  logo: item.logo,
  keyUrl: urlOf(item),
  signInUrl: item.oauthUrl ?? urlOf(item),
  secrets: item.secrets ?? [],
  preferSignIn: item.preferSignIn,
});

function useSupport(url: string, attempt = 0) {
  const [support, setSupport] = useState<AuthSupport | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new attempt asks again.
  useEffect(() => {
    let live = true;
    setSupport(null);
    if (!url) return;
    void detectSignIn(url)
      .catch((): AuthSupport => ({ open: false, oauth: false, failed: true }))
      .then((found) => {
        if (live) setSupport(found);
      });
    return () => {
      live = false;
    };
  }, [url, attempt]);
  return support;
}

interface ConnectProps {
  target: Target;
  onClose: () => void;
  onSignedIn: (serverId: string, url: string) => Promise<string | null>;
  onKey?: (serverId: string, values: Record<string, string>) => Promise<string | null>;
}

// Finds out how a server signs in and offers that: its own sign-in page, an API key, or the choice when it has both.
function ConnectDialog({ target, onClose, onSignedIn, onKey }: ConnectProps) {
  const [attempt, setAttempt] = useState(0);
  const support = useSupport(target.signInUrl, attempt);
  const [tab, setTab] = useState<"signin" | "key">("signin");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [login, setLogin] = useState<LoginStart | null>(null);
  const [serverId] = useState(() => target.serverId ?? newId());
  const uid = useId();
  const canKey = !!onKey && target.secrets.length > 0 && !(support?.oauth && target.preferSignIn);
  const signingIn = !!support?.oauth && (tab === "signin" || !canKey);
  const missing = target.secrets.some((s) => !s.optional && !values[s.key]?.trim());
  const nothing = !!support && !support.failed && !support.oauth && !canKey;
  const note = !support
    ? ti.checkingSignIn(target.name)
    : support.failed
      ? ti.checkFailedServer
      : nothing
        ? ti.noSignIn
        : login
          ? ti.waitingSignIn
          : signingIn
            ? ti.signInHint(target.by)
            : ti.keyStored;

  // The page opened in another tab, so the answer is fetched rather than waited for.
  useEffect(() => {
    if (!login) return;
    const timer = setInterval(() => {
      void signInStatus(login.state).then(async ({ status, error }) => {
        if (status === "waiting") return;
        clearInterval(timer);
        setLogin(null);
        if (status !== "done") return setProblem(error ?? ti.signInFailed);
        const failed = await onSignedIn(serverId, target.signInUrl);
        if (failed) setProblem(failed);
        else onClose();
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [login, onClose, onSignedIn, serverId, target.signInUrl]);

  const begin = async () => {
    setProblem(null);
    setSaving(true);
    try {
      const started = await startSignIn(serverId, target.signInUrl);
      // A browser may block a tab opened after the wait; the waiting state keeps a link to it.
      if (started.flow === "redirect") openExternal(started.open);
      setLogin(started);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (missing || !onKey) return;
    setSaving(true);
    const result = await onKey(serverId, values);
    setSaving(false);
    if (result) setProblem(result);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="gap-4 p-5 sm:max-w-md">
        <DialogHeader className="min-w-0 flex-row items-center gap-3 pe-3 text-start">
          <Tile size="xs" logo={target.logo} fallback={<Server className="size-5 text-muted-foreground" aria-hidden="true" />} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle className="text-base font-medium">{ti.connect(target.name)}</DialogTitle>
            {target.desc && (
              <DialogDescription className="truncate text-xs" title={target.desc}>
                {target.desc}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        {support?.oauth && canKey && !login && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "key")}>
            <TabsList>
              <TabsTrigger value="signin">{ti.tabSignIn}</TabsTrigger>
              <TabsTrigger value="key">{ti.tabKey}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {login?.flow === "device" && (
          <div className="flex h-10 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3">
            <code className="font-mono text-sm tracking-widest">{login.code}</code>
            <span className="text-xs text-muted-foreground">{ti.deviceHint}</span>
          </div>
        )}

        {support && !support.failed && !signingIn && canKey && (
          <form
            id={`${uid}-form`}
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {target.secrets.map((s) => (
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
          </form>
        )}

        {problem && (
          <p role="alert" className="text-xs text-destructive">
            <RichText text={problem} />
          </p>
        )}

        <DialogFooter className="min-h-8 flex-row items-center justify-between gap-3 sm:justify-between">
          <p role="status" className={cn("min-w-0 text-xs text-muted-foreground", (!support || login) && "satgas-shimmer")}>
            {note}
          </p>
          {support?.failed ? (
            <Button className="shrink-0" onClick={() => setAttempt((n) => n + 1)}>
              {ti.tryAgain}
            </Button>
          ) : login?.flow === "device" ? (
            <Button
              className="shrink-0"
              onClick={() => {
                void copyText(login.code);
                openExternal(login.open);
              }}
            >
              <ExternalLink />
              {ti.copyAndOpen}
            </Button>
          ) : login ? (
            <ExternalText href={login.open}>
              <span className="text-xs whitespace-nowrap">{ti.openAgain}</span>
            </ExternalText>
          ) : signingIn ? (
            <Button className="shrink-0" onClick={() => void begin()} disabled={saving}>
              <ExternalLink />
              {ti.continueWith(target.name)}
            </Button>
          ) : (
            support &&
            canKey && (
              <Button className="shrink-0" type="submit" form={`${uid}-form`} disabled={saving || missing}>
                {saving ? ti.saving : ti.connectBtn}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TOOLS_SHOWN = 18;
const monthOf = (added: string) =>
  new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${added}-01T00:00:00Z`));

// A long list stays three columns and six rows until someone asks for the rest.
function ToolChips({ tools }: { tools: string[] }) {
  const [all, setAll] = useState(false);
  const sorted = [...tools].sort();
  return (
    <>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(all ? sorted : sorted.slice(0, TOOLS_SHOWN)).map((name) => (
          <li key={name} className="min-w-0">
            <code
              title={name}
              className="block h-7 w-fit max-w-full truncate rounded-full border px-2.5 font-mono text-xs leading-[26px] text-muted-foreground"
            >
              {name}
            </code>
          </li>
        ))}
      </ul>
      {!all && sorted.length > TOOLS_SHOWN && (
        <Button variant="ghost" size="sm" className="-ms-2.5 w-fit text-muted-foreground" onClick={() => setAll(true)}>
          {t.showAll(sorted.length)}
        </Button>
      )}
    </>
  );
}

// A connector's own page: what it does, what it offers, exactly what runs, the keys it needs and who makes it.
export function ConnectorDetail({ settings, id, onBack }: { settings: Settings; id: string; onBack: () => void }) {
  const { add, dialog } = useAddConnector(settings);
  const [removing, setRemoving] = useState(false);
  const item = byId.get(id);
  const support = useSupport(item ? (item.oauthUrl ?? urlOf(item)) : "");
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
  const signInFact = !support
    ? "…"
    : support.failed
      ? "—"
      : support.oauth
        ? keys.length && !item.preferSignIn
          ? ti.keyEither
          : ti.keyAccount
        : needsKey(item)
          ? ti.keyRequired
          : keys.length
            ? ti.keyOptional
            : ti.keyNone;
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
            <Button onClick={() => add(item)}>
              <Plus />
              {ti.connectBtn}
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
            <Fact label={ti.signIn}>{signInFact}</Fact>
            <Fact label={item.server.transport === "http" ? ti.connectorUrl : ti.command}>
              <code className="font-mono text-xs">{runs}</code>
            </Fact>
            <Fact label={ti.addedOn}>{monthOf(item.added)}</Fact>
            <Fact label={ti.moreInfo}>
              <span className="flex flex-col items-start gap-1">
                <ExternalText href={item.docs}>{ti.documentation}</ExternalText>
                {item.support && <ExternalText href={item.support}>{ti.support}</ExternalText>}
                {item.privacy && <ExternalText href={item.privacy}>{ti.privacyPolicy}</ExternalText>}
              </span>
            </Fact>
          </>
        }
      >
        <p className="max-w-prose text-sm leading-6">{say(item.about)}</p>
        <DetailSection title={ti.keyFeatures}>
          <ul className="flex max-w-prose list-disc flex-col gap-1.5 ps-4 text-sm leading-6 marker:text-muted-foreground">
            {item.features.map((f) => (
              <li key={f.title.en}>
                <span className="font-medium">{say(f.title)}:</span> <span className="text-muted-foreground">{say(f.text)}</span>
              </li>
            ))}
          </ul>
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
        {item.tools.length > 0 && (
          <DetailSection title={ti.toolsLabel} count={`${item.tools.length}${item.moreTools ? "+" : ""}`}>
            <ToolChips tools={item.tools} />
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
