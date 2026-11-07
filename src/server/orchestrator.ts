import type { Card, FileChange } from "../shared/board";
import { editBlocks } from "../shared/board-edit";
import { commitRule } from "../shared/commits";
import { classifyFailure, FAILURE_WORDS, isSystemFailure, retryAgent } from "../shared/failures";
import { describeForLead, describeForTasks, hasMemoryFor } from "../shared/memory";
import { cleanAnswers } from "../shared/questions";
import { cardLabel } from "../shared/refs";
import { MAIN_SESSION, sessionOf, sessionRounds } from "../shared/sessions";
import { crew, memberIdOf } from "../shared/team";
import { isPicture, type NodeState, type QueuedPrompt, type RoundOrigin, type Run } from "../shared/types";
import { fillVariables } from "../shared/widgets";
import { runClaude } from "./agents/claude";
import { runCodex } from "./agents/codex";
import type { AgentRequest } from "./agents/process";
import { cardsForTask, cardsFromReply, placeOnShelf, relativeInside, reuseFileCards, withMoves } from "./artifacts";
import { changes, snapshot } from "./changes";
import { config } from "./config";
import { editBoard } from "./edits";
import { changeList, checkpoint } from "./history";
import { applyMemory, getMemory } from "./memory";
import { plan } from "./planner";
import { buildNodePrompt, contextLines, workingRules } from "./prompt";
import { detectPulls } from "./pulls";
import { describeRefs, hasRefs, mediaFiles, resolveRefs } from "./refs";
import { placeRound, sessionContext } from "./rounds";
import { schedule } from "./scheduler";
import { planSchedules } from "./schedules";
import { closeSecrets, savedSecrets } from "./secrets";
import { getSettings, taskAgents } from "./settings";
import { applySetup, requestAfterConnect } from "./setup";
import { enabledSkills } from "./skills";
import { appendLog, boardOps, createRun, getLogs, getRun, patchNode, patchRun } from "./store";
import { describeSystem } from "./system";
import { closeTeamSession, openTeamSession, trackFile } from "./team";
import { type Sight, seeAttachments } from "./vision";
import { closeTree, inFolder, openTree, type TaskTree, treesFor } from "./worktrees";

type Live = Map<string, { ctrl: AbortController; done: Promise<void> }>;
// Survives `bun --hot` reloads, so cancel and shutdown still reach missions started before the reload.
const g = globalThis as typeof globalThis & { __satgasLive?: Live };
g.__satgasLive ??= new Map();
const live: Live = g.__satgasLive;
// Claude tasks that are running and can take a message mid-task, by board then task.
const hot = globalThis as typeof globalThis & { __satgasInboxes?: Map<string, Map<string, (text: string) => void>> };
hot.__satgasInboxes ??= new Map();
const inboxes = hot.__satgasInboxes;

export function startRun(prompt: string, cwd: string, id?: string, files: string[] = [], lang?: string): Run {
  const run = createRun(prompt, cwd, id, files, lang);
  launch(run, 0, prompt);
  return run;
}

// A follow-up prompt on an existing board: plans and runs a new round next to what is already there.
export function continueRun(
  id: string,
  prompt: string,
  files: string[] = [],
  lang?: string,
  steered: string[] = [],
  origin?: RoundOrigin,
  cards: string[] = [],
  session?: string,
): "ok" | "busy" | "missing" {
  const run = getRun(id);
  if (!run) return "missing";
  if (live.has(id)) return "busy";
  prompt = fillVariables(prompt, run.board);
  const rounds = [...(run.rounds ?? []), prompt];
  // A round in a session other than the main one says so; one that no longer exists falls back to the main one.
  const own = session && session !== MAIN_SESSION && run.sessions?.some((s) => s.id === session) ? session : undefined;
  const inSession = own ? { roundSessions: { ...run.roundSessions, [rounds.length]: own } } : {};
  // A round a watched PR, a schedule or a webhook started says so in the chat.
  const from = origin ? { origins: { ...run.origins, [rounds.length]: origin } } : {};
  const picked = selectedCards(run, cards);
  const context = picked.length ? { selected: { ...run.selected, [rounds.length]: picked } } : {};
  const attached = files.length ? { files: { ...(run.files ?? {}), [rounds.length]: files } } : {};
  patchRun(id, {
    status: "planning",
    rounds,
    startedAt: Date.now(),
    endedAt: undefined,
    error: undefined,
    ...attached,
    ...from,
    ...context,
    ...inSession,
    ...(lang ? { lang } : {}),
    ...(steered.length ? { steered: { ...run.steered, [rounds.length]: steered } } : {}),
  });
  launch(run, rounds.length, prompt);
  return "ok";
}

// The first round names the board, unless the person already renamed it.
function nameOf(id: string, round: number, p: { title: string; summary: string }): Partial<Run> {
  if (round > 0) return sessionName(id, round, p.title);
  return getRun(id)?.named ? { summary: p.summary } : { title: p.title, summary: p.summary };
}

