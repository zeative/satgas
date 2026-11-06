import { expect, test } from "bun:test";
import { fillTemplate, maskSchedule, matches, nextRun, type Schedule, SECRET_MASK, sanitizeSchedule } from "../../src/shared/schedules";

const at = (s: string) => new Date(s).getTime();

test("an interval runs its length after the last run, never in the past", () => {
  const s = { enabled: true, createdAt: at("2026-11-04T08:00:00"), trigger: { type: "interval", everyMinutes: 60 } as const };
  expect(nextRun(s, at("2026-11-04T08:10:00"))).toBe(at("2026-11-04T09:00:00"));
  expect(nextRun({ ...s, lastRunAt: at("2026-11-04T09:00:00") }, at("2026-11-04T09:30:00"))).toBe(at("2026-11-04T10:00:00"));
  expect(nextRun({ ...s, enabled: false })).toBeNull();
});

test("a daily time runs at the next matching local time and weekday", () => {
  const s = { enabled: true, createdAt: 0, trigger: { type: "daily", time: "09:00", weekdays: [] as number[] } as const };
  expect(nextRun(s, at("2026-11-04T08:00:00"))).toBe(at("2026-11-04T09:00:00"));
  expect(nextRun(s, at("2026-11-04T09:30:00"))).toBe(at("2026-11-05T09:00:00"));
  // 2026-11-04 is a Wednesday; Monday only means next Monday.
  expect(nextRun({ ...s, trigger: { ...s.trigger, weekdays: [1] } }, at("2026-11-04T08:00:00"))).toBe(at("2026-11-09T09:00:00"));
  // Just ran: not again the same minute.
  expect(nextRun({ ...s, lastRunAt: at("2026-11-04T09:00:00") }, at("2026-11-04T09:00:10"))).toBe(at("2026-11-05T09:00:00"));
});

test("filters read headers and body paths, into arrays too", () => {
  const event = { headers: { "x-github-event": "issues" }, body: { action: "opened", issue: { number: 4, labels: [{ name: "bug" }] } } };
  expect(matches([{ path: "headers.X-GitHub-Event", op: "equals", value: "issues" }], event)).toBe(true);
  expect(matches([{ path: "body.action", op: "in", value: ["opened", "reopened"] }], event)).toBe(true);
  expect(matches([{ path: "body.issue.labels[].name", op: "equals", value: "bug" }], event)).toBe(true);
  expect(matches([{ path: "body.issue.labels[].name", op: "notEquals", value: "bug" }], event)).toBe(false);
  expect(matches([{ path: "body.pull_request", op: "exists" }], event)).toBe(false);
  expect(matches([{ path: "body.action", op: "startsWith", value: "open" }], event)).toBe(true);
  expect(fillTemplate("{{headers.x-github-event}}:{{body.issue.number}}", event)).toBe("issues:4");
});

test("a schedule from the page is checked; editing keeps its webhook token and a masked secret", () => {
  expect(sanitizeSchedule({ title: "", prompt: "x", trigger: { type: "interval", everyMinutes: 60 } })).toBe("Give the schedule a name.");
  expect(sanitizeSchedule({ title: "a", prompt: "x", trigger: { type: "interval", everyMinutes: 1 } })).toContain("every 5 minutes");
  expect(sanitizeSchedule({ title: "a", prompt: "x", trigger: { type: "daily", time: "25:00" } })).toContain("09:00");
  expect(
    sanitizeSchedule({ title: "a", prompt: "x", trigger: { type: "webhook", filters: [{ path: "action", op: "equals" }] } }),
  ).toContain("headers. or body.");
  const made = sanitizeSchedule({
    title: "Triage",
    prompt: "Triage the issue",
    trigger: {
      type: "webhook",
      filters: [],
      signature: { header: "X-Hub-Signature-256", encoding: "hex", prefix: "sha256=", secret: "s3" },
    },
  }) as Schedule;
  expect(made.trigger.type === "webhook" && made.trigger.token.length).toBe(32);
  const shown = maskSchedule(made);
  expect(JSON.stringify(shown)).not.toContain("s3");
  const edited = sanitizeSchedule({ ...shown, title: "Triage 2" }, made) as Schedule;
  expect(edited.trigger).toEqual(made.trigger);
  expect(edited.title).toBe("Triage 2");
  expect(edited.id).toBe(made.id);
  expect(SECRET_MASK).toBe("••••");
});
