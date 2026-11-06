import { Check, Clock, Copy, Cpu, Download, Folder, Globe, Layers, Link2, type LucideIcon, Terminal } from "lucide-react";
import { useState } from "react";
import { ClaudeMark, CodexMark, GitHubMark } from "@/components/brand-marks";
import { LogoMark } from "@/components/logo";
import { OutboundLink } from "@/components/outbound-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtElapsed, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { AboutInfo } from "../../../shared/housekeeping";
import { TOOL_CATALOG } from "../../../shared/tools";
import { ConfigPage, LoadFailed, useJson } from "./parts";
import { UpdateStatus } from "./update-dialog";

const tc = t.config;
type Fact = { label: string; mark: React.ReactNode; value: React.ReactNode };

const icon = (Icon: LucideIcon) => <Icon className="size-4 text-muted-foreground" aria-hidden="true" />;
const AGENT_MARK: Record<string, React.ReactNode> = {
  claude: <ClaudeMark className="size-4" />,
  codex: <CodexMark className="size-4" />,
};
// Each program's own logo, from the tool it powers; one the catalog does not know gets a plain terminal. Some logos are
// dark ink on nothing, so on the dark theme they sit on a small white backing or they would vanish.
const programMark = (name: string) => {
  const logo = TOOL_CATALOG.find((d) => d.needs === name)?.logo;
  return logo ? <img src={logo.src} alt="" className="size-4 rounded-[4px] dark:bg-white dark:p-px" /> : icon(Terminal);
};

// The dot says it at a glance and the words say it for anyone who cannot see the colour.
function Installed({ version }: { version: string | null | undefined }) {
  return (
    <span className={cn("inline-flex items-center gap-2", !version && "text-muted-foreground")}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", version ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      {version ?? tc.missing}
    </span>
  );
}

function Facts({ title, rows }: { title: string; rows: Fact[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-medium">{title}</h2>
      <dl className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {rows.map((r) => (
          <div key={r.label} className="flex min-h-9 items-center justify-between gap-6 px-3 py-1.5">
            <dt className="flex shrink-0 items-center gap-2.5 text-[13px] text-muted-foreground">
              <span className="flex size-4 shrink-0 items-center justify-center">{r.mark}</span>
              {r.label}
            </dt>
            <dd className="min-w-0 truncate text-end font-mono text-xs tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function AboutPage() {
  const { data, failed, load } = useJson<AboutInfo>("/api/about");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => setCopied(true));
  };
  return (
    <ConfigPage
      title={tc.about}
      actions={
        data && (
          <Button type="button" variant="outline" size="sm" title={tc.diagnosticsHint} onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? tc.copied : tc.diagnostics}
          </Button>
        )
      }
    >
      {failed && !data && <LoadFailed onRetry={() => void load()} />}
      {!data && !failed && <Skeleton className="h-96 rounded-xl" />}
      {data && (
        <>
          <Facts
            title="Satgas"
            rows={[
              { label: tc.version, mark: <LogoMark className="size-4 text-foreground" />, value: data.version },
              { label: t.update.label, mark: icon(Download), value: <UpdateStatus /> },
              { label: tc.uptime, mark: icon(Clock), value: fmtElapsed(data.uptimeSec * 1000) },
              { label: tc.boards, mark: icon(Layers), value: tc.boardsLive(data.boards, data.live) },
              {
                label: tc.source,
                mark: <GitHubMark className="size-4 text-foreground" />,
                value: (
                  <OutboundLink href={data.repo} className="underline-offset-4 hover:underline">
                    {data.repo.replace("https://github.com/", "")}
                  </OutboundLink>
                ),
              },
            ]}
          />
          <Facts
            title={tc.agents}
            rows={Object.entries(data.agents ?? {}).map(([name, v]) => ({
              label: tc.agentName[name] ?? name,
              mark: AGENT_MARK[name] ?? icon(Terminal),
              value: <Installed version={v} />,
            }))}
          />
          <Facts
            title={tc.programs}
            rows={Object.entries(data.programs).map(([name, v]) => ({
              label: name,
              mark: programMark(name),
              value: <Installed version={v} />,
            }))}
          />
          <Facts
            title={tc.runtime}
            rows={[
              { label: "Bun", mark: <img src="/brands/bun.svg" alt="" className="size-4" />, value: data.bun },
              { label: tc.platform, mark: icon(Cpu), value: data.platform },
              { label: tc.dataDir, mark: icon(Folder), value: data.dataDir },
              { label: tc.address, mark: icon(Globe), value: `${data.host}:${data.port}` },
              { label: tc.publicUrl, mark: icon(Link2), value: data.publicUrl ?? tc.localOnly },
            ]}
          />
        </>
      )}
    </ConfigPage>
  );
}