// A session's first round names it, the way the first prompt names the board.
function sessionName(id: string, round: number, title: string): Partial<Run> {
  const run = getRun(id);
  const session = run ? sessionOf(run, round) : MAIN_SESSION;
  const own = run?.sessions?.find((s) => s.id === session);
  if (!run || !own || own.title || sessionRounds(run, session, round).length > 1 || !title.trim()) return {};
  return { sessions: run.sessions?.map((s) => (s.id === session ? { ...s, title: title.trim().slice(0, 80) } : s)) };
}

// The person's answers to the questions the planner asked for the latest round; planning then picks up where it stopped.
export function answerRun(id: string, raw: unknown): "ok" | "missing" | "busy" | "closed" | "invalid" {
  const run = getRun(id);
  if (!run) return "missing";
  if (live.has(id)) return "busy";
  const round = run.rounds?.length ?? 0;
  const asked = run.asks?.[round];
  if (run.status !== "asking" || !asked || asked.answers) return "closed";
  const answers = cleanAnswers(raw, asked.questions);
  if (!answers) return "invalid";
  // The clock restarts, so the time spent answering does not count as work.
  patchRun(id, { status: "planning", asks: { ...run.asks, [round]: { ...asked, answers } }, startedAt: Date.now(), endedAt: undefined });
  launch(run, round, round === 0 ? run.prompt : (run.rounds?.[round - 1] ?? run.prompt));
  return "ok";
}

function launch(run: Run, round: number, prompt: string) {
  const ctrl = new AbortController();
  const done = execute(run, round, prompt, ctrl.signal)
    .catch((e) => patchRun(run.id, { status: "failed", error: (e as Error).message, endedAt: Date.now() }))
    .finally(() => {
      live.delete(run.id);
      drain(run.id);
    });
  live.set(run.id, { ctrl, done });
}

// A message sent while the team works waits its turn; the person can still take it back until then.
export function queuePrompt(
  id: string,
  prompt: string,
  files: string[] = [],
  lang?: string,
  origin?: RoundOrigin,
  cards: string[] = [],
  session?: string,
): "ok" | "missing" {
  const run = getRun(id);
  if (!run) return "missing";
  const picked = selectedCards(run, cards);
  const item: QueuedPrompt = {
    id: crypto.randomUUID().slice(0, 8),
    // Filled when it is accepted, so the chat shows the words the team will get.
    prompt: fillVariables(prompt, run.board),
    at: Date.now(),
    ...(origin ? { origin } : {}),
    ...(picked.length ? { cards: picked } : {}),
    ...(session && session !== MAIN_SESSION ? { session } : {}),
    ...(files.length ? { files } : {}),
    ...(lang ? { lang } : {}),
  };
  patchRun(id, { queue: [...(run.queue ?? []), item] });
  // The round may have ended between the busy check and now.
  if (!live.has(id)) drain(id);
  else deliver(id);
  return "ok";
}

export function unqueuePrompt(id: string, itemId: string): boolean {
  const run = getRun(id);
  const queue = run?.queue ?? [];
  // A message that already reached a teammate is part of their work and cannot be taken back.
  if (!queue.some((q) => q.id === itemId && !q.sent?.length)) return false;
  // An empty list, not undefined: live updates travel as JSON, which drops undefined, so the chat would keep the bubble.
  patchRun(id, { queue: queue.filter((q) => q.id !== itemId) });
  return true;
}

// A waiting message can be reworded until it reaches a teammate.
export function editQueued(id: string, itemId: string, prompt: string): boolean {
  const run = getRun(id);
  const queue = run?.queue ?? [];
  const text = prompt.trim();
  if (!text || !queue.some((q) => q.id === itemId && !q.sent?.length)) return false;
  patchRun(id, { queue: queue.map((q) => (q.id === itemId ? { ...q, prompt: text } : q)) });
  return true;
}

// Moves a waiting message before another one, or to the end with no `before`; the next round reads them in this order.
export function moveQueued(id: string, itemId: string, before?: string): boolean {
  const run = getRun(id);
  const queue = run?.queue ?? [];
  const item = queue.find((q) => q.id === itemId);
  if (!item || item.id === before || (before && !queue.some((q) => q.id === before))) return false;
  const rest = queue.filter((q) => q.id !== itemId);
  const at = before ? rest.findIndex((q) => q.id === before) : rest.length;
  patchRun(id, { queue: [...rest.slice(0, at), item, ...rest.slice(at)] });
  return true;
}

