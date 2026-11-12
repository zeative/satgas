import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Globe,
  Link2,
  Lock,
  Monitor,
  Plus,
  Power,
  RotateCw,
  Smartphone,
  SquareDashedMousePointer,
  Tablet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openExternal } from "@/components/outbound-link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { dropFrame, type FileBox, setFrameLayout, useFrames } from "@/stores/frames";
import { closeInspect, type PickedEl, pickElement, setPicking, useInspect } from "@/stores/inspect";
import { useRuns } from "@/stores/runs";
import { type Card, DEVICES, type Device } from "../../../shared/board";
import { newId, useBoard } from "./context";
import { BarButton, PageFrame } from "./page-frame";

const tb = t.board.browser;
// The screen each frame stands for, so the page's viewport units keep their real size while the frame shows all of it.
const SCREEN_H: Record<Device, number> = { desktop: 800, tablet: 1024, phone: 844 };
const BAR_H = 32;
// A page taller than this keeps its frame here and scrolls inside it.
const MAX_PAGE_H = 16_000;
const DEVICE_ICON = { desktop: Monitor, tablet: Tablet, phone: Smartphone } satisfies Record<Device, unknown>;

const appCall = async (runId: string, name: string, action: "start" | "stop" | "share" | "unshare") => {
  const res = await fetch(`/api/runs/${runId}/apps/${name}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? t.board.app.failed);
};

// Apps this page already started on its own, so a board of several frames starts its app once and a person's Stop holds.
const woken = new Set<string>();

// The page's own address under the app's base, the way a browser bar shows it.
const routeOf = (path: string, base: string) => (path.startsWith(base) ? `/${path.slice(base.length)}` : path);
const urlOf = (base: string, route: string | undefined) => base + (route ?? "").replace(/^\//, "");

interface BridgeMsg {
  satgas: true;
  type: "nav" | "pick" | "escape" | "layout" | "size";
  h?: number;
  path?: string;
  files?: Record<string, FileBox>;
  scrollY?: number;
  vh?: number;
  el?: PickedEl;
  keep?: boolean;
}

// A web app the team runs, live on the board as a small browser: its address, history, screen size, and a pick mode
// that hands the element under the pointer to the inspector.
export function AppBody({ card, interactive }: { card: Card; interactive: boolean }) {
  const { runId, commit } = useBoard();
  const name = card.app ?? "";
  const app = useRuns((s) => (s.run?.id === runId ? s.run.apps?.[name] : undefined));
  const picking = useInspect((s) => s.picking === card.id);
  const frame = useRef<HTMLIFrameElement>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [pageH, setPageH] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  // The page the frame opened at; later moves happen inside the page, so the frame is not reloaded for them.
  const [start, setStart] = useState(card.route);
  const status = app?.status ?? "stopped";
  const device = card.device ?? "desktop";
  const base = app?.path ?? "";
  const route = path !== null && base ? routeOf(path, base) : (card.route ?? "/");

  const geometry = useCallback((g: { scale: number; left: number }) => setFrameLayout(card.id, g), [card.id]);
  const send = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ satgas: true, ...msg }, "*");
  }, []);

  useEffect(() => {
    const on = (e: MessageEvent<BridgeMsg>) => {
      if (e.source !== frame.current?.contentWindow || e.data?.satgas !== true) return;
      const m = e.data;
      if (m.type === "nav" && m.path) setPath(m.path);
      else if (m.type === "size" && m.h) setPageH(Math.min(MAX_PAGE_H, m.h));
      else if (m.type === "layout" && m.files) setFrameLayout(card.id, { files: m.files, scrollY: m.scrollY ?? 0, vh: m.vh ?? 0 });
      else if (m.type === "pick" && m.el) pickElement({ runId, cardId: card.id, app: name, el: m.el, send }, !!m.keep);
      else if (m.type === "escape") {
        if (useInspect.getState().picking === card.id) setPicking(null);
        else closeInspect();
      }
    };
    addEventListener("message", on);
    return () => removeEventListener("message", on);
  }, [runId, card.id, name, send]);

  useEffect(() => send({ type: "mode", pick: picking }), [picking, send]);
  useEffect(() => send({ type: "screen", h: SCREEN_H[device] }), [device, send]);
  // The frame is as tall as the whole page, the way a design file shows a screen, so nobody scrolls inside it.
  const scale = useFrames((s) => s[card.id]?.scale);
  const height = useRef(card.h);
  height.current = card.h;
  useEffect(() => {
    if (!pageH || !scale) return;
    const want = BAR_H + Math.ceil(pageH * scale);
    if (Math.abs(want - height.current) <= 8) return;
    const id = setTimeout(() => commit([{ op: "patch", id: card.id, patch: { h: want } }]), 300);
    return () => clearTimeout(id);
  }, [pageH, scale, card.id, commit]);
  // A frame that leaves the board takes its selection with it.
  useEffect(
    () => () => {
      const s = useInspect.getState();
      if (s.picking === card.id) setPicking(null);
      if (s.target?.cardId === card.id) closeInspect();
      dropFrame(card.id);
    },
    [card.id],
  );

  // The frames are the app: opening the board opens it, the way visiting its address does. A failed app waits for the
  // person, who reads why first.
  useEffect(() => {
    const key = `${runId}/${name}`;
    if (!name || !app || woken.has(key)) return;
    // Seen running once here, it stays as the person leaves it.
    woken.add(key);
    if (app.status !== "stopped") return;
    void appCall(runId, name, "start").catch(() => {});
  }, [runId, name, app]);

  const act = (action: "start" | "stop") => {
    setBusy(true);
    appCall(runId, name, action)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(false));
  };
  const go = (to: string) => {
    const r = to.startsWith("/") ? to : `/${to}`;
    send({ type: "go", path: urlOf(base, r) });
    commit([{ op: "patch", id: card.id, patch: { route: r === "/" ? undefined : r } }]);
  };
  const setDevice = (d: Device) => commit([{ op: "patch", id: card.id, patch: { device: d === "desktop" ? undefined : d } }]);
  const reload = () => {
    setStart(route === "/" ? undefined : route);
    setPath(null);
    setNonce((n) => n + 1);
  };
  const addFrame = () =>
    commit([
      {
        op: "put",
        card: {
          id: newId(),
          kind: "preview",
          app: name,
          title: card.title,
          x: card.x + card.w + 48,
          y: card.y,
          w: card.w,
          h: card.h,
          createdAt: Date.now(),
          ...(route !== "/" ? { route } : {}),
          ...(card.device ? { device: card.device } : {}),
        },
      },
    ]);

  const running = status === "running" && !!app;
  // A phone-width frame keeps the address, inspect and screen size; the rest lives on the wider frames and the menu.
  const narrow = card.w < 640;
  return (
    <div className="flex size-full flex-col">
      <div className="card-handle flex h-8 shrink-0 items-center gap-1 border-b bg-muted/40 px-1.5">
        <span
          aria-hidden="true"
          title={t.board.app.status[status]}
          className={cn(
            "mx-1 size-1.5 shrink-0 rounded-full",
            status === "running"
              ? "bg-emerald-500"
              : status === "starting"
                ? "bg-signal-ink"
                : status === "failed"
                  ? "bg-destructive"
                  : "bg-muted-foreground/50",
          )}
        />
        {!narrow && (
          <>
            <BarButton label={tb.back} disabled={!running} onClick={() => send({ type: "back" })}>
              <ArrowLeft />
            </BarButton>
            <BarButton label={tb.forward} disabled={!running} onClick={() => send({ type: "forward" })}>
              <ArrowRight />
            </BarButton>
          </>
        )}
        <BarButton label={t.board.reload} onClick={reload}>
          <RotateCw />
        </BarButton>
        <form
          className="nodrag mx-1 min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft !== null) go(draft.trim() || "/");
            setDraft(null);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <input
            aria-label={tb.address}
            value={draft ?? route}
            disabled={!running}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            className="h-6 w-full rounded-md border border-transparent bg-background px-2 font-mono text-xs text-muted-foreground transition-colors outline-none hover:border-border focus:border-ring focus:text-foreground disabled:opacity-60"
          />
        </form>
        <BarButton label={tb.inspect} pressed={picking} disabled={!running} onClick={() => setPicking(picking ? null : card.id)}>
          <SquareDashedMousePointer />
        </BarButton>
        <fieldset aria-label={tb.device} className="m-0 flex items-center border-0 p-0">
          {DEVICES.map((d) => {
            const Icon = DEVICE_ICON[d];
            return (
              <BarButton key={d} label={tb.devices[d]} pressed={device === d} onClick={() => setDevice(d)}>
                <Icon />
              </BarButton>
            );
          })}
        </fieldset>
        {!narrow && (
          <>
            <BarButton label={tb.newFrame} disabled={!running} onClick={addFrame}>
              <Plus />
            </BarButton>
            {app && <AppShare runId={runId} name={name} shared={!!app.shared} path={app.path} />}
            {app && (
              <BarButton label={t.board.open} onClick={() => openExternal(`${location.origin}${urlOf(app.path, route)}`)}>
                <ExternalLink />
              </BarButton>
            )}
            {running && (
              <BarButton label={t.board.app.stop} disabled={busy} onClick={() => act("stop")}>
                <Power />
              </BarButton>
            )}
          </>
        )}
      </div>
      {running ? (
        <PageFrame
          key={nonce}
          frameRef={frame}
          src={urlOf(app.path, start)}
          title={name}
          page
          device={device}
          interactive={interactive || picking}
          w={card.w}
          h={card.h}
          onLoad={() => {
            send({ type: "screen", h: SCREEN_H[device] });
            send({ type: "mode", pick: useInspect.getState().picking === card.id });
          }}
          onGeometry={geometry}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {status === "starting" ? (
            <p className="satgas-shimmer text-sm">{t.board.app.starting(name)}</p>
          ) : (
            <>
              <p className="max-w-sm text-sm text-muted-foreground">
                {status === "failed" ? t.board.app.failedLead : t.board.app.stoppedLead}
              </p>
              {status === "failed" && app?.error && (
                <pre className="nowheel max-h-40 w-full max-w-xl overflow-auto rounded-md border bg-muted/40 p-2 text-start font-mono text-[11px] leading-4 whitespace-pre-wrap text-destructive">
                  {app.error}
                </pre>
              )}
              <Button size="sm" variant="secondary" className="nodrag" disabled={busy} onClick={() => act("start")}>
                {t.board.app.start}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Who may open the app, the way a document is shared: only the signed-in person, or anyone with the link.
function AppShare({ runId, name, shared, path }: { runId: string; name: string; shared: boolean; path: string }) {
  const set = (on: boolean) => void appCall(runId, name, on ? "share" : "unshare").catch((e: Error) => toast.error(e.message));
  const link = `${location.origin}${path}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.board.app.share}
          title={t.board.app.share}
          className="nodrag size-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
        >
          {shared ? <Globe /> : <Lock />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="nodrag w-72 p-1">
        <div className="flex h-9 items-center justify-between gap-2 ps-2">
          <p className="truncate text-sm font-medium">{t.board.app.shareTitle(name)}</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(link)
                .then(() => toast.success(t.board.app.copied))
                .catch(() => toast.error(link))
            }
          >
            <Link2 className="size-3.5" aria-hidden="true" />
            {t.board.app.copyLink}
          </Button>
        </div>
        <fieldset aria-label={t.board.app.access} className="m-0 flex flex-col border-0 p-0">
          {[false, true].map((on) => (
            <label
              key={String(on)}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input type="radio" name={`share-${runId}-${name}`} checked={shared === on} onChange={() => set(on)} className="sr-only" />
              {on ? (
                <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm">{on ? t.board.app.anyone : t.board.app.restricted}</span>
                <span className="truncate text-xs text-muted-foreground">{on ? t.board.app.anyoneHint : t.board.app.restrictedHint}</span>
              </span>
              <Check className={cn("size-4 shrink-0", shared !== on && "invisible")} aria-hidden="true" />
            </label>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
