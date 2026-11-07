// Applies the setup the lead changes from a person's message, keeps how to undo it, and runs what waits for an Allow.
import { byId, catalogOf } from "../shared/catalog";
import { applyToSettings, cleanSetup, needsApproval, type SetupCommand, type SetupRecord } from "../shared/setup";
import { getSettings, saveSettings } from "./settings";
import { deleteSkill, findOnGithub, installFound, listSkills, setSkillEnabled } from "./skills";
import { appendLog, getRun, patchRun } from "./store";

const newId = () => crypto.randomUUID();

interface Outcome {
  undo: SetupCommand[];
  needsKey?: string;
  note?: string;
}

// One command against the live setup; a string says why it could not apply.
async function run(cmd: SetupCommand): Promise<Outcome | string> {
  if (cmd.op === "skill") {
    const r = await setSkillEnabled(cmd.name, cmd.on);
    if (r === "missing") return `No skill named ${cmd.name} is installed`;
    if (r === "builtin") return `${cmd.name} is built in and always on`;
    return { undo: [{ op: "skill", name: cmd.name, on: !cmd.on }] };
  }
  if (cmd.op === "skill-delete") {
    const r = await deleteSkill(cmd.name);
    return r === "ok" ? { undo: [] } : `Could not remove ${cmd.name}`;
  }
  if (cmd.op === "install-skills") {
    const found = await findOnGithub(cmd.repo);
    if (typeof found === "string") return found;
    const have = new Set((await listSkills()).map((s) => s.name));
    const fresh = found.found.filter((f) => !have.has(f.name) && (!cmd.skills || cmd.skills.includes(f.name))).map((f) => f.name);
    if (!fresh.length) return cmd.skills ? `None of ${cmd.skills.join(", ")} is new in ${cmd.repo}` : `${cmd.repo} has no new skills`;
    const problem = await installFound(found.stage, fresh);
    if (problem) return problem;
    return { undo: fresh.map((name) => ({ op: "skill-delete", name })), note: fresh.join(", ") };
  }
  const applied = applyToSettings(getSettings(), cmd, newId);
  if (typeof applied === "string") return applied;
  if (applied.needsKey) return { undo: [], needsKey: applied.needsKey };
  const saved = await saveSettings(applied.settings);
  return typeof saved === "string" ? saved : { undo: applied.undo };
}

const record = (runId: string, round: number) => getRun(runId)?.setups?.[round];
const save = (runId: string, round: number, rec: SetupRecord) => patchRun(runId, { setups: { ...getRun(runId)?.setups, [round]: rec } });

// The lead's setup for a round: known changes apply now (in order, each against what the last left), the rest wait.
export async function applySetup(runId: string, round: number, raw: unknown): Promise<SetupRecord | null> {
  const { commands, skipped } = cleanSetup(raw);
  if (!commands.length && !skipped.length) return null;
  const rec: SetupRecord = { applied: [], undo: [], pending: [], keys: [], failed: [...skipped] };
  for (const cmd of commands) {
    if (needsApproval(cmd)) {
      rec.pending.push({ cmd, state: "waiting" });
      continue;
    }
    const out = await run(cmd);
    if (typeof out === "string") rec.failed.push(out);
    else if (out.needsKey) rec.keys.push(out.needsKey);
    else {
      rec.applied.push(cmd);
      // Undone newest first, so a later change never comes back over an earlier one.
      rec.undo = [...out.undo, ...rec.undo];
    }
  }
  save(runId, round, rec);
  const parts = [
    rec.applied.length && `applied ${rec.applied.length}`,
    rec.pending.length && `${rec.pending.length} waiting for the person's Allow`,
    rec.keys.length && `${rec.keys.join(", ")} waiting for a key`,
    rec.failed.length && `skipped: ${rec.failed.join("; ")}`,
  ].filter(Boolean);
  appendLog(runId, "planner", { kind: "info", text: `Setup: ${parts.join(" · ")}` });
  return rec;
}

// Puts back what the round's setup changed, including anything allowed since.
export async function undoSetup(runId: string, round: number): Promise<string | null> {
  const rec = record(runId, round);
  if (!rec || rec.undone) return "Nothing to undo";
  const problems: string[] = [];
  for (const cmd of rec.undo) {
    const out = await run(cmd);
    // Already back the way it was counts as undone.
    if (typeof out === "string" && !/already/.test(out)) problems.push(out);
  }
  save(runId, round, { ...rec, undone: true });
  appendLog(runId, "planner", { kind: "info", text: `Setup undone${problems.length ? ` (${problems.join("; ")})` : ""}` });
  return problems.length ? problems.join("; ") : null;
}

// The person's Allow or Skip on something that runs code from outside Satgas.
export async function decideSetup(runId: string, round: number, index: number, allow: boolean): Promise<string | null> {
  const rec = record(runId, round);
  const item = rec?.pending[index];
  if (!rec || !item || item.state !== "waiting") return "That change is no longer waiting";
  const mark = (next: Partial<typeof item>, undo: SetupCommand[] = []) =>
    save(runId, round, {
      ...rec,
      pending: rec.pending.map((p, i) => (i === index ? { ...p, ...next } : p)),
      undo: [...undo, ...rec.undo],
    });
  if (!allow) {
    mark({ state: "skipped" });
    return null;
  }
  const out = await run(item.cmd);
  if (typeof out === "string") {
    mark({ state: "failed", note: out });
    return out;
  }
  mark({ state: "allowed", ...(out.note ? { note: out.note } : {}) }, out.undo);
  return null;
}

// Once every connector a round waited for is there, what the person asked can finally run. Only once, and never
// when the round already planned work, since that work ran without them and has its results.
export function requestAfterConnect(runId: string, round: number) {
  const run = getRun(runId);
  const rec = run?.setups?.[round];
  if (!run || !rec?.keys.length || rec.resumed || rec.undone) return null;
  if (run.nodes.some((n) => (n.round ?? 0) === round)) return null;
  const on = new Set(
    getSettings()
      .mcpServers.filter((s) => s.enabled)
      .map((s) => catalogOf(s)?.id),
  );
  if (!rec.keys.every((id) => on.has(id))) return null;
  const prompt = round === 0 ? run.prompt : run.rounds?.[round - 1];
  if (!prompt) return null;
  save(runId, round, { ...rec, resumed: true });
  return {
    prompt,
    files: run.files?.[round] ?? [],
    cards: run.selected?.[round] ?? [],
    label: rec.keys.map((id) => byId.get(id)?.name ?? id).join(", "),
  };
}