// When a round ends, however it ended, everything sent during it runs as one next round, the way Claude Code takes
// queued messages together. The lead is told who already got them, so it plans only what is left.
function drain(id: string) {
  const waiting = getRun(id)?.queue ?? [];
  if (!waiting.length || live.has(id)) return;
  // One round belongs to one session: the oldest message's session goes next, the others keep waiting their turn.
  const session = waiting[0]?.session ?? MAIN_SESSION;
  const queue = waiting.filter((q) => (q.session ?? MAIN_SESSION) === session);
  patchRun(id, { queue: waiting.filter((q) => (q.session ?? MAIN_SESSION) !== session) });
  const heard = [...new Set(queue.flatMap((q) => q.heard ?? []))];
  continueRun(
    id,
    queue.map((q) => q.prompt).join("\n\n"),
    queue.flatMap((q) => q.files ?? []),
    queue.at(-1)?.lang,
    heard,
    // Only a round made entirely of automatic messages is labelled as theirs.
    queue.every((q) => q.origin) ? queue[0]?.origin : undefined,
    [...new Set(queue.flatMap((q) => q.cards ?? []))],
    session,
  );
}

const steerText = (text: string, about = "") =>
  `The person sent this while you work:\n\n${text}${about ? `\n\nThey had these board cards selected when they sent it, so it is about them:\n${about}` : ""}\n\nApply what concerns your task as you go. Anything outside your task is planned by the lead after this round, so leave it.`;

const MAX_SELECTED = 20;

// What the person did on the canvas by hand since the lead last planned, oldest first.
const canvasNews = (run: Run) =>
  (run.canvasLog ?? [])
    .filter((e) => e.at > (run.canvasReadAt ?? 0))
    .map((e) => `- ${e.text}`)
    .join("\n");

// The selected cards a message came with, kept only when they are still on the board.
function selectedCards(run: Run, ids: string[]): string[] {
  const known = new Set((run.board?.cards ?? []).map((c) => c.id));
  return [...new Set(ids)].filter((id) => known.has(id)).slice(0, MAX_SELECTED);
}

// Every queued message goes to each running Claude task that has not had it yet, at its next step.
function deliver(id: string) {
  const run = getRun(id);
  const boxes = inboxes.get(id);
  const queue = run?.queue ?? [];
  if (!run || !boxes?.size || !queue.length) return;
  const people = new Map(crew(run).map((m) => [m.id, m.name]));
  const nameOf = (nodeId: string) => {
    const node = run.nodes.find((n) => n.id === nodeId);
    return node ? (people.get(memberIdOf(node)) ?? node.role) : nodeId;
  };
  // A message from another session is not about the work running now; it waits for its own round.
  const working = sessionOf(run, run.rounds?.length ?? 0);
  let changed = false;
  const next = queue.map((item) => {
    if ((item.session ?? MAIN_SESSION) !== working) return item;
    const sent = new Set(item.sent ?? []);
    const heard = new Set(item.heard ?? []);
    for (const [nodeId, send] of boxes) {
      if (sent.has(nodeId)) continue;
      const about = (item.cards ?? [])
        .map((cid) => run.board?.cards.find((c) => c.id === cid))
        .filter((c) => !!c)
        .map((c) => `- ${cardLabel(c) || c.kind} (${c.kind})`)
        .join("\n");
      send(steerText(item.prompt, about));
      sent.add(nodeId);
      heard.add(nameOf(nodeId));
      changed = true;
    }
    return { ...item, sent: [...sent], heard: [...heard] };
  });
  if (changed) patchRun(id, { queue: next });
}

// A task's inbox opens once its CLI runs (what was sent before then reaches it right away) and closes when it is done.
const inboxFor = (runId: string, nodeId: string) => (send: ((text: string) => void) | null) => {
  const boxes = inboxes.get(runId) ?? new Map<string, (text: string) => void>();
  if (send) boxes.set(nodeId, send);
  else boxes.delete(nodeId);
  if (boxes.size) inboxes.set(runId, boxes);
  else inboxes.delete(runId);
  if (send) deliver(runId);
};

export const isLive = (id: string) => live.has(id);

// A message from something other than the person (a watched PR, a schedule, a webhook): a new round now, or the next one
// when the team is still working.
export function followUp(id: string, prompt: string, origin?: RoundOrigin, cards: string[] = [], files: string[] = []): "ok" | "missing" {
  if (!getRun(id)) return "missing";
  if (live.has(id)) return queuePrompt(id, prompt, files, undefined, origin, cards);
  const result = continueRun(id, prompt, files, undefined, [], origin, cards);
  return result === "busy" ? queuePrompt(id, prompt, files, undefined, origin, cards) : result;
}

// The person just connected what a round was waiting for, so its request runs without them sending it again.
export function resumeAfterConnect(id: string, round: number): boolean {
  const next = requestAfterConnect(id, round);
  if (!next) return false;
  followUp(id, next.prompt, { kind: "connect", label: next.label }, next.cards, next.files);
  return true;
}

const CONTINUE_DEFAULT =
  "Continue your task from where you stopped and finish it within the brief. Then write your report as the brief asks.";

