import type { RunSummary } from "../../shared/types";
import { fmtAgo, t } from "../i18n";
import { currentId, loadRuns, minute, runs, runsError } from "../state";
import { toggleSidebar } from "../ui";
import { Icon, StatusGlyph } from "./Icon";

type Group = { label: string; items: RunSummary[] };

function groupByDay(list: RunSummary[], now: number): Group[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const startOfYesterday = startOfToday - 86_400_000;
  const groups: Group[] = [
    { label: t.today, items: [] },
    { label: t.yesterday, items: [] },
    { label: t.earlier, items: [] },
  ];
  for (const r of list) {
    const bucket = r.createdAt >= startOfToday ? 0 : r.createdAt >= startOfYesterday ? 1 : 2;
    groups[bucket]?.items.push(r);
  }
  return groups.filter((g) => g.items.length);
}

export function Sidebar() {
  const list = runs.value;
  const active = currentId.value;
  minute.value; // re-render periodically so relative times stay fresh
  const now = Date.now();
  return (
    <>
      <nav id="sidebar" class="sidebar" aria-label={t.missions}>
        <div class="sidebar-head">
          <a class="btn btn-ghost new-mission" href="#/new" aria-current={active ? undefined : "page"}>
            <Icon name="plus" />
            {t.newMission}
            <kbd>N</kbd>
          </a>
        </div>
        <div class="sidebar-scroll">
          {runsError.value && !list ? (
            <div class="sidebar-note">
              <p>{runsError.value}</p>
              <button type="button" class="btn btn-ghost btn-sm" onClick={loadRuns}>
                {t.retry}
              </button>
            </div>
          ) : !list ? (
            <div class="mission-group" aria-busy="true">
              <span class="overline">{t.missions}</span>
              {[68, 52, 60].map((w) => (
                <div key={w} class="mission-item" aria-hidden="true">
                  <span class="sk sk-dot" />
                  <span>
                    <span class="sk sk-title" style={{ width: `${w}%` }} />
                    <span class="sk sk-meta" />
                  </span>
                </div>
              ))}
            </div>
          ) : !list.length ? (
            <p class="sidebar-note">{t.missionsEmpty}</p>
          ) : (
            groupByDay(list, now).map((group) => (
              <section key={group.label} class="mission-group" aria-label={group.label}>
                <span class="overline">{group.label}</span>
                <ul class="mission-list">
                  {group.items.map((r) => (
                    <li key={r.id}>
                      <a href={`#/run/${r.id}`} class="mission-item" aria-current={r.id === active ? "page" : undefined}>
                        <StatusGlyph status={r.status} />
                        <span class="mission-body">
                          <span class="mission-title">{r.title ?? r.prompt}</span>
                          <span class="mission-meta">
                            <span class="sr-only">{t.run[r.status]} · </span>
                            {fmtAgo(r.createdAt, now)}
                            {r.nodeCount > 0 && ` · ${r.nodeCount}`}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </nav>
      {/* Pointer-only dismissal for the narrow-screen drawer; keyboard users close it with the toggle or Escape. */}
      <div class="scrim" aria-hidden="true" onClick={() => toggleSidebar(false)} />
    </>
  );
}
