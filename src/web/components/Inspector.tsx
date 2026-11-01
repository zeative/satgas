import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { sinks } from "../../shared/graph";
import type { LogLine, NodeState, Run } from "../../shared/types";
import { fmtClock, fmtDateTime, fmtElapsed, t } from "../i18n";
import { logsOf, now, selected } from "../state";
import { Icon, StatusGlyph } from "./Icon";
import { Markdown } from "./Markdown";
import { Tabs } from "./Tabs";

const SHOWN_LOGS = 250;

export function Inspector({ run, codes }: { run: Run; codes: Map<string, string> }) {
  const node = selected.value ? run.nodes.find((n) => n.id === selected.value) : undefined;
  return (
    <aside class="inspector" aria-label={node ? node.title : t.mission}>
      {node ? (
        <NodeInspector key={node.id} run={run} node={node} codes={codes} />
      ) : (
        <MissionInspector key={run.id} run={run} codes={codes} />
      )}
    </aside>
  );
}

type MissionTab = "overview" | "report" | "planner";

function MissionInspector({ run, codes }: { run: Run; codes: Map<string, string> }) {
  // Follow the mission's natural focus (planner → overview → report) until the user picks a tab themselves.
  const picked = useSignal<MissionTab | null>(null);
  const natural: MissionTab = run.status === "done" ? "report" : run.status === "planning" || !run.nodes.length ? "planner" : "overview";
  const tab = picked.value ?? natural;

  const ordered = [...run.nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  const done = run.nodes.filter((n) => n.status === "done").length;
  const finals = sinks(run.nodes).filter((n): n is NodeState & { output: string } => !!n.output);
  const firstFailed = ordered.find((n) => n.status === "failed");
  const plannerLogs = logsOf("planner").value;

  return (
    <>
      <div class="inspector-head">
        {run.nodes.length > 0 && (
          <div>
            <div class="progress" aria-hidden="true">
              {ordered.map((n) => (
                <span key={n.id} class={`progress-seg s-${n.status}`} />
              ))}
            </div>
            <p class="progress-label num">{t.progress(done, run.nodes.length)}</p>
          </div>
        )}
        {run.status === "failed" && run.error && (
          <div class="notice notice-hazard" role="alert">
            <strong>{t.failedTitle}</strong>
            {run.error}
            {firstFailed && (
              <div>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  onClick={() => {
                    selected.value = firstFailed.id;
                  }}
                >
                  {t.openFailed}
                </button>
              </div>
            )}
          </div>
        )}
        {run.status === "cancelled" && <div class="notice notice-quiet">{t.cancelledRun}</div>}
      </div>

      <Tabs
        idPrefix="mission"
        label={t.mission}
        value={tab}
        onChange={(id) => {
          picked.value = id;
        }}
        tabs={[
          { id: "overview", label: t.overview },
          { id: "report", label: t.report },
          { id: "planner", label: t.planner, count: plannerLogs.length },
        ]}
      >
        {tab === "overview" && (
          <>
            {run.nodes.length > 0 && (
              <section class="inspector-section">
                <span class="overline">{t.tasks}</span>
                <ul class="task-list">
                  {ordered.map((n) => (
                    <li key={n.id}>
                      <TaskRow node={n} code={codes.get(n.id) ?? ""} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section class="inspector-section">
              <span class="overline">{t.mission}</span>
              <p class="brief-text">{run.prompt}</p>
            </section>
            <section class="inspector-section">
              <dl class="meta-grid">
                <dt>{t.folder}</dt>
                <dd class="mono">{run.cwd}</dd>
                <dt>{t.started}</dt>
                <dd>{fmtDateTime(run.createdAt)}</dd>
              </dl>
            </section>
          </>
        )}
        {tab === "report" &&
          (run.status !== "done" ? (
            <p class="empty">{t.reportPending}</p>
          ) : finals.length ? (
            finals.map((n) => (
              <article key={n.id} class="report">
                {finals.length > 1 && <span class="overline report-from">{`${codes.get(n.id) ?? ""} · ${n.title}`}</span>}
                <Markdown text={n.output} />
              </article>
            ))
          ) : (
            <p class="empty">{t.noFinalReport}</p>
          ))}
        {tab === "planner" && <LogView lines={plannerLogs} />}
      </Tabs>
    </>
  );
}

type NodeTab = "activity" | "report" | "brief";

function NodeInspector({ run, node, codes }: { run: Run; node: NodeState; codes: Map<string, string> }) {
  const picked = useSignal<NodeTab | null>(null);
  const tab = picked.value ?? (node.status === "done" ? "report" : "activity");
  const lines = logsOf(node.id).value;
  const live = node.status === "running";
  const elapsed = node.startedAt ? fmtElapsed((live ? now.value : (node.endedAt ?? node.startedAt)) - node.startedAt) : null;
  const deps = node.dependsOn.map((d) => run.nodes.find((n) => n.id === d)).filter((n): n is NodeState => !!n);
  const blocker = node.blockedBy ? run.nodes.find((n) => n.id === node.blockedBy) : undefined;
  const unmet = deps.filter((d) => d.status !== "done");

  const back = () => {
    const id = node.id;
    selected.value = null;
    // Return focus to the card that opened this detail.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-node="${id}"]`)?.focus());
  };

  // Escape closes the detail from anywhere except form fields and open dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as Element).closest("input, textarea, dialog")) return;
      back();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <div class="inspector-head">
        <button type="button" class="btn btn-ghost btn-sm inspector-back" onClick={back}>
          <Icon name="back" size={14} />
          {t.backToMission}
        </button>
        <div>
          <p class="inspector-kicker">
            <span class="node-code">{codes.get(node.id)}</span>
            <span aria-hidden="true">·</span>
            <span>{`${node.role} · ${t.agent[node.agent]}`}</span>
          </p>
          <h2 class="inspector-title">{node.title}</h2>
        </div>
        <p class="inspector-state">
          <StatusGlyph status={node.status} />
          {t.node[node.status]}
          {elapsed && <span class="num">{elapsed}</span>}
        </p>
        {node.status === "failed" && node.error && (
          <div class="notice notice-hazard" role="alert">
            <strong>{t.taskFailed}</strong>
            {node.error}
          </div>
        )}
        {node.status === "skipped" && <div class="notice notice-quiet">{t.skippedBecause(blocker?.title ?? node.blockedBy ?? "?")}</div>}
        {node.status === "cancelled" && <div class="notice notice-quiet">{t.cancelledNote}</div>}
        {node.status === "pending" && run.status === "running" && (
          <div class="notice notice-quiet">{unmet.length ? t.waitingFor(unmet.map((d) => `"${d.title}"`).join(", ")) : t.waitingSlot}</div>
        )}
      </div>

      <Tabs
        idPrefix="node"
        label={node.title}
        value={tab}
        onChange={(id) => {
          picked.value = id;
        }}
        tabs={[
          { id: "activity", label: t.activity, count: lines.length },
          { id: "report", label: t.report },
          { id: "brief", label: t.brief },
        ]}
      >
        {tab === "activity" && <LogView lines={lines} />}
        {tab === "report" &&
          (node.status !== "done" ? (
            <p class="empty">{t.nodeReportPending}</p>
          ) : node.output ? (
            <Markdown text={node.output} />
          ) : (
            <p class="empty">{t.noReport}</p>
          ))}
        {tab === "brief" && (
          <>
            <section class="inspector-section">
              <span class="overline">{t.instructions}</span>
              <p class="brief-text">{node.task}</p>
            </section>
            <section class="inspector-section">
              <span class="overline">{t.dependsOn}</span>
              {deps.length ? (
                <ul class="task-list">
                  {deps.map((d) => (
                    <li key={d.id}>
                      <TaskRow node={d} code={codes.get(d.id) ?? ""} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="brief-text">{t.noDependencies}</p>
              )}
            </section>
          </>
        )}
      </Tabs>
    </>
  );
}

function TaskRow({ node, code }: { node: NodeState; code: string }) {
  return (
    <button
      type="button"
      class={`task-row s-${node.status}`}
      onClick={() => {
        selected.value = node.id;
      }}
    >
      <StatusGlyph status={node.status} />
      <span class="node-code">{code}</span>
      <span class="task-title">{node.title}</span>
      <span class="task-state">{t.node[node.status]}</span>
    </button>
  );
}

function LogView({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  // Follow new lines only while the reader sits at the bottom of the scroll area.
  useEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>(".inspector-scroll");
    if (!scroller) return;
    const onScroll = () => {
      stick.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 32;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>(".inspector-scroll");
    if (scroller && stick.current) scroller.scrollTop = scroller.scrollHeight;
  }, [lines]);

  if (!lines.length) return <p class="empty">{t.noActivity}</p>;
  const offset = Math.max(0, lines.length - SHOWN_LOGS);
  const shown = offset ? lines.slice(offset) : lines;
  return (
    <ol ref={ref} class="log">
      {shown.map((l, i) => (
        <li key={`${l.t}-${offset + i}`} class={`log-line log-${l.kind}`}>
          <time class="num" dateTime={new Date(l.t).toISOString()}>
            {fmtClock(l.t)}
          </time>
          <span>{l.text}</span>
        </li>
      ))}
    </ol>
  );
}