// Continues one stopped task (failed, cancelled, cut off at its time limit, or done and wanted further) on its own,
// outside a round: the board shows it working again, and its report replaces the last one.
export function continueTask(id: string, nodeId: string, message?: string): "ok" | "missing" | "busy" | "running" {
  const run = getRun(id);
  const node = run?.nodes.find((n) => n.id === nodeId);
  if (!run || !node) return "missing";
  if (live.has(id)) return "busy";
  if (node.status === "running" || node.status === "pending") return "running";
  const ctrl = new AbortController();
  const text = message?.trim().slice(0, MAX_CONTINUE) || CONTINUE_DEFAULT;
  appendLog(id, nodeId, { kind: "info", text: message?.trim() ? `Continued: ${text}` : "Continued" });
  patchNode(id, nodeId, { status: "running", error: undefined, endedAt: undefined });
  patchRun(id, { status: "running", error: undefined, endedAt: undefined });
  const done = (async () => {
    let failed = false;
    try {
      await runNode(getRun(id) ?? run, { ...onActiveAgent(id, node), status: "running" }, false, ctrl.signal, { message: text });
    } catch {
      failed = true;
    }
    const after = getRun(id);
    const stillFailed = after?.nodes.filter((n) => n.status === "failed").map((n) => n.title) ?? [];
    patchRun(id, {
      status: ctrl.signal.aborted ? "cancelled" : failed || stillFailed.length ? "failed" : "done",
      endedAt: Date.now(),
      error: stillFailed.length ? `Failed: ${stillFailed.join(", ")}` : undefined,
    });
  })().finally(() => live.delete(id));
  live.set(id, { ctrl, done });
  return "ok";
}

const MAX_CONTINUE = 2000;

// Stops a board's work and waits for its agents to wind down, so it can be deleted.
export async function stopRun(id: string, timeoutMs = 8000) {
  const entry = live.get(id);
  if (!entry) return;
  entry.ctrl.abort();
  await Promise.race([entry.done, Bun.sleep(timeoutMs)]);
}

export function cancelRun(id: string): boolean {
  const entry = live.get(id);
  if (entry) {
    entry.ctrl.abort();
    return true;
  }
  // Questions wait with no agent running; stopping just sets them aside.
  if (getRun(id)?.status !== "asking") return false;
  patchRun(id, { status: "cancelled", endedAt: Date.now() });
  return true;
}

// Stops every agent process and waits (bounded) for runs to record their final state.
export async function shutdown(timeoutMs = 4000) {
  const entries = [...live.values()];
  for (const e of entries) e.ctrl.abort();
  await Promise.race([Promise.allSettled(entries.map((e) => e.done)), Bun.sleep(timeoutMs)]);
}

