import { ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LogoTile } from "@/components/logo-tile";
import { OutboundLink } from "@/components/outbound-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fmtElapsed, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { request } from "@/stores/runs";
import type { ChannelKind, ChannelStatus, ChannelsView, PairedPerson } from "../../../shared/channels";

const tc = t.channels;
const ZAILEYS = "https://github.com/zeative/zaileys";
const BOTFATHER = "https://t.me/BotFather";
const POLL_MS = 2000;

const brand = (kind: ChannelKind) => ({ src: `/brands/${kind}.svg` });

function StateText({ channel }: { channel: ChannelStatus }) {
  const { state } = channel;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", state === "error" ? "text-destructive" : "text-muted-foreground")}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          state === "connected"
            ? "bg-emerald-500"
            : state === "error"
              ? "bg-destructive"
              : state === "off"
                ? "bg-muted-foreground/40"
                : "bg-signal",
        )}
      />
      <span className={cn("min-w-0", state !== "error" && "truncate")}>
        {state === "error"
          ? (channel.error ?? tc.state.error)
          : channel.me && state === "connected"
            ? `${tc.state.connected} · ${channel.me}`
            : tc.state[state]}
      </span>
    </p>
  );
}

// Same card as Connectors and Agents; everything that takes room opens in a dialog, so the grid never changes shape.
function ChannelCard({
  channel,
  hint,
  control,
  onOpen,
}: {
  channel: ChannelStatus;
  hint: React.ReactNode;
  control: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <li className="relative flex gap-4 rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/80">
      <LogoTile logo={brand(channel.kind)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="text-sm font-medium">
          <button
            type="button"
            onClick={onOpen}
            className="text-start after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {tc[channel.kind]}
          </button>
        </h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
        <StateText channel={channel} />
      </div>
      <div className="relative z-10 flex shrink-0 items-start">{control}</div>
    </li>
  );
}

function ChannelDialog({
  kind,
  hint,
  open,
  onOpenChange,
  onOpenAutoFocus,
  children,
}: {
  kind: ChannelKind;
  hint: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAutoFocus?: (e: Event) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={onOpenAutoFocus}>
        <DialogHeader className="flex-row items-center gap-4 text-start">
          <LogoTile logo={brand(kind)} />
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle>{tc[kind]}</DialogTitle>
            <DialogDescription>{hint}</DialogDescription>
          </div>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function TelegramCard({ channel, onChange }: { channel: ChannelStatus; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const put = async (body: { enabled?: boolean; token?: string }) => {
    setBusy(true);
    try {
      await request("PUT", "/api/channels/telegram", body);
      setToken("");
      setOpen(false);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ChannelCard
        channel={channel}
        hint={tc.telegramHint}
        onOpen={() => setOpen(true)}
        control={
          channel.tokenSet ? (
            <Switch
              checked={channel.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => void put({ enabled })}
              aria-label={tc.telegram}
            />
          ) : (
            <Button type="button" variant="outline" size="sm" className="bg-background" onClick={() => setOpen(true)}>
              {tc.connect}
            </Button>
          )
        }
      />
      <ChannelDialog
        kind="telegram"
        hint={tc.telegramHint}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setToken("");
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          field.current?.focus();
        }}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) void put({ token, enabled: true });
          }}
        >
          {channel.state === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {channel.error ?? tc.state.error}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="telegram-token" className="text-sm font-medium">
                {tc.tokenPlaceholder}
              </label>
              <OutboundLink
                href={BOTFATHER}
                className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {tc.openBotFather}
                <ExternalLink className="size-3" aria-hidden="true" />
              </OutboundLink>
            </div>
            <Input
              ref={field}
              id="telegram-token"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">{channel.tokenSet ? tc.tokenReplace : tc.telegramSteps}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.integrations.cancel}
            </Button>
            <Button type="submit" disabled={busy || !token.trim()}>
              {channel.tokenSet ? tc.save : tc.connect}
            </Button>
          </DialogFooter>
        </form>
      </ChannelDialog>
    </>
  );
}

// Drawn here from the text zaileys gives, so a login QR never passes through another service.
function QrCode({ text }: { text: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    void import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "L");
      qr.addData(text);
      qr.make();
      if (live) setSvg(qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true }));
    });
    return () => {
      live = false;
    };
  }, [text]);
  return (
    <div
      role="img"
      aria-label={tc.scan}
      // White behind it whatever the theme: a phone cannot read a dark QR.
      className="mx-auto size-56 shrink-0 rounded-lg bg-white [&_svg]:size-full"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the library's own SVG, drawn from a QR string and no markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function WhatsAppCard({ channel, onChange }: { channel: ChannelStatus; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const before = useRef(channel.state);
  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await request("PUT", "/api/channels/whatsapp", { enabled });
      if (enabled) setOpen(true);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // The phone finished the job, so the QR has nothing left to say.
  useEffect(() => {
    const was = before.current;
    before.current = channel.state;
    if (open && was !== "connected" && channel.state === "connected") {
      setOpen(false);
      toast.success(tc.linked);
    }
  }, [channel.state, open]);
  const hint = (
    <>
      {tc.whatsappHint}{" "}
      <OutboundLink href={ZAILEYS} className="relative z-10 font-medium text-foreground underline-offset-4 hover:underline">
        zaileys
      </OutboundLink>
    </>
  );
  return (
    <>
      <ChannelCard
        channel={channel}
        hint={hint}
        onOpen={() => setOpen(true)}
        control={
          <Switch checked={channel.enabled} disabled={busy} onCheckedChange={(enabled) => void toggle(enabled)} aria-label={tc.whatsapp} />
        }
      />
      <ChannelDialog kind="whatsapp" hint={hint} open={open} onOpenChange={setOpen}>
        <div className="flex flex-col gap-4">
          {channel.qr ? (
            <>
              <QrCode text={channel.qr} />
              <p className="text-sm">{tc.scan}</p>
            </>
          ) : channel.state === "connecting" ? (
            <div
              role="status"
              className="mx-auto flex size-56 flex-col items-center justify-center gap-2 rounded-lg bg-muted/60 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {tc.state.connecting}
            </div>
          ) : (
            <StateText channel={channel} />
          )}
          <p className="text-xs text-muted-foreground">{tc.whatsappRisk}</p>
          {channel.state === "off" && (
            <DialogFooter>
              <Button type="button" disabled={busy} onClick={() => void toggle(true)}>
                {tc.linkNumber}
              </Button>
            </DialogFooter>
          )}
          {channel.state === "connected" && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setAsking(true);
                }}
              >
                {tc.unlink}
              </Button>
            </DialogFooter>
          )}
        </div>
      </ChannelDialog>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={tc.unlinkTitle}
        desc={tc.unlinkText}
        confirmText={tc.unlink}
        destructive
        handleConfirm={async () => {
          await request("POST", "/api/channels/whatsapp/logout", {});
          setAsking(false);
          onChange();
        }}
      />
    </>
  );
}

