import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { openExternal } from "@/components/outbound-link";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { update } from "@/features/integrations/update";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, t } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { signOut } from "@/stores/auth";
import { request, useRuns } from "@/stores/runs";
import { loadSettings, useSettings } from "@/stores/settings";
import type { SecurityInfo } from "../../../shared/housekeeping";
import { CODEX_SANDBOXES, type CodexSandbox, PERMISSION_MODES, type PermissionMode } from "../../../shared/settings";
import { LoadFailed, Row, Section, useJson } from "./parts";

const tc = t.config;
const ti = t.integrations;
type Saved = SecurityInfo["secrets"][number];

function AccessChoice({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// How far agents may go. In a container the sandbox setting has nothing to act on, so it stays out of sight there.
function AgentAccess() {
  const settings = useSettings((s) => s.settings);
  const container = useRuns((s) => s.config.container === true);
  useEffect(() => {
    if (!useSettings.getState().settings) void loadSettings();
  }, []);
  if (!settings) return <Skeleton className="h-32 rounded-xl" />;
  const { claude, codex } = settings.agents;
  const risky = claude.permissionMode === "bypassPermissions" || (!container && codex.sandbox === "danger-full-access");
  return (
    <Section title={tc.agentAccess}>
      <div className="flex flex-col gap-2">
        <Row label={ti.permissions} hint={ti.permissionsHint} htmlFor="agent-permissions">
          <AccessChoice
            id="agent-permissions"
            value={claude.permissionMode}
            options={PERMISSION_MODES.map((m) => [m, ti.permission[m]] as const)}
            onChange={(v) =>
              void update({ ...settings, agents: { ...settings.agents, claude: { ...claude, permissionMode: v as PermissionMode } } })
            }
          />
        </Row>
        {!container && (
          <Row label={ti.sandbox} hint={ti.sandboxHint} htmlFor="agent-sandbox">
            <AccessChoice
              id="agent-sandbox"
              value={codex.sandbox}
              options={CODEX_SANDBOXES.map((m) => [m, ti.sandboxMode[m]] as const)}
              onChange={(v) =>
                void update({ ...settings, agents: { ...settings.agents, codex: { ...codex, sandbox: v as CodexSandbox } } })
              }
            />
          </Row>
        )}
        {risky && (
          <p role="status" className="flex items-center gap-1.5 px-1 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            {ti.bypassHint}
          </p>
        )}
      </div>
    </Section>
  );
}

export function SecurityView() {
  const cloud = useRuns((s) => s.config.cloud ?? null);
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
      <AgentAccess />
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
            {cloud ? (
              <Row label={tc.account} hint={tc.accountHint}>
                <Button type="button" variant="outline" size="sm" onClick={() => openExternal(cloud.account)}>
                  {tc.openAccount}
                </Button>
              </Row>
            ) : (
              <Row label={tc.token} hint={data.tokenFromEnv ? <RichText text={tc.tokenEnv} /> : tc.tokenHint}>
                <Button type="button" variant="outline" size="sm" disabled={data.tokenFromEnv} onClick={() => setRotating(true)}>
                  {tc.rotate}
                </Button>
              </Row>
            )}
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
              void copyText(token ?? "").then(() => setCopied(true));
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