async function execute(run: Run, round: number, prompt: string, signal: AbortSignal) {
  let fresh: NodeState[];
  let sight: Sight["blind"] = { claude: false, codex: false };
  try {
    const cards = run.board?.cards ?? [];
    // Answers resume the round's planning, so its prompt is already in the log.
    if (round > 0 && !run.asks?.[round]?.answers) appendLog(run.id, "planner", { kind: "info", text: `Follow-up: ${prompt}` });
    const context = sessionContext(run, round, config.upstreamChars);
    // What the prompt's / and @ words name is looked up once per round; answers resume with the same lookup.
    let refs = run.refs?.[round];
    if (!refs) {
      refs = await resolveRefs(run, prompt);
      // Cards selected on the canvas when the message was sent count as pointed at, like an @ mention.
      const picked = getRun(run.id)?.selected?.[round] ?? [];
      if (picked.length) refs = { ...refs, cards: [...new Set([...(refs.cards ?? []), ...picked])] };
      // Pictures and pages pointed at on the board count as attached, so agents open the file and a blind model gets it described.
      const media = await mediaFiles(run, refs.cards ?? []);
      if (Object.keys(media).length) {
        refs = { ...refs, media };
        const files = getRun(run.id)?.files;
        patchRun(run.id, { files: { ...files, [round]: [...new Set([...(files?.[round] ?? []), ...Object.values(media)])] } });
      }
      if (hasRefs(refs)) patchRun(run.id, { refs: { ...getRun(run.id)?.refs, [round]: refs } });
    }
    const attached = getRun(run.id)?.files ?? run.files;
    // Tasks see the first prompt's files and this round's, so both get described for a model that cannot see.
    const images = [...new Set([...(attached?.[0] ?? []), ...(attached?.[round] ?? [])])].filter(isPicture);
    const lead = (l: Parameters<typeof appendLog>[2]) => appendLog(run.id, "planner", { ...l, round });
    const seen = await seeAttachments(run.cwd, images, run.imageNotes ?? {}, signal, lead);
    sight = seen.blind;
    if (Object.keys(seen.notes).length) patchRun(run.id, { imageNotes: { ...run.imageNotes, ...seen.notes } });
    const leadSees = contextLines(getRun(run.id) ?? run, round, {
      memory: hasMemoryFor(getMemory().entries, run.cwd),
      files: attached?.[round] ?? [],
    });
    // Answers resume the round, and what the lead was handed is already on its log.
    if (!run.asks?.[round]?.answers) for (const text of leadSees) lead({ kind: "tool", text });
    const p = await plan({
      mission: prompt,
      pointed: describeRefs(run, refs, config.upstreamChars),
      mustAsk: refs.ask,
      only: refs.only,
      context,
      files: attached?.[round] ?? [],
      seen: seen.texts,
      lang: run.lang,
      asked: run.asks?.[round],
      team: crew(getRun(run.id) ?? run),
      board: getRun(run.id)?.board ?? run.board,
      steered: getRun(run.id)?.steered?.[round],
      cwd: run.cwd,
      signal,
      onLog: lead,
      onDraft: (d) => patchRun(run.id, { draft: { ...d, round } }),
      memory: { text: describeForLead(getMemory().entries, run.cwd), learn: getMemory().auto && !getRun(run.id)?.noMemory },
      canvas: canvasNews(getRun(run.id) ?? run),
    });
    if (p.usage) patchRun(run.id, { leadUsage: { ...getRun(run.id)?.leadUsage, [round]: { ...p.usage, at: Date.now() } } });
    // The lead has now heard what the person did on the canvas; the next plan only hears what comes after.
    patchRun(run.id, { canvasReadAt: Date.now() });
    // What the lead learned from the message is kept whatever the round turns into: an answer, questions or work.
    if (p.memory?.length) await applyMemory(run.id, round, p.memory);
    // A choice is still open: the questions go to the chat and planning waits for the answers.
    if (p.questions?.length) {
      appendLog(run.id, "planner", {
        kind: "info",
        text: `Asked ${p.questions.length} question${p.questions.length === 1 ? "" : "s"} before planning`,
      });
      const naming = nameOf(run.id, round, p);
      // The draft goes in the same patch as what replaces it, so the chat never blinks between the two.
      patchRun(run.id, {
        ...naming,
        status: "asking",
        draft: undefined,
        asks: { ...getRun(run.id)?.asks, [round]: { questions: p.questions } },
      });
      return;
    }
    // The lead's own canvas changes land before any task starts, so the tasks see the board as it now is.
    if (p.board?.length) editBoard(run.id, round, p.board, "planner");
    // Setup lands before tasks too, so a connector the lead just added is there when the work starts.
    if (p.setup?.length) await applySetup(run.id, round, p.setup);
    // Work the person wants repeated becomes this board's schedules, each shown as a trigger card.
    if (p.schedules?.length) {
      const problems = await planSchedules(run.id, p.schedules);
      for (const problem of problems) appendLog(run.id, "planner", { kind: "error", text: `Could not set up a schedule: ${problem}` });
      const set = p.schedules.length - problems.length;
      if (set) appendLog(run.id, "planner", { kind: "info", text: `Set up ${set} schedule${set === 1 ? "" : "s"} on this board` });
    }
    // Talk or a canvas edit, not work: the answer goes to the chat and no task is added.
    if (!p.nodes.length) {
      const naming = nameOf(run.id, round, p);
      const reply = p.reply?.trim();
      patchRun(run.id, {
        ...naming,
        status: "done",
        draft: undefined,
        ...(reply ? { answers: { ...(getRun(run.id)?.answers ?? {}), [round]: reply } } : {}),
        endedAt: Date.now(),
      });
      return;
    }
    fresh = placeRound(withMoves(run), cards, p.nodes, round);
    appendLog(run.id, "planner", { kind: "info", text: `Plan ready: ${fresh.length} task${fresh.length === 1 ? "" : "s"}` });
    // The board keeps the title of its first mission; follow-ups only add tasks.
    const naming = nameOf(run.id, round, p);
    const now = Date.now();
    const hired = (p.hires ?? []).map((h) => ({ ...h, hiredAt: now, round }));
    for (const h of hired) appendLog(run.id, "planner", { kind: "info", text: `Hired ${h.name}, ${h.role}` });
    const team = hired.length ? { team: [...(getRun(run.id)?.team ?? []), ...hired] } : {};
    const plans = { plans: { ...getRun(run.id)?.plans, [round]: p.summary } };
    patchRun(run.id, { status: "running", draft: undefined, ...naming, ...team, ...plans, nodes: [...run.nodes, ...fresh] });
  } catch (e) {
    const cancelled = signal.aborted;
    patchRun(run.id, {
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? undefined : (e as Error).message,
      endedAt: Date.now(),
      draft: undefined,
    });
    return;
  }

  // Writing tasks that run side by side in a git repository each get a branch of their own.
  const trees = await treesFor(run, fresh, (l) => appendLog(run.id, "planner", l));
  const byId = new Map(fresh.map((n) => [n.id, n]));
  // A member works on one task at a time, like a person would.
  const outcome = await schedule(
    fresh.map((n) => ({ ...n, lane: memberIdOf(n) })),
    {
      concurrency: config.concurrency ?? getSettings().concurrency,
      signal,
      run: (id) => {
        const node = byId.get(id);
        return node ? runWithRecovery(run, node, sight, signal, trees) : Promise.reject(new Error(`Unknown task ${id}`));
      },
      onSkip: (id, blockedBy) => patchNode(run.id, id, { status: "skipped", blockedBy }),
    },
  );

  for (const n of fresh) {
    if (outcome.get(n.id) === "cancelled" && n.status !== "cancelled") patchNode(run.id, n.id, { status: "cancelled" });
  }

  // The final report stays in the chat; the board only gets what the tasks produced.
  const status = signal.aborted ? "cancelled" : [...outcome.values()].every((o) => o === "done") ? "done" : "failed";
  const failed = fresh.filter((n) => n.status === "failed").map((n) => n.title);
  patchRun(run.id, {
    status,
    endedAt: Date.now(),
    error: status === "failed" ? `Failed: ${failed.join(", ")}` : undefined,
  });
}