function PairDialog({
  view,
  open,
  onOpenChange,
  onNewCode,
}: {
  view: ChannelsView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewCode: () => void;
}) {
  const left = view.pairing ? fmtElapsed(Math.max(0, view.pairing.until - Date.now())) : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tc.pair}</DialogTitle>
          <DialogDescription>{tc.pairText}</DialogDescription>
        </DialogHeader>
        {view.pairing ? (
          <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/60 p-6">
            <p className="font-mono text-3xl font-medium tracking-widest tabular-nums">{view.pairing.code}</p>
            <p className="text-xs text-muted-foreground">{tc.pairUntil(left)}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">{tc.pairExpired}</p>
            <Button type="button" variant="outline" size="sm" onClick={onNewCode}>
              {tc.newCode}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function People({ view, onChange }: { view: ChannelsView; onChange: () => void }) {
  const [removing, setRemoving] = useState<PairedPerson | null>(null);
  const [pairing, setPairing] = useState(false);
  const known = useRef(new Set(view.people.map((p) => `${p.kind}:${p.ids[0]}`)));
  const pair = async () => {
    try {
      await request("POST", "/api/channels/pairing", {});
      setPairing(true);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  // The code just worked: say who came in and put the dialog away.
  useEffect(() => {
    const fresh = view.people.find((p) => !known.current.has(`${p.kind}:${p.ids[0]}`));
    known.current = new Set(view.people.map((p) => `${p.kind}:${p.ids[0]}`));
    if (fresh && pairing) {
      setPairing(false);
      toast.success(tc.paired(fresh.name));
    }
  }, [view.people, pairing]);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">{tc.people}</h2>
        {view.people.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void pair()}>
            {tc.pair}
          </Button>
        )}
      </div>
      {view.people.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-muted/50 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{tc.noPeople}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void pair()}>
            {tc.pair}
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {view.people.map((p) => (
            <li key={`${p.kind}:${p.ids[0]}`} className="flex items-center gap-4 rounded-xl bg-muted/50 p-4">
              <LogoTile logo={brand(p.kind)} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h3 className="truncate text-sm font-medium">{p.name}</h3>
                <p className="text-xs text-muted-foreground">{tc[p.kind]}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => setRemoving(p)}>
                {tc.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <PairDialog view={view} open={pairing} onOpenChange={setPairing} onNewCode={() => void pair()} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? tc.removeTitle(removing.name) : ""}
        desc={tc.removeText}
        confirmText={tc.remove}
        destructive
        handleConfirm={async () => {
          if (!removing) return;
          await request("DELETE", `/api/channels/people/${removing.kind}/${encodeURIComponent(removing.ids[0] ?? "")}`);
          setRemoving(null);
          onChange();
        }}
      />
    </section>
  );
}

export function ChannelsTab() {
  const [view, setView] = useState<ChannelsView | null>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef(true);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as ChannelsView;
      if (live.current) {
        setView(next);
        setFailed(false);
      }
    } catch {
      if (live.current) setFailed(true);
    }
  }, []);
  // A QR changes every few seconds and a connection can drop at any time, so this page keeps looking while it is open.
  useEffect(() => {
    live.current = true;
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, [load]);
  if (!view)
    return failed ? (
      <p role="alert" className="rounded-xl border border-destructive/30 px-4 py-3 text-sm text-destructive">
        {t.config.loadFailed}
      </p>
    ) : (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-busy="true">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  const of = (kind: ChannelKind) => view.channels.find((c) => c.kind === kind) as ChannelStatus;
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-medium">{tc.apps}</h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TelegramCard channel={of("telegram")} onChange={() => void load()} />
          <WhatsAppCard channel={of("whatsapp")} onChange={() => void load()} />
        </ul>
      </section>
      <People view={view} onChange={() => void load()} />
    </div>
  );
}
