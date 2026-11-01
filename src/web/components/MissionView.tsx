import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { taskCodes } from "../../shared/graph";
import type { Run } from "../../shared/types";
import { cancelMission, copyReport, finalReport, isLiveRun, requestDelete, runAgain } from "../actions";
import { fmtElapsed, t } from "../i18n";
import { now, run, runs, selected } from "../state";
import { Canvas, Plotting } from "./Canvas";
import { StatusGlyph } from "./Icon";
import { Inspector } from "./Inspector";
import { Menu } from "./Menu";

export function MissionView({ id }: { id: string }) {
  const r = run.value;

  if (!r) {
    const known = runs.value?.some((x) => x.id === id);
    if (runs.value && !known) {
      return (
        <div class="center-state">
          <h1>{t.notFoundTitle}</h1>
          <p>{t.notFoundLead}</p>
          <a class="btn btn-primary" href="#/new">
            {t.newMission}
          </a>
        </div>
      );
    }
    return (
      <div class="mission" aria-busy="true">
        <header class="mission-head">
          <span class="sk" style={{ width: "260px", height: "16px" }} />
        </header>
        <Plotting label={t.loadingMission} elapsed="" />
        <aside class="inspector" />
      </div>
    );
  }

  const codes = taskCodes(r.nodes);
  return (
    <div class="mission">
      <MissionHead run={r} />
      {r.nodes.length ? (
        <Canvas
          nodes={r.nodes}
          codes={codes}
          graphKey={r.id}
          selectedId={selected.value}
          onSelect={(nid) => {
            selected.value = selected.peek() === nid ? null : nid;
          }}
        />
      ) : (
        <Plotting
          label={r.status === "planning" ? t.plotting : t.run[r.status]}
          elapsed={r.status === "planning" ? fmtElapsed(now.value - r.createdAt) : ""}
        />
      )}
      <Inspector run={r} codes={codes} />
    </div>
  );
}

function MissionHead({ run: r }: { run: Run }) {
  const live = isLiveRun(r);
  const cancelling = useSignal(false);
  useEffect(() => {
    if (!live) cancelling.value = false;
  }, [live]);

  const cancel = async () => {
    cancelling.value = true;
    await cancelMission(r);
    // The status flip arrives over the socket; only reset here if the request itself failed.
    if (isLiveRun(run.peek() ?? r)) cancelling.value = false;
  };

  const hasReport = !!finalReport(r);
  const elapsed = fmtElapsed((live ? now.value : (r.endedAt ?? r.createdAt)) - r.createdAt);

  return (
    <header class="mission-head">
      <div class="mission-heading">
        <h1 class="mission-name">{r.title ?? r.prompt}</h1>
        {r.summary && <p class="mission-summary">{r.summary}</p>}
      </div>
      <div class="mission-actions">
        <span class={`status-chip is-${r.status}`}>
          <StatusGlyph status={r.status} />
          {t.run[r.status]}
          <span class="num">{elapsed}</span>
        </span>
        {live && (
          <button type="button" class="btn btn-secondary" onClick={cancel} disabled={cancelling.value}>
            {cancelling.value ? t.cancelling : t.cancel}
          </button>
        )}
        <Menu
          label={t.moreActions}
          items={[
            { id: "rerun", label: t.runAgain, icon: "rerun", onSelect: () => runAgain(r) },
            {
              id: "copy",
              label: t.copyReport,
              icon: "copy",
              onSelect: () => copyReport(r),
              disabledReason: hasReport ? undefined : t.reportPending,
            },
            {
              id: "delete",
              label: t.deleteMission,
              icon: "trash",
              danger: true,
              separatorBefore: true,
              onSelect: () => requestDelete(r),
              disabledReason: live ? t.deleteLive : undefined,
            },
          ]}
        />
      </div>
    </header>
  );
}