const AGENT_NAME = { claude: "Claude Code", codex: "Codex" } as const;

// A task planned before the model changed carries on with the agent working now.
function onActiveAgent(runId: string, node: NodeState): NodeState {
  const now = taskAgents()[0];
  if (!now || node.agent === now) return node;
  patchNode(runId, node.id, { agent: now });
  return { ...node, agent: now };
}

// A task that failed for a passing glitch of the system around it (the network, a timeout) runs once more. A provider that
// would only fail again has no other agent to go to, and a failure of the work itself would just repeat, so both are left
// to the lead and the person.
async function runWithRecovery(run: Run, planned: NodeState, sight: Sight["blind"], signal: AbortSignal, trees = false): Promise<void> {
  const node = onActiveAgent(run.id, planned);
  await awaitApproval(run, node, signal);
  try {
    await runNode(run, node, sight[node.agent], signal, undefined, trees);
  } catch (e) {
    if (signal.aborted) throw e;
    const error = (e as Error).message;
    const failure = classifyFailure(error);
    if (!isSystemFailure(failure.kind)) throw e;
    const to = retryAgent(failure, node.agent, taskAgents());
    const recovery = { kind: failure.kind, from: node.agent, error: error.slice(0, 600), ...(to ? { to } : {}) };
    patchNode(run.id, node.id, { recovery });
    if (!to) throw e;
    appendLog(run.id, node.id, {
      kind: "info",
      text: `${FAILURE_WORDS[failure.kind]}; running the task again on ${AGENT_NAME[to]}`.replace(/^./, (c) => c.toUpperCase()),
    });
    patchNode(run.id, node.id, { agent: to, error: undefined });
    await runNode(run, { ...node, agent: to }, sight[to], signal, undefined, trees);
  }
}

// Tasks held for the person's Allow, by board and task; answering one resolves its wait.
const approvals = new Map<string, (allow: boolean) => void>();
const approvalKey = (runId: string, nodeId: string) => `${runId}:${nodeId}`;

