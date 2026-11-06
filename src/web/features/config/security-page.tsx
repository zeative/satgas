import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, t } from "@/i18n";
import { signOut } from "@/stores/auth";
import { request } from "@/stores/runs";
import type { SecurityInfo } from "../../../shared/housekeeping";
import { LoadFailed, Row, Section, useJson } from "./parts";

const tc = t.config;
type Saved = SecurityInfo["secrets"][number];

export function SecurityView() {
  const { data, failed, load } = useJson<SecurityInfo>("/api/security");
  const now = useNow(true, 60_000);
  const [forget, setForget] = useState<Saved | null>(null);
  const [rotating, setRotating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const rotate = async () => {
    const res = await fetch("/api/auth/rotate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok || !body.token) throw new Error(body.error ?? tc.loadFailed);
    setRotating(false);
    setFresh(body.token);
  };
  return (
    <>
      {failed && !data && <LoadFailed onRetry={() => void load()} />}
      {!data && !failed && <Skeleton className="h-64 rounded-xl" />}
      {data && (
        <>
          <Section title={tc.secrets} hint={tc.secretsHint}>
            {data.secrets.length === 0 ? (
              <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{tc.noSecrets}</p>
            ) : (
              <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
                {data.secrets.map((s) => (
                  <li key={s.id} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                    <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px]">{s.label}</span>
                      <span className="truncate text-xs text-muted-foreground" title={s.board}>
                        {s.board}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {tc.secretLeft(fmtElapsed(Math.max(0, s.until - now)))}
                    </span>
                    <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setForget(s)}>
                      {tc.forget}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={tc.signIn}>
            <Row label={tc.token} hint={data.tokenFromEnv ? <RichText text={tc.tokenEnv} /> : tc.tokenHint}>
              <Button type="button" variant="outline" size="sm" disabled={data.tokenFromEnv} onClick={() => setRotating(true)}>
                {tc.rotate}
              </Button>
            </Row>
            <Row label={tc.publicUrl} hint={data.publicUrl ? <code className="font-mono">{data.publicUrl}</code> : tc.localOnly} />
            <Row label={tc.signOut} hint={tc.signOutHint}>
              <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
                {t.auth.signOut}
              </Button>
            </Row>
          </Section>
        </>
      )}

      <ConfirmDialog
        open={forget !== null}
        onOpenChange={(open) => !open && setForget(null)}
        title={forget ? tc.forgetTitle(forget.label) : ""}
        desc={tc.forgetText}
        confirmText={tc.forget}
        destructive
        handleConfirm={async () => {
          if (!forget) return;
          await request("DELETE", `/api/runs/${forget.runId}/secrets/${forget.id}`);
          setForget(null);
          toast.success(tc.forgotten);
          await load();
        }}
      />
      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title={tc.rotateTitle}
        desc={tc.rotateText}
        confirmText={tc.rotateConfirm}
        destructive
        handleConfirm={rotate}
      />
      <NewToken token={fresh} onClose={() => setFresh(null)} />
    </>
  );
}

function NewToken({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={token !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tc.newToken}</DialogTitle>
          <DialogDescription>{tc.newTokenHint}</DialogDescription>
        </DialogHeader>
        <code className="rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs break-all select-all">{token}</code>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(token ?? "").then(() => setCopied(true));
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? tc.copied : tc.copy}
          </Button>
          <Button type="button" onClick={onClose}>
            {tc.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
