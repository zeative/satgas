import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Gauge, Info, RefreshCw, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { ClaudeMark, CodexMark } from "@/components/brand-marks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, t } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  type LimitsReport,
  type LimitWindow,
  UNKNOWN_MODEL,
  USAGE_VIEWS,
  type UsageBucket,
  type UsageRange,
  type UsageReport,
  type UsageRow,
  type UsageView,
} from "../../../shared/usage";
import { MiniFace } from "../team/face";
import { ConfigPage, fmtTokens, LoadFailed, Section, ShareBar, useJson } from "./parts";
import { StorageView } from "./storage-page";
import { niceTop, smoothLine } from "./usage-chart";

const tc = t.config;
type View = "cost" | UsageView;
const RANGES: [UsageRange, string][] = [
  ["24h", tc.past24h],
  ["7", tc.range(7)],
  ["30", tc.range(30)],
  ["90", tc.range(90)],
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtCost = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : money.format(n));
const fmtShare = (part: number, whole: number) => {
  if (!whole || !part) return "0%";
  const pct = (part / whole) * 100;
  return pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`;
};
const mark = (agent?: string) =>
  agent === "codex" ? <CodexMark className="size-4 shrink-0" /> : <ClaudeMark className="size-4 shrink-0" />;

export function UsagePage() {
  const search = useSearch({ from: "/_app/config/usage" });
  const navigate = useNavigate({ from: "/config/usage" });
  // The router hands on query values it did not validate, so an unknown one still arrives here.
  const view: View = USAGE_VIEWS.find((v) => v === search.view) ?? "cost";
  const setView = (next: View) => void navigate({ search: next === "cost" ? {} : { view: next }, replace: true });
  const [range, setRange] = useState<UsageRange>("30");
  const [measure, setMeasure] = useState(0);
  const url = `/api/usage?range=${range}&tz=${new Date().getTimezoneOffset()}`;
  const usage = useJson<UsageReport>(url);
  const limits = useJson<LimitsReport>("/api/usage/limits");
  const refresh = () => {
    if (view === "storage") setMeasure((n) => n + 1);
    else void (view === "limits" ? limits.load() : usage.load());
  };
  const actions = (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      {(view === "cost" || view === "tokens") && (
        <Tabs value={range} onValueChange={(v) => setRange(v as UsageRange)}>
          <TabsList>
            {RANGES.map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          <TabsTrigger value="cost">{tc.cost}</TabsTrigger>
          <TabsTrigger value="tokens">{tc.tokens}</TabsTrigger>
          <TabsTrigger value="limits">{tc.limits}</TabsTrigger>
          <TabsTrigger value="storage">{tc.storage}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={tc.refresh2} title={tc.refresh2} onClick={refresh}>
        <RefreshCw />
      </Button>
    </div>
  );
  const { data, failed } = usage;
  return (
    <ConfigPage title={tc.usage} actions={actions}>
      {view === "storage" ? (
        <StorageView refreshTick={measure} />
      ) : view === "limits" ? (
        <Limits data={limits.data} failed={limits.failed} onRetry={() => void limits.load()} />
      ) : (
        <>
          {failed && !data && <LoadFailed onRetry={() => void usage.load()} />}
          {!data && !failed && <Skeleton className="h-96 rounded-xl" />}
          {data && (data.tokens ? <Report data={data} view={view} /> : <Empty unreported={data.unreported} />)}
        </>
      )}
    </ConfigPage>
  );
}

function Empty({ unreported }: { unreported: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed py-16 text-center">
      <p className="text-sm font-medium">{tc.noUsage}</p>
      <p className="text-xs text-muted-foreground">{unreported ? tc.unreported(unreported) : tc.noUsageHint}</p>
    </div>
  );
}

function Report({ data, view }: { data: UsageReport; view: View }) {
  const cost = view === "cost";
  return (
    <>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <p className="text-4xl font-medium tracking-tight tabular-nums">
              {cost ? (data.cost ? fmtCost(data.cost) : "—") : fmtTokens(data.tokens)}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {tc.taskCount(data.counted)}
              {cost && (
                <>
                  <span aria-hidden="true">·</span>
                  {data.cost ? tc.apiEstimate : tc.unpriced}
                  <span title={tc.apiEstimateHint} aria-label={tc.apiEstimateHint} role="img">
                    <Info className="size-3" aria-hidden="true" />
                  </span>
                </>
              )}
            </p>
            {data.unreported > 0 && <p className="text-xs text-muted-foreground">{tc.unreported(data.unreported)}</p>}
          </div>
          <ul className="flex flex-col gap-4">
            {data.agents.map((a) => (
              <AgentRow key={a.key} row={a} data={data} cost={cost} />
            ))}
          </ul>
        </div>
        <Section title={data.range === "24h" ? (cost ? tc.hourlyCost : tc.hourlyTokens) : cost ? tc.dailyCost : tc.dailyTokens}>
          <Chart buckets={data.buckets} cost={cost} hourly={data.range === "24h"} />
        </Section>
      </div>

      <Section title={tc.totals}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 md:grid-cols-5">
          {(
            [
              [tc.processed, fmtTokens(data.tokens)],
              [tc.cachedInput, fmtTokens(data.read)],
              [tc.uncachedInput, fmtTokens(data.uncached)],
              [tc.output, fmtTokens(data.output)],
              [tc.cacheSavings, data.savings ? fmtCost(data.savings) : "—"],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <TypeBar data={data} cost={cost} />
      <Breakdown data={data} cost={cost} />
    </>
  );
}

function AgentRow({ row, data, cost }: { row: UsageRow; data: UsageReport; cost: boolean }) {
  const tokensText = fmtTokens(row.tokens);
  const costText = row.cost === null ? tc.unpriced : fmtCost(row.cost);
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 text-[13px]">
        {mark(row.key)}
        <span className="font-medium">{tc.agentName[row.key] ?? row.key}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{tc.taskCount(row.tasks)}</span>
        <span className={cn("ms-auto shrink-0 tabular-nums", cost && row.cost === null && "text-muted-foreground")}>
          {cost ? costText : tokensText}
        </span>
      </div>
      <p className="ps-6 text-xs text-muted-foreground tabular-nums">
        {cost
          ? `${tc.ofCost(fmtShare(row.cost ?? 0, data.cost))} · ${tokensText} ${tc.tokens.toLowerCase()}`
          : `${tc.ofTokens(fmtShare(row.tokens, data.tokens))} · ${costText}`}
      </p>
    </li>
  );
}

const W = 600;
const H = 200;
const bucketLabel = (key: string, hourly: boolean) =>
  new Intl.DateTimeFormat(
    undefined,
    hourly ? { hour: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" },
  ).format(new Date(hourly ? `${key}:00:00Z` : `${key}T00:00:00Z`));

// One series, so no legend. The signal colour is the app's own for work in progress, and this is the screen's one moment.
function Chart({ buckets, cost, hourly }: { buckets: UsageBucket[]; cost: boolean; hourly: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = buckets.map((b) => (cost ? b.cost : b.tokens));
  const top = niceTop(Math.max(...values));
  const fmt = cost ? (n: number) => money.format(n) : fmtTokens;
  const xOf = (i: number) => (buckets.length > 1 ? (i / (buckets.length - 1)) * W : W / 2);
  const line = smoothLine(values.map((v, i) => [xOf(i), H - (v / top) * H]));
  const area = line ? `${line}L${W},${H}L0,${H}Z` : "";
  const empty = !values.some(Boolean);
  const ticks = [buckets[0], buckets[Math.floor(buckets.length / 2)], buckets.at(-1)];
  const active = hover === null ? null : buckets[hover];
  const place = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.round(((e.clientX - box.left) / box.width) * (buckets.length - 1)));
  };
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="relative h-52 ps-14">
        {(empty ? [0] : [1, 0.75, 0.5, 0.25, 0]).map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ top: `${(1 - f) * 100}%` }}>
            <span className="w-12 -translate-y-1/2 text-end font-mono text-[11px] text-muted-foreground tabular-nums">
              {f === 0 ? "0" : fmt(top * f)}
            </span>
            <span className="h-px flex-1 -translate-y-1/2 bg-border" />
          </div>
        ))}
        {empty ? (
          <p className="absolute inset-0 flex items-center justify-center ps-14 text-xs text-muted-foreground">{tc.noCost}</p>
        ) : (
          <div aria-hidden="true" className="relative h-full" onPointerMove={place} onPointerLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              <path d={area} className="fill-signal/15" />
              <path d={line} fill="none" className="stroke-signal" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
            {hover !== null && active && (
              <>
                <span className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${(xOf(hover) / W) * 100}%` }} />
                <span
                  className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal ring-2 ring-background"
                  style={{ left: `${(xOf(hover) / W) * 100}%`, top: `${(1 - (values[hover] as number) / top) * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm"
                  style={
                    hover > buckets.length / 2
                      ? { right: `calc(${100 - (xOf(hover) / W) * 100}% + 8px)` }
                      : { left: `calc(${(xOf(hover) / W) * 100}% + 8px)` }
                  }
                >
                  <span className="text-muted-foreground">
                    {hover === buckets.length - 1 && !hourly ? tc.today : bucketLabel(active.key, hourly)}
                  </span>
                  <span className="font-mono tabular-nums">
                    {cost ? fmtCost(active.cost) : `${active.tokens.toLocaleString()} ${tc.tokens.toLowerCase()}`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-between ps-14 font-mono text-[11px] text-muted-foreground tabular-nums" aria-hidden="true">
        {ticks.map((b) => (
          <span key={b?.key}>{b ? bucketLabel(b.key, hourly) : ""}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{cost ? tc.dailyCost : tc.dailyTokens}</caption>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <td>{b.key}</td>
              <td>{cost ? b.cost : b.tokens}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function TypeBar({ data, cost }: { data: UsageReport; cost: boolean }) {
  const parts = cost
    ? [
        { label: tc.typeOutput, value: data.costs.output },
        { label: tc.typeWrite, value: data.costs.write },
        { label: tc.typeInput, value: data.costs.input },
        { label: tc.typeRead, value: data.costs.read },
      ]
    : [
        { label: tc.typeOutput, value: data.output },
        { label: tc.typeWrite, value: data.write },
        { label: tc.typeInput, value: data.uncached },
        { label: tc.typeRead, value: data.read },
      ];
  if (!parts.some((p) => p.value)) return null;
  return (
    <Section title={cost ? tc.costByType : tc.tokensByType}>
      <div className="max-w-xl">
        <ShareBar parts={parts} format={cost ? fmtCost : fmtTokens} />
      </div>
    </Section>
  );
}

type Split = "model" | "day" | "board" | "person";

function Breakdown({ data, cost }: { data: UsageReport; cost: boolean }) {
  const [split, setSplit] = useState<Split>("model");
  const hourly = data.range === "24h";
  const rows: (UsageRow & { name: React.ReactNode })[] = useMemo(() => {
    if (split === "day")
      return data.buckets
        .filter((b) => b.tokens)
        .reverse()
        .map((b) => ({ key: b.key, label: b.key, tasks: 0, tokens: b.tokens, cost: b.cost || null, name: bucketLabel(b.key, hourly) }));
    if (split === "board")
      return data.boards.map((b) => ({
        ...b,
        name: (
          <Link
            to="/boards/$boardId"
            params={{ boardId: b.key }}
            className="truncate hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {b.label}
          </Link>
        ),
      }));
    if (split === "person")
      return data.people.map((p) => ({
        ...p,
        name: (
          <span className="flex min-w-0 items-center gap-2">
            <MiniFace seed={p.seed ?? p.key} className="size-5" />
            <span className="truncate">{p.label}</span>
          </span>
        ),
      }));
    const byMetric = [...data.models].sort((a, b) => (cost ? (b.cost ?? -1) - (a.cost ?? -1) : b.tokens - a.tokens));
    return byMetric.map((m) => ({
      ...m,
      name: (
        <span className="flex min-w-0 items-center gap-2">
          {mark(m.agent)}
          <span className="truncate">{m.key === UNKNOWN_MODEL ? tc.unknownModel : m.key}</span>
        </span>
      ),
    }));
  }, [split, data, cost, hourly]);
  const metric = (r: UsageRow) => (cost ? (r.cost ?? 0) : r.tokens);
  const whole = cost ? data.cost : data.tokens;
  const top = Math.max(1e-9, ...rows.map(metric));
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">{tc.breakdown}</h2>
        <Tabs value={split} onValueChange={(v) => setSplit(v as Split)}>
          <TabsList>
            <TabsTrigger value="model">{tc.byModel}</TabsTrigger>
            <TabsTrigger value="day">{tc.byDay}</TabsTrigger>
            <TabsTrigger value="board">{tc.byBoard}</TabsTrigger>
            <TabsTrigger value="person">{tc.byPerson}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="w-8 py-2 text-start font-normal">
                #
              </th>
              <th scope="col" className="py-2 text-start font-normal">
                {split === "model" ? tc.byModel : split === "day" ? tc.byDay : split === "board" ? tc.byBoard : tc.byPerson}
              </th>
              <th scope="col" className="w-24 py-2 text-end font-normal">
                {tc.cost}
              </th>
              <th scope="col" className="w-20 py-2 text-end font-normal">
                {tc.share}
              </th>
              <th scope="col" className="w-20 py-2 text-end font-normal">
                {tc.tokens}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-b">
                <td className="py-2.5 align-top text-xs text-muted-foreground">{i + 1}</td>
                <td className="max-w-0 py-2.5 pe-6">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex min-w-0">{r.name}</div>
                    {metric(r) > 0 && (
                      <span
                        aria-hidden="true"
                        className="h-0.5 max-w-xs rounded-full bg-signal/70"
                        style={{ width: `${Math.max(2, (metric(r) / top) * 100)}%` }}
                      />
                    )}
                  </div>
                </td>
                <td className={cn("py-2.5 text-end align-top", r.cost === null && "text-muted-foreground")}>
                  {r.cost === null ? tc.unpriced : fmtCost(r.cost)}
                </td>
                <td className="py-2.5 text-end align-top text-muted-foreground">{fmtShare(metric(r), whole)}</td>
                <td className="py-2.5 text-end align-top text-muted-foreground">{fmtTokens(r.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// A week away reads in days, the way people plan around a limit.
function fmtLeft(ms: number) {
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return hours ? `${hours}h ${Math.floor(ms / 60_000) % 60}m` : `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

function Limits({ data, failed, onRetry }: { data: LimitsReport | null; failed: boolean; onRetry: () => void }) {
  const now = useNow(true, 60_000);
  if (failed && !data) return <LoadFailed onRetry={onRetry} />;
  if (!data) return <Skeleton className="h-48 rounded-xl" />;
  if (!data.windows.length)
    return (
      <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-16 text-center">
        <p className="text-sm font-medium">{tc.limitsNone}</p>
        <p className="max-w-md text-xs text-muted-foreground">{tc.limitsNoneHint}</p>
      </div>
    );
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <ClaudeMark className="size-4" />
        <span className="font-medium">Claude</span>
        {data.at && <span className="text-xs text-muted-foreground">{tc.limitsAsOf(fmtElapsed(now - data.at))}</span>}
        {data.status === "rejected" && <span className="ms-auto text-xs text-destructive">{tc.limitsReached}</span>}
      </div>
      {data.windows.map((w) => (
        <LimitCard key={w.name} window={w} now={now} />
      ))}
    </section>
  );
}

// Solid is what is left and hatched is what is gone. The mark is how much of the window's time is left, so solid reaching
// past it means there is room to spare.
function LimitCard({ window: w, now }: { window: LimitWindow; now: number }) {
  const remaining = Math.max(0, w.resetsAt - now);
  const timeLeft = w.span ? Math.max(0, Math.min(100, (remaining / w.span) * 100)) : null;
  const time = fmtLeft(remaining);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border px-4 py-3">
      <div className="flex w-44 shrink-0 flex-col">
        <p className="text-[13px]">{tc.windowName(w.name)}</p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-2xl font-medium tabular-nums">{w.left}%</span>
          <span className="text-xs text-muted-foreground">{tc.left}</span>
          <Gauge className="size-3 translate-y-0.5 text-muted-foreground" aria-hidden="true" />
        </p>
      </div>
      <div role="img" aria-label={tc.leftOf(w.left, time)} className="relative h-8 min-w-48 flex-1 overflow-hidden rounded-lg">
        <span
          className="absolute inset-y-0 right-0 opacity-30"
          style={{ left: `${w.left}%`, backgroundImage: "repeating-linear-gradient(135deg, var(--signal) 0 1px, transparent 1px 6px)" }}
        />
        <span className="absolute inset-y-0 left-0 rounded-lg bg-signal/30" style={{ width: `${w.left}%` }} />
        {timeLeft !== null && <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${timeLeft}%` }} />}
        <span className="absolute inset-y-1 right-1 flex items-center gap-1 rounded-md bg-background px-1.5 font-mono text-[11px] tabular-nums">
          <RotateCw className="size-3 text-muted-foreground" aria-hidden="true" />
          {time}
        </span>
      </div>
    </div>
  );
}