// A task the lead marked as hard to undo waits here, before any agent starts, until the person allows or declines it.
async function awaitApproval(run: Run, node: NodeState, signal: AbortSignal) {
  if (!node.approval || node.approved === "allowed") return;
  const key = approvalKey(run.id, node.id);
  patchNode(run.id, node.id, { held: Date.now() });
  appendLog(run.id, node.id, { kind: "info", text: `Waiting for your Allow: ${node.approval}` });
  const allow = await new Promise<boolean>((resolve, reject) => {
    const abort = () => {
      approvals.delete(key);
      reject(new Error("Cancelled while waiting for approval"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    approvals.set(key, (answer) => {
      signal.removeEventListener("abort", abort);
      approvals.delete(key);
      resolve(answer);
    });
  });
  patchNode(run.id, node.id, { held: undefined, approved: allow ? "allowed" : "declined" });
  if (allow) {
    appendLog(run.id, node.id, { kind: "info", text: "Allowed" });
    return;
  }
  const error = `Not allowed: ${node.approval}`;
  appendLog(run.id, node.id, { kind: "error", text: error });
  patchNode(run.id, node.id, { status: "failed", error, endedAt: Date.now() });
  throw new Error(error);
}

export function approveTask(runId: string, nodeId: string, allow: boolean): "ok" | "missing" {
  const answer = approvals.get(approvalKey(runId, nodeId));
  if (!answer) return "missing";
  answer(allow);
  return "ok";
}

// How long a task may work: at the limit a Claude task is told to wrap up and report, and stopped a few minutes later if it
// has not; Codex takes no messages mid-task, so it stops at the limit. A stopped task can be continued later.
const WRAP_UP_MS = 3 * 60_000;
function timeLimit(runId: string, node: NodeState) {
  const minutes = getSettings().taskMinutes;
  let hit = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const message = `Stopped at the ${minutes}-minute limit for one task; continue it to pick up where it stopped`;
  return {
    hit: () => hit,
    message,
    clear: () => timers.forEach(clearTimeout),
    arm: (stop: () => void) => {
      if (!minutes) return;
      timers.push(
        setTimeout(() => {
          const send = node.agent === "claude" ? inboxes.get(runId)?.get(node.id) : undefined;
          const halt = () => {
            hit = true;
            appendLog(runId, node.id, { kind: "error", text: message });
            stop();
          };
          if (!send) return halt();
          appendLog(runId, node.id, { kind: "info", text: `Time limit reached (${minutes} min); asked to wrap up` });
          send(
            `[Satgas] This task has reached its ${minutes}-minute time limit. Stop starting new work now: finish what is half done only if it takes a moment, then write your report with what is done, what is not, and where you stopped.`,
          );
          timers.push(setTimeout(halt, WRAP_UP_MS));
        }, minutes * 60_000),
      );
    },
  };
}

// Picks a stopped task back up: in its own Claude Code session when it has one (the agent remembers everything it did),
// otherwise from a fresh start that carries what the last attempt reported.
interface Resume {
  message: string;
}

async function runNode(run: Run, node: NodeState, blind: boolean, signal: AbortSignal, resume?: Resume, trees = false): Promise<void> {
  patchNode(run.id, node.id, { status: "running", startedAt: Date.now(), branch: undefined });
  const log = (l: Parameters<typeof appendLog>[2]) => appendLog(run.id, node.id, l);
  // A writing task in a round that works on branches gets its own worktree; the rest work in the board's folder.
  const tree: TaskTree | null = trees && node.access !== "read" && !resume ? await openTree(run, node, log) : null;
  const workdir = tree?.dir ?? run.cwd;
  // The board's own history around a writing task, so the Changes panel can show its diff and undo it.
  const mark = node.access === "read" ? null : await checkpoint(run, `before ${node.id}`);
  const written = new Map<string, FileChange["change"]>();
  const before = await snapshot(workdir);
  const remembered = describeForTasks(getMemory().entries, run.cwd);
  const rules = workingRules(
    enabledSkills().some((s) => s.builtin && s.name === "satgas"),
    describeSystem(),
    commitRule(getSettings().commitStyle),
    remembered.rules,
    enabledSkills().some((s) => s.builtin && s.name === "hallmark"),
  );
  // The live run, so the board the agent sees includes the lead's edits and what earlier tasks added.
  const prompt = buildNodePrompt(getRun(run.id) ?? run, node, config.upstreamChars, blind, {
    pointed: describeRefs(run, run.refs?.[node.round ?? 0], config.upstreamChars),
    saved: savedSecrets(getRun(run.id) ?? run),
    // Claude Code loads skills natively; Codex gets their index and reads a SKILL.md when its work fits.
    skills: node.agent === "codex" ? enabledSkills() : [],
    ...(tree ? { workdir, branch: tree.branch } : {}),
    ...(remembered.person ? { person: remembered.person } : {}),
  });
  const current = getRun(run.id) ?? run;
  const upstreamTitles = [...node.dependsOn, ...(node.after ?? [])].flatMap((d) => current.nodes.find((n) => n.id === d)?.title ?? []);
  for (const text of contextLines(current, node.round ?? 0, {
    memory: !!(remembered.person || remembered.rules),
    upstream: upstreamTitles,
    saved: savedSecrets(current),
  }))
    log({ kind: "tool", text });
  // Every task gets the built-in connector for asking the person a secret; teammates working the same round also get
  // its talk channels, while a task working alone has nobody to talk to.
  const round = node.round ?? 0;
  const talk = config.teamTalk ?? getSettings().teamTalk;
  const together = talk && (getRun(run.id) ?? run).nodes.filter((n) => (n.round ?? 0) === round).length > 1;
  const teamToken = openTeamSession(run.id, node.id, memberIdOf(node), round, together);
  // The task's own stop: the run's cancel reaches it, and so does its time limit.
  const task = new AbortController();
  const stopTask = () => task.abort();
  signal.addEventListener("abort", stopTask, { once: true });
  const limit = timeLimit(run.id, node);
  const session = resume && node.agent === "claude" ? node.session : undefined;
  const carried =
    resume && !session
      ? `\n\n<previous_attempt>\nThis task ran before and stopped. What it reported or the error it hit:\n${(node.output || node.error || "nothing").slice(0, config.upstreamChars)}\n</previous_attempt>\n\n<continue>\n${resume.message}\n</continue>`
      : "";
  const req: AgentRequest = {
    teamToken,
    teamTalk: together,
    ...(session ? { resume: session } : {}),
    onSession: (id) => patchNode(run.id, node.id, { session: id }),
    ...(node.access === "read" ? { readOnly: true } : {}),
    ...(run.origins?.[round]?.kind === "pull" ? { watchedPull: true } : {}),
    // Codex has no system prompt of its own to add to, so the working rules lead its prompt.
    prompt: session ? (resume?.message ?? "") : node.agent === "codex" ? `${rules}\n\n${prompt}${carried}` : `${prompt}${carried}`,
    cwd: workdir,
    signal: task.signal,
    onLog: log,
    // Claude Code takes messages mid-task; Codex runs in one go, so what is sent meanwhile waits for the next round.
    ...(node.agent === "claude" ? { inbox: inboxFor(run.id, node.id) } : {}),
    // A file created and then edited in the same task is still new.
    onFile: (path, change) => {
      written.set(path, written.get(path) === "added" ? "added" : change);
      trackFile(run.id, node.id, path);
    },
  };
  // What the shell wrote counts too; the file tools' own reports win where both saw a file. Read before a worktree goes.
  const collect = async () => {
    const after = before && !signal.aborted ? await snapshot(workdir) : null;
    if (before && after) for (const [path, change] of changes(before, after)) if (!written.has(path)) written.set(path, change);
  };
  let output = "";
  let collected = false;
  limit.arm(stopTask);
  try {
    const result = node.agent === "codex" ? await runCodex(req) : await runClaude(req, { systemPrompt: rules });
    output = result.output;
    await collect();
    collected = true;
    if (tree) {
      const end = await closeTree(run, node, tree, true, log);
      if (!end.merged) {
        patchNode(run.id, node.id, { branch: end.branch });
        throw new Error(
          `Could not merge branch ${end.branch}${end.conflicts?.length ? `: conflicts in ${end.conflicts.slice(0, 6).join(", ")}` : end.error ? `: ${end.error}` : ""}. The work is kept on that branch.`,
        );
      }
    }
    patchNode(run.id, node.id, {
      status: "done",
      output: output.trim(),
      endedAt: Date.now(),
      ...(result.usage ? { usage: result.usage } : {}),
    });
    // A pull request the task opened is linked to the board, and watched when Integrations says so.
    detectPulls(run.id, [output, ...(getLogs(run.id)[node.id] ?? []).map((l) => l.text)].join("\n"));
  } catch (e) {
    const cancelled = signal.aborted;
    const error = limit.hit() ? limit.message : (e as Error).message;
    if (tree && !collected) {
      await collect();
      collected = true;
      const end = await closeTree(run, node, tree, false, log).catch(() => ({ merged: false as const }));
      if (!end.merged && "branch" in end && end.branch) patchNode(run.id, node.id, { branch: end.branch });
    }
    patchNode(run.id, node.id, {
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? undefined : error,
      ...(output ? { output: output.trim() } : {}),
      endedAt: Date.now(),
    });
    throw limit.hit() ? new Error(error) : e;
  } finally {
    limit.clear();
    signal.removeEventListener("abort", stopTask);
    closeTeamSession(teamToken);
    closeSecrets(run.id, node.id);
    if (!collected) await collect();
    // Cards point at the board's folder: a merged branch's files are there now, an unmerged branch's are not.
    const merged = !tree || !getRun(run.id)?.nodes.find((n) => n.id === node.id)?.branch;
    const files = new Map(merged ? [...written].map(([p, c]) => [inFolder(p, tree, run.cwd), c] as const) : []);
    const rel = new Map<string, FileChange["change"]>();
    for (const [p, c] of files) {
      const r = relativeInside(run.cwd, p);
      if (r && !rel.has(r)) rel.set(r, c);
    }
    if (rel.size) {
      const after = mark ? await checkpoint(run, `after ${node.id}`) : null;
      patchNode(run.id, node.id, { changes: { ...(mark && after ? { before: mark, after } : {}), files: changeList(rel) } });
    }
    if (!signal.aborted && (files.size || output)) await showOnBoard(run, node, files, output);
  }
}

// What a task produced goes on the board even when the task failed; a board problem must never fail the task.
async function showOnBoard(run: Run, node: NodeState, written: Map<string, FileChange["change"]>, output: string) {
  try {
    // Changes to what is already there come first, so the new cards take spots the edit freed up.
    const edits = editBlocks(output);
    if (edits.length) editBoard(run.id, node.round ?? 0, edits, node.id);
    const units = cardsFromReply(run, node, output);
    const { fresh: files, ops } = reuseFileCards(run, written.size ? await cardsForTask(run, node, written) : []);
    // Each block takes one spot on the shelf (a framed board moves as one); what it holds keeps its place inside.
    const anchors = placeOnShelf(getRun(run.id) ?? run, [...units.map((u) => u.anchor), ...files]);
    anchors.forEach((card, i) => {
      ops.push({ op: "put", card });
      for (const child of units[i]?.children ?? [])
        ops.push({ op: "put", card: { ...child, x: card.x + child.x, y: card.y + child.y } as Card });
    });
    for (const [i, unit] of units.entries())
      for (const [j, l] of unit.links.entries()) ops.push({ op: "link", link: { id: `l-${node.id.slice(0, 40)}-${i}-${j}`, ...l } });
    if (ops.length) boardOps(run.id, ops);
  } catch (e) {
    appendLog(run.id, node.id, { kind: "error", text: `Could not add the results to the board: ${(e as Error).message}` });
  }
}
