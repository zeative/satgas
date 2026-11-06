import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import pkg from "../../package.json";
import { sanitizeOps } from "../shared/board";
import { describeOps, mergeEvents } from "../shared/board-edit";
import { maskSchedule, nextRun } from "../shared/schedules";
import { liveSecrets } from "../shared/secrets";
import { type ChatSession, MAX_SESSIONS, SESSION_TITLE_MAX } from "../shared/sessions";
import { maskSettings, restoreSecrets } from "../shared/settings";
import { type ClientMessage, cleanIcon, cleanLang, cleanTitle, type Run, type ServerEvent } from "../shared/types";
import { USAGE_RANGES, usageReport } from "../shared/usage";
import { detectAgents } from "./agents/detect";
import { authorized, fileKey, loadToken, rotateToken, signIn, signInCookie, signInLink, signOutCookie, validFileKey } from "./auth";
import { channelsView, logoutWhatsApp, newPairing, removePerson, startChannels, stopChannels, updateChannel } from "./channels";
import { isChannelKind } from "./channels/hub";
import { config } from "./config";
import { undoEdit } from "./edits";
import { saveImage, serveAsset, serveWorkFile } from "./files";
import { forkRun, mergeBack, removeFork } from "./forks";
import { dropBoardBranches, dropBranch, gitInfo, mergeBranch } from "./git";
import { repoStars } from "./github";
import { fileAt, patchBetween, removeHistory, revertTask } from "./history";
import { cleanBoard, storageReport } from "./housekeeping";
import { limitsReport } from "./limits";
import { deleteEntry, getMemory, loadMemory, putEntry, setAuto, undoMemory } from "./memory";
import {
  answerRun,
  approveTask,
  cancelRun,
  continueRun,
  continueTask,
  editQueued,
  followUp,
  isLive,
  moveQueued,
  queuePrompt,
  shutdown,
  startRun,
  stopRun,
  unqueuePrompt,
} from "./orchestrator";
import { providerStatuses } from "./providers";
import { checkPull, linkPull, startPullWatch, updatePull } from "./pulls";
import { workspaceTree } from "./refs";
import {
  deleteSchedule,
  dropBoardSchedules,
  getSchedule,
  listSchedules,
  loadSchedules,
  receiveWebhook,
  runSchedule,
  saveSchedule,
  startSchedules,
} from "./schedules";
import { answerSecret, forgetSecret, removeRunSecrets, startSecretSweep } from "./secrets";
import { getSettings, loadSettings, saveSettings, taskAgents } from "./settings";
import { decideSetup, undoSetup } from "./setup";
import {
  deleteSkill,
  findInArchive,
  findLocal,
  findOnGithub,
  installFound,
  listSkills,
  prepareSkills,
  readSkill,
  saveOwnSkill,
  setSkillEnabled,
  skillFile,
  skillFiles,
  skillZip,
} from "./skills";
import {
  boardOps,
  deleteRun,
  flushAll,
  getLogs,
  getRun,
  listLanes,
  listRunIds,
  listRuns,
  loadRuns,
  newRunId,
  ownWorkspace,
  patchNode,
  patchRun,
  searchRuns,
  setPublisher,
  topicOf,
} from "./store";
import { teamCall } from "./team";
import { toolStatus } from "./tools";
import { startUpdate, updateInfo } from "./updates";
import { claimUploads, pruneUploads, stageUpload } from "./uploads";
import { visionStatus } from "./vision";
import { decodePath, serveWeb } from "./web";
import { removeRunTrees } from "./worktrees";

interface SocketData {
  watching: string | null;
}

await loadRuns();
await loadSettings();
// Built-in skills are written out and the plugin folder Claude Code reads is rebuilt, so both match this version.
await prepareSkills().catch((e) => console.error(`Could not prepare skills: ${(e as Error).message}`));
void pruneUploads();
startPullWatch();
startSecretSweep();
void startChannels().catch((e) => console.error(`Could not start channels: ${(e as Error).message}`));
await loadSchedules();
await loadMemory();
startSchedules();
const { fromEnv: tokenFromEnv } = await loadToken();
// Started now so the answer is ready by the time the UI asks for it.
void detectAgents();

const isProd = process.env.NODE_ENV === "production";
// The same cap for a new mission and a follow-up; the planner reads the whole prompt.
const MAX_PROMPT = 20_000;

const server: Server<SocketData> = Bun.serve({
  // Loopback unless SATGAS_HOST says otherwise; on a server it sits behind HTTPS and every call needs the sign-in token.
  hostname: config.host,
  port: config.port,
  development: !isProd,
  routes: {
    "/api/auth": {
      // One-click sign-in from the link Satgas prints when it starts.
      GET: open((req) => {
        const result = signIn(new URL(req.url).searchParams.get("token") ?? "");
        if (result === "ok")
          return new Response(null, { status: 303, headers: { location: "/", "set-cookie": signInCookie(), "cache-control": "no-store" } });
        const text =
          result === "limited"
            ? "Too many sign-in attempts, wait a minute and try again"
            : "This sign-in link is not valid. Use the link Satgas printed when it started, or paste the token on the sign-in page.";
        return new Response(text, { status: result === "limited" ? 429 : 401, headers: { "content-type": "text/plain; charset=utf-8" } });
      }),
      // The sign-in page posts the pasted token.
      POST: open(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
        const result = signIn(typeof body?.token === "string" ? body.token.trim() : "");
        if (result === "limited") return error(429, "Too many sign-in attempts, wait a minute and try again");
        if (result === "wrong") return error(401, "That token is not right");
        return new Response(null, { status: 204, headers: { "set-cookie": signInCookie() } });
      }),
      DELETE: api((req) =>
        isTrusted(req, false) ? new Response(null, { status: 204, headers: { "set-cookie": signOutCookie() } }) : forbidden(),
      ),
    },
    "/api/config": api(async () =>
      Response.json({
        defaultCwd: config.defaultCwd,
        concurrency: config.concurrency ?? getSettings().concurrency,
        concurrencyFromEnv: config.concurrency !== null,
        version: pkg.version,
        // A hung CLI must not hold up the composer; the agent pill simply stays hidden.
        agents: await Promise.race([detectAgents(), Bun.sleep(1500).then(() => null)]),
      }),
    ),
    "/api/usage": api((req) => {
      const q = new URL(req.url).searchParams;
      const range = USAGE_RANGES.find((r) => r === q.get("range")) ?? "30";
      const offset = Math.max(-840, Math.min(840, Number(q.get("tz")) || 0));
      const runs = listRunIds().flatMap((id) => getRun(id) ?? []);
      return Response.json(usageReport(runs, { range, now: Date.now(), offset }));
    }),
    "/api/usage/limits": api(async () => Response.json(await limitsReport())),
    "/api/storage": api(async (req) => {
      const site = req.headers.get("sec-fetch-site");
      const refresh = new URL(req.url).searchParams.has("refresh") && (!site || site === "same-origin");
      return Response.json(await storageReport(refresh));
    }),
    "/api/storage/clean": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { board?: unknown };
        const result = await cleanBoard(String(body.board ?? ""));
        return typeof result === "string" ? error(409, result) : Response.json({ freed: result });
      }),
    },
    "/api/security": api(() => {
      const secrets = listRunIds().flatMap((id) => {
        const run = getRun(id);
        if (!run) return [];
        return liveSecrets(run.secrets).map((a) => ({
          runId: id,
          board: run.title ?? run.prompt.slice(0, 80),
          id: a.id,
          label: a.label,
          until: a.until ?? 0,
        }));
      });
      return Response.json({ tokenFromEnv: !!config.token, publicUrl: config.publicUrl ?? null, host: config.host, secrets });
    }),
    "/api/auth/rotate": {
      // The new token shows once, to the browser that asked, which stays signed in with it.
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const token = await rotateToken();
        if (!token) return error(409, "This token comes from `SATGAS_TOKEN`. Change it there and restart Satgas.");
        return Response.json({ token }, { headers: { "set-cookie": signInCookie(), "cache-control": "no-store" } });
      }),
    },
    "/api/about": api(async () => {
      const runs = listRunIds().flatMap((id) => getRun(id) ?? []);
      return Response.json({
        version: pkg.version,
        bun: Bun.version,
        platform: `${process.platform} ${process.arch}`,
        dataDir: config.dataDir,
        port: server.port,
        host: config.host,
        publicUrl: config.publicUrl ?? null,
        uptimeSec: Math.round(process.uptime()),
        boards: runs.length,
        live: runs.filter((r) => r.status === "planning" || r.status === "running").length,
        agents: await Promise.race([detectAgents(), Bun.sleep(1500).then(() => null)]),
        programs: (await toolStatus()).programs,
        repo: `https://github.com/${config.repo}`,
      });
    }),
    "/api/channels": api(() => Response.json(channelsView())),
    "/api/channels/pairing": {
      POST: api((req) => (isTrusted(req) ? Response.json(newPairing()) : forbidden())),
    },
    "/api/channels/people/:kind/:id": {
      DELETE: api((req) => {
        if (!isTrusted(req, false)) return forbidden();
        if (!isChannelKind(req.params.kind)) return error(404, "Unknown channel.");
        return removePerson(req.params.kind, decodeURIComponent(req.params.id))
          ? new Response(null, { status: 204 })
          : error(404, "That person is not paired.");
      }),
    },
    "/api/channels/whatsapp/logout": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        await logoutWhatsApp();
        return new Response(null, { status: 204 });
      }),
    },
    "/api/channels/:kind": {
      PUT: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        if (!isChannelKind(req.params.kind)) return error(404, "Unknown channel.");
        const body = (await req.json().catch(() => ({}))) as { enabled?: unknown; token?: unknown };
        const problem = await updateChannel(req.params.kind, body);
        return problem ? error(400, problem) : Response.json(channelsView());
      }),
    },
    "/api/settings": {
      // Keys and env/header values never leave the server; the page gets masks and sends them back untouched.
      GET: api(() => Response.json(maskSettings(getSettings()))),
      PUT: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const restored = restoreSecrets(await req.json().catch(() => null), getSettings());
        if (typeof restored === "string") return error(400, restored);
        const saved = await saveSettings(restored.input);
        return typeof saved === "string" ? error(400, saved) : Response.json(maskSettings(saved));
      }),
    },
    // ?refresh=1 re-runs every check instead of answering from the minute-long cache; only Satgas's own pages may ask,
    // so another site (an <img> pointing here) cannot make it spawn CLIs and call APIs at will.
    "/api/providers": api(async (req) => {
      const site = req.headers.get("sec-fetch-site");
      const refresh = new URL(req.url).searchParams.has("refresh") && (!site || site === "same-origin" || site === "none");
      return Response.json(await providerStatuses(refresh));
    }),
    // Which programs the tools need are installed here; ?refresh=1 looks again (same-origin only, like /api/providers).
    "/api/tools/status": api(async (req) => {
      const site = req.headers.get("sec-fetch-site");
      const refresh = new URL(req.url).searchParams.has("refresh") && (!site || site === "same-origin" || site === "none");
      return Response.json(await toolStatus(refresh));
    }),
    // Asked by the composer while an image is attached: can the agents see it, and who reads it for them if not.
    "/api/vision": api(async () => Response.json(await visionStatus())),
    // The emoji picker's data, served from the local package instead of a CDN so Satgas works offline.
    "/api/emojibase/:locale/:file": api(async (req) => {
      const { locale, file } = req.params;
      if (locale !== "en" || (file !== "data.json" && file !== "messages.json")) return error(404, "Not found.");
      const data = Bun.file(new URL(import.meta.resolve(`emojibase-data/en/${file}`)));
      return new Response(data, { headers: { "content-type": "application/json", "cache-control": "public, max-age=604800" } });
    }),
    "/api/skills": {
      GET: api(async () => Response.json(await listSkills())),
      // A skill written in the Skills form.
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const problem = await saveOwnSkill(await req.json().catch(() => null));
        return problem ? error(400, problem) : new Response(null, { status: 201 });
      }),
    },
    "/api/skills/find": {
      // Looks skills up in a GitHub repo or in this machine's Claude Code and Codex folders; nothing is installed yet.
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { github?: unknown; local?: unknown };
        const found = body.local === true ? await findLocal() : await findOnGithub(body.github);
        return typeof found === "string" ? error(400, found) : Response.json(found);
      }),
    },
    "/api/skills/find-archive": {
      POST: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        const name = decodeURIComponent(req.headers.get("x-file-name") ?? "skill.zip");
        const found = await findInArchive(new Uint8Array(await req.arrayBuffer()), name);
        return typeof found === "string" ? error(400, found) : Response.json(found);
      }),
    },
    "/api/skills/install": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { stage?: unknown; names?: unknown };
        const problem = await installFound(body.stage, body.names);
        return problem ? error(400, problem) : new Response(null, { status: 204 });
      }),
    },
    "/api/skills/:name": {
      GET: api(async (req) => {
        const skill = await readSkill(req.params.name);
        return skill ? Response.json(skill) : error(404, "Skill not found.");
      }),
      // Edits a skill written here; the body may carry a new name.
      PUT: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const problem = await saveOwnSkill(await req.json().catch(() => null), req.params.name);
        return problem ? error(400, problem) : new Response(null, { status: 204 });
      }),
      PATCH: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
        if (typeof body.enabled !== "boolean") return error(400, "Say whether the skill is on.");
        const result = await setSkillEnabled(req.params.name, body.enabled);
        if (result === "builtin") return error(409, "Built-in skills are always on; Satgas relies on them.");
        return result === "ok" ? new Response(null, { status: 204 }) : error(404, "Skill not found.");
      }),
      DELETE: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        const result = await deleteSkill(req.params.name);
        if (result === "builtin") return error(409, "Built-in skills are part of Satgas and cannot be removed.");
        return result === "ok" ? new Response(null, { status: 204 }) : error(404, "Skill not found.");
      }),
    },
    // A skill's files for its Contents tab: the list, one file's text, or the whole folder as a zip.
    "/api/skills/:name/files": api(async (req) => {
      const files = await skillFiles(req.params.name);
      return files ? Response.json(files) : error(404, "Skill not found.");
    }),
    "/api/skills/:name/file": api(async (req) => {
      const file = await skillFile(req.params.name, new URL(req.url).searchParams.get("path"));
      return file ? Response.json(file) : error(404, "File not found.");
    }),
    "/api/skills/:name/zip": api(async (req) => {
      const zip = await skillZip(req.params.name);
      if (!zip) return error(404, "Skill not found.");
      return new Response(zip.buffer as ArrayBuffer, {
        headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${req.params.name}.zip"` },
      });
    }),
    "/api/search": api((req) => Response.json(searchRuns(new URL(req.url).searchParams.get("q")?.slice(0, 200) ?? ""))),
    "/api/update": {
      // ?check=1 asks GitHub now (same-origin only, like /api/providers).
      GET: api(async (req) => {
        const site = req.headers.get("sec-fetch-site");
        const force = new URL(req.url).searchParams.has("check") && (!site || site === "same-origin" || site === "none");
        return Response.json(await updateInfo({ force, busy: listRunIds().some(isLive) }));
      }),
      POST: api((req) => {
        if (!isTrusted(req)) return forbidden();
        const refused = startUpdate(listRunIds().some(isLive), (code) => void stop("Update", code));
        return refused ? error(409, refused) : new Response(null, { status: 202 });
      }),
    },
    "/api/repo": api(async () => Response.json({ url: `https://github.com/${config.repo}`, stars: await repoStars() })),
    "/api/runs": {
      GET: api(() => Response.json(listRuns())),
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; cwd?: unknown; attachments?: unknown; lang?: unknown };
        const lang = cleanLang(body.lang);
        const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT) : "";
        if (!prompt) return error(400, "The mission cannot be empty.");
        if (!taskAgents().length) return error(400, "Turn on at least one agent in Integrations.");
        if (typeof body.cwd === "string" && body.cwd.trim()) {
          const cwd = resolve(body.cwd.trim());
          const isDir = await stat(cwd).then(
            (s) => s.isDirectory(),
            () => false,
          );
          if (!isDir) return error(400, `Working folder not found: \`${cwd}\``);
          return Response.json(startRun(prompt, cwd, undefined, await claimUploads(body.attachments, cwd), lang), { status: 201 });
        }
        // No folder given: the board works in a fresh workspace of its own, named after it.
        const id = newRunId();
        const cwd = join(config.dataDir, "workspaces", id);
        await mkdir(cwd, { recursive: true });
        return Response.json(startRun(prompt, cwd, id, await claimUploads(body.attachments, cwd), lang), { status: 201 });
      }),
    },
    "/api/runs/:id": {
      GET: api((req) => {
        const run = getRun(req.params.id);
        return run ? Response.json(forPage(run)) : error(404, "Mission not found.");
      }),
      // Board details people can change themselves: its icon and its name.
      PATCH: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        if (!getRun(req.params.id)) return error(404, "Mission not found.");
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const patch: Partial<Run> = {};
        // Home organizing: pin, archive, snooze until a time (null wakes it), and read or unread.
        if ("pinned" in body) {
          if (typeof body.pinned !== "boolean") return error(400, "Say whether the board is pinned.");
          patch.pinned = body.pinned || undefined;
        }
        if ("archived" in body) {
          if (typeof body.archived !== "boolean") return error(400, "Say whether the board is archived.");
          Object.assign(patch, { archived: body.archived || undefined, ...(body.archived ? { pinned: undefined } : {}) });
        }
        if ("snoozedUntil" in body) {
          const until = body.snoozedUntil;
          if (until !== null && (typeof until !== "number" || !Number.isFinite(until) || until <= Date.now()))
            return error(400, "Snooze until a time that is still ahead.");
          patch.snoozedUntil = until ?? undefined;
        }
        if ("remember" in body) {
          if (typeof body.remember !== "boolean") return error(400, "Say whether Satgas may learn from this board.");
          patch.noMemory = body.remember ? undefined : true;
        }
        if ("seen" in body) {
          if (typeof body.seen !== "boolean") return error(400, "Say whether the board was seen.");
          Object.assign(patch, body.seen ? { seenAt: Date.now(), markedUnread: undefined } : { markedUnread: true });
        }
        if ("icon" in body) {
          const icon = cleanIcon(body.icon);
          if (icon === null) return error(400, "The icon must be a single emoji.");
          patch.icon = icon;
        }
        if ("title" in body) {
          const title = cleanTitle(body.title);
          if (!title) return error(400, "The name cannot be empty.");
          Object.assign(patch, { title, named: true });
        }
        if (!Object.keys(patch).length) return error(400, "Nothing to change.");
        patchRun(req.params.id, patch);
        return new Response(null, { status: 204 });
      }),
      DELETE: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        const doomed = getRun(req.params.id);
        if (!doomed) return error(404, "Mission not found.");
        // Deleting is for good: work still going is stopped first, then everything the board made goes with it. Only
        // Memory and Rules stay, and a folder the person picked keeps its files (it is their project).
        await stopRun(doomed.id);
        if (doomed.forkOf) await removeFork(doomed);
        await dropBoardBranches(doomed.forkOf?.repo ?? doomed.cwd, doomed.id);
        if (!(await deleteRun(doomed.id))) return error(404, "Mission not found.");
        await Promise.all([
          removeRunTrees(doomed.id),
          removeRunSecrets(doomed.id),
          removeHistory(doomed.id),
          dropBoardSchedules(doomed.id),
        ]);
        return new Response(null, { status: 204 });
      }),
    },
    // Chat sessions of a board: a new one starts a fresh conversation over the same canvas and folder.
    "/api/runs/:id/sessions": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const run = getRun(req.params.id);
        if (!run) return error(404, "Board not found.");
        if ((run.sessions?.length ?? 0) >= MAX_SESSIONS) return error(400, `A board holds up to ${MAX_SESSIONS} sessions.`);
        const body = (await req.json().catch(() => ({}))) as { title?: unknown };
        const title = typeof body.title === "string" ? body.title.trim().slice(0, SESSION_TITLE_MAX) : "";
        const session: ChatSession = { id: crypto.randomUUID().slice(0, 8), createdAt: Date.now(), ...(title ? { title } : {}) };
        patchRun(run.id, { sessions: [...(run.sessions ?? []), session] });
        return Response.json(session, { status: 201 });
      }),
    },
    "/api/runs/:id/sessions/:session": {
      PATCH: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const run = getRun(req.params.id);
        const own = run?.sessions?.find((s) => s.id === req.params.session);
        if (!run || !own) return error(404, "Session not found.");
        const body = (await req.json().catch(() => ({}))) as { title?: unknown; archived?: unknown };
        const next: ChatSession = { ...own };
        if (typeof body.title === "string") {
          const title = body.title.trim().slice(0, SESSION_TITLE_MAX);
          if (title) next.title = title;
          else delete next.title;
        }
        if (typeof body.archived === "boolean") {
          if (body.archived) next.archived = true;
          else delete next.archived;
        }
        patchRun(run.id, { sessions: run.sessions?.map((s) => (s.id === own.id ? next : s)) });
        return Response.json(next);
      }),
    },
    "/api/runs/:id/prompt": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as {
          prompt?: unknown;
          attachments?: unknown;
          lang?: unknown;
          cards?: unknown;
          session?: unknown;
        };
        const session = typeof body.session === "string" ? body.session.slice(0, 64) : undefined;
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) return error(400, "The prompt cannot be empty.");
        // Cards selected on the canvas when the message was sent.
        const cards = Array.isArray(body.cards) ? body.cards.filter((c): c is string => typeof c === "string").slice(0, 50) : [];
        if (!taskAgents().length) return error(400, "Turn on at least one agent in Integrations.");
        const run = getRun(req.params.id);
        if (!run) return error(404, "Board not found.");
        const files = await claimUploads(body.attachments, run.cwd);
        const text = prompt.slice(0, MAX_PROMPT);
        const lang = cleanLang(body.lang);
        // While the team works, the message waits in line instead of being turned away.
        if (isLive(run.id)) {
          queuePrompt(run.id, text, files, lang, undefined, cards, session);
          return Response.json({ ok: true, queued: true }, { status: 202 });
        }
        const result = continueRun(run.id, text, files, lang, [], undefined, cards, session);
        if (result === "missing") return error(404, "Board not found.");
        if (result === "busy") queuePrompt(run.id, text, files, lang, undefined, cards, session);
        return Response.json({ ok: true, queued: result === "busy" }, { status: 202 });
      }),
    },
    // The Memory page: what Satgas remembers about the person, their rules, and whether the lead saves on its own.
    "/api/memory": {
      GET: api(() => Response.json(getMemory())),
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const saved = await putEntry(await req.json().catch(() => null));
        return typeof saved === "string" ? error(400, saved) : Response.json(saved, { status: 201 });
      }),
      PATCH: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { auto?: unknown };
        if (typeof body.auto !== "boolean") return error(400, "Say whether the lead saves memory on its own.");
        await setAuto(body.auto);
        return Response.json(getMemory());
      }),
    },
    "/api/memory/:id": {
      PUT: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const saved = await putEntry(await req.json().catch(() => null), req.params.id);
        return typeof saved === "string" ? error(400, saved) : Response.json(saved);
      }),
      DELETE: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        return (await deleteEntry(req.params.id)) ? new Response(null, { status: 204 }) : error(404, "That entry no longer exists.");
      }),
    },
    "/api/runs/:id/memory/:round/undo": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const round = Number(req.params.round);
        if (!Number.isInteger(round) || round < 0) return error(400, "Unknown round.");
        const problem = await undoMemory(req.params.id, round);
        return problem ? error(409, problem) : new Response(null, { status: 204 });
      }),
    },
    "/api/schedules": {
      GET: api(() =>
        Response.json({
          schedules: listSchedules().map((s) => ({ ...maskSchedule(s), nextRunAt: nextRun(s) })),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          hookBase: `${config.publicUrl ?? `http://localhost:${server.port}`}/hooks/`,
        }),
      ),
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const saved = await saveSchedule(await req.json().catch(() => null));
        return typeof saved === "string" ? error(400, saved) : Response.json(maskSchedule(saved), { status: 201 });
      }),
    },
    "/api/schedules/:id": {
      PUT: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const saved = await saveSchedule(await req.json().catch(() => null), req.params.id);
        return typeof saved === "string" ? error(400, saved) : Response.json(maskSchedule(saved));
      }),
      DELETE: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        return (await deleteSchedule(req.params.id)) ? new Response(null, { status: 204 }) : error(404, "Schedule not found.");
      }),
    },
    "/api/schedules/:id/run": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const s = getSchedule(req.params.id);
        if (!s) return error(404, "Schedule not found.");
        const problem = await runSchedule(s);
        return problem ? error(409, problem) : Response.json({ boardId: getSchedule(s.id)?.lastBoardId }, { status: 202 });
      }),
    },
    // Another service calls this; the token in the URL (and the signature, when set) is the only key.
    "/hooks/:token": {
      POST: open(async (req) => {
        const r = await receiveWebhook(req.params.token, req);
        return Response.json({ result: r.text }, { status: r.status });
      }),
    },
    // Pull requests on the board: link one by URL, watch or stop watching it, or unlink it.
    "/api/runs/:id/pulls": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { url?: unknown };
        const pull = linkPull(req.params.id, typeof body.url === "string" ? body.url.slice(0, 300) : "", true);
        if (typeof pull === "string") return error(400, pull);
        const run = getRun(req.params.id);
        if (run) void checkPull(run, pull);
        return Response.json(pull, { status: 201 });
      }),
      PATCH: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { repo?: unknown; number?: unknown; watch?: unknown };
        if (typeof body.repo !== "string" || typeof body.number !== "number" || typeof body.watch !== "boolean")
          return error(400, "Name the pull request and whether to watch it.");
        // Watching again gives the fix rounds a fresh start.
        const patch = body.watch ? { watch: true, fixes: 0 } : { watch: false };
        return updatePull(req.params.id, body.number, body.repo, patch)
          ? new Response(null, { status: 204 })
          : error(404, "Pull request not found.");
      }),
      DELETE: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { repo?: unknown; number?: unknown };
        if (typeof body.repo !== "string" || typeof body.number !== "number") return error(400, "Name the pull request.");
        return updatePull(req.params.id, body.number, body.repo, null)
          ? new Response(null, { status: 204 })
          : error(404, "Pull request not found.");
      }),
    },
    // A whole review in one patch: every file the board, one round or one task changed, with who changed it.
    "/api/runs/:id/patch": api(async (req) => {
      const run = getRun(req.params.id);
      if (!run) return error(404, "Board not found.");
      const q = new URL(req.url).searchParams;
      const scope = q.get("scope") ?? "board";
      const round = Number(q.get("round"));
      const tasks = run.nodes
        .filter((n) => n.changes?.before && n.changes.files.length)
        .filter((n) => (scope === "node" ? n.id === q.get("node") : scope === "round" ? (n.round ?? 0) === round : true))
        .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
      const first = tasks[0];
      if (!first?.changes?.before) return Response.json({ patch: "", cut: false, files: [] });
      const owners = new Map<string, string>();
      for (const n of tasks) for (const f of n.changes?.files ?? []) owners.set(f.path, n.id);
      const one = scope === "node" ? first.changes : undefined;
      const to = one?.after ?? null;
      const r = await patchBetween(run, first.changes.before, to, [...owners.keys()]);
      if (!r) return error(500, "The changes could not be read.");
      return Response.json({
        ...r,
        from: first.changes.before,
        to: to ?? "now",
        files: [...owners].map(([path, node]) => ({ path, node })),
      });
    }),
    // One side of a reviewed file in full, for unfolding unchanged lines: a checkpoint, or `now` for the folder.
    "/api/runs/:id/blob": api(async (req) => {
      const run = getRun(req.params.id);
      if (!run) return error(404, "Board not found.");
      const q = new URL(req.url).searchParams;
      const text = await fileAt(run, q.get("rev") ?? "", q.get("path") ?? "");
      return text === null
        ? error(404, "File not found.")
        : new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }),
    "/api/runs/:id/revert": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const run = getRun(req.params.id);
        if (!run) return error(404, "Board not found.");
        if (isLive(run.id)) return error(409, "Wait for the team to finish before undoing changes.");
        const body = (await req.json().catch(() => ({}))) as { node?: unknown; paths?: unknown; force?: unknown };
        const node = run.nodes.find((n) => n.id === body.node);
        if (!node?.changes) return error(404, "No changes recorded for that task.");
        const paths = Array.isArray(body.paths)
          ? body.paths.filter((p): p is string => typeof p === "string")
          : node.changes.files.map((f) => f.path);
        const result = await revertTask(run, node.changes, paths, body.force === true);
        if (typeof result === "string") return error(409, result);
        if (result.reverted.length)
          patchNode(run.id, node.id, { changes: { ...node.changes, reverted: [...(node.changes.reverted ?? []), ...result.reverted] } });
        return Response.json(result, { status: result.changedSince.length && !result.reverted.length ? 409 : 200 });
      }),
    },
    "/api/runs/:id/git": api(async (req) => {
      const run = getRun(req.params.id);
      return run ? Response.json(await gitInfo(run.cwd)) : error(404, "Board not found.");
    }),
    // A kept task branch: merge it by hand, hand it to the team to resolve, or delete it.
    "/api/runs/:id/git/:action": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const run = getRun(req.params.id);
        if (!run) return error(404, "Board not found.");
        const body = (await req.json().catch(() => ({}))) as { branch?: unknown };
        const branch = typeof body.branch === "string" ? body.branch.slice(0, 200) : "";
        const clear = () => {
          for (const n of run.nodes) if (n.branch === branch) patchNode(run.id, n.id, { branch: undefined });
        };
        if (req.params.action === "merge") {
          if (isLive(run.id)) return error(409, "Wait for the team to finish before merging.");
          const r = await mergeBranch(run.cwd, branch);
          if (typeof r === "string") return error(409, r);
          if (r) return Response.json(r, { status: 409 });
          clear();
          return new Response(null, { status: 204 });
        }
        if (req.params.action === "drop") {
          const problem = await dropBranch(run.cwd, branch);
          if (problem) return error(409, problem);
          clear();
          return new Response(null, { status: 204 });
        }
        if (req.params.action === "handoff") {
          if (!branch.startsWith("satgas/")) return error(400, "Only branches Satgas made can be handed to the team.");
          followUp(
            run.id,
            `Merge the git branch ${branch} into the current branch of the working folder. Resolve any conflicts so both sides' intent survives, run the checks the project has, and commit the merge.`,
          );
          return Response.json({ ok: true }, { status: 202 });
        }
        return error(404, "Unknown action.");
      }),
    },
    // A copy of the board and its folder to try another direction in.
    "/api/runs/:id/fork": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        if (isLive(req.params.id)) return error(409, "Wait for the team to finish, or stop it, before forking.");
        const forked = await forkRun(req.params.id);
        return typeof forked === "string" ? error(404, forked) : Response.json(forPage(forked), { status: 201 });
      }),
    },
    // What a fork changed goes back into the board it came from.
    "/api/runs/:id/merge": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const run = getRun(req.params.id);
        if (!run?.forkOf) return error(404, "This board is not a fork.");
        if (isLive(run.id) || isLive(run.forkOf.id)) return error(409, "Wait for both boards to finish before merging.");
        const result = await mergeBack(run.id);
        return typeof result === "string" ? error(409, result) : Response.json(result);
      }),
    },
    // The person's answers to the questions the planner asked before planning.
    "/api/runs/:id/answers": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { answers?: unknown };
        const result = answerRun(req.params.id, body.answers);
        if (result === "missing") return error(404, "Board not found.");
        if (result === "busy") return error(409, "Agents are still working on this board.");
        if (result === "closed") return error(409, "These questions were already answered or set aside.");
        if (result === "invalid") return error(400, "Answer every question with an option or your own words.");
        return Response.json({ ok: true }, { status: 202 });
      }),
    },
    // The board's workspace files, for pointing at one with @ in the composer.
    "/api/runs/:id/tree": api(async (req) => {
      const run = getRun(req.params.id);
      return run ? Response.json(await workspaceTree(run.cwd)) : error(404, "Board not found.");
    }),
    "/api/runs/:id/board": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => null)) as { ops?: unknown; origin?: unknown } | null;
        const ops = sanitizeOps(body?.ops);
        if (!ops) return error(400, "The board change was malformed.");
        const origin = typeof body?.origin === "string" ? body.origin.slice(0, 64) : undefined;
        const before = getRun(req.params.id)?.board;
        if (!boardOps(req.params.id, ops, origin)) return error(404, "Board not found.");
        // A trigger card is its schedule on the canvas: deleting the card deletes the schedule.
        for (const o of ops) {
          const gone = o.op === "delete" ? before?.cards.find((c) => c.id === o.id) : undefined;
          if (gone?.kind === "widget" && gone.widget === "trigger" && gone.ref && getSchedule(gone.ref)?.boardId === req.params.id)
            await deleteSchedule(gone.ref);
        }
        // Only changes made by hand come through here; they are what the lead hears about at the next message.
        const run = getRun(req.params.id);
        const events = describeOps(before ?? { cards: [], links: [], moved: {} }, ops);
        if (run && events.length) patchRun(run.id, { canvasLog: mergeEvents(run.canvasLog ?? [], events) });
        return new Response(null, { status: 204 });
      }),
    },
    // A file attached to a prompt that hasn't been sent yet; the prompt claims it by id.
    "/api/uploads": {
      POST: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        const staged = await stageUpload(req);
        return "id" in staged ? Response.json(staged, { status: 201 }) : error(staged.status, staged.error);
      }),
    },
    "/api/runs/:id/assets": {
      POST: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        if (!getRun(req.params.id)) return error(404, "Board not found.");
        const saved = await saveImage(req.params.id, req);
        return "src" in saved ? Response.json(saved, { status: 201 }) : error(saved.status, saved.error);
      }),
    },
    "/api/runs/:id/assets/:name": api((req) => serveAsset(req.params.id, req.params.name)),
    // Opened by the signed-in page, or through `~<key>/` for sandboxed previews, which can't send the cookie.
    "/api/runs/:id/files/*": open((req) => {
      const run = getRun(req.params.id);
      if (!run) return authorized(req) ? error(404, "Board not found.") : signInFirst();
      const prefix = `/api/runs/${req.params.id}/files/`;
      let path = new URL(req.url).pathname.slice(prefix.length);
      const keyed = /^~([A-Za-z0-9_-]+)\/(.*)$/.exec(path);
      if (keyed) {
        if (!validFileKey(run.id, keyed[1] ?? "")) return signInFirst();
        path = keyed[2] ?? "";
      } else if (!authorized(req)) return signInFirst();
      const rel = decodePath(path);
      return rel === null ? error(404, "Not found.") : serveWorkFile(run.cwd, rel);
    }),
    "/api/pipeline": api(() => Response.json(listLanes())),
    "/api/runs/:id/queue/:item": {
      // A new wording, or a new place in line (before another message, or last with before null).
      PATCH: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; before?: unknown };
        const { id, item } = req.params;
        const ok =
          typeof body.prompt === "string"
            ? editQueued(id, item, body.prompt.slice(0, MAX_PROMPT))
            : "before" in body && (body.before === null || typeof body.before === "string")
              ? moveQueued(id, item, body.before ?? undefined)
              : null;
        if (ok === null) return error(400, "Send a new prompt or where to move the message.");
        return ok ? new Response(null, { status: 204 }) : error(409, "That message already reached the team.");
      }),
      DELETE: api((req) => {
        if (!isTrusted(req)) return forbidden();
        return unqueuePrompt(req.params.id, req.params.item)
          ? new Response(null, { status: 204 })
          : error(409, "That message already reached the team.");
      }),
    },
    // The person's answer to a secret an agent asked for; the value goes to a private file and never comes back.
    "/api/runs/:id/secrets/:ask": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { value?: unknown; decline?: unknown };
        const problem = await answerSecret(req.params.id, req.params.ask, body.value, body.decline === true);
        return problem ? error(409, problem) : new Response(null, { status: 204 });
      }),
      DELETE: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        return (await forgetSecret(req.params.id, req.params.ask))
          ? new Response(null, { status: 204 })
          : error(404, "That secret is already gone.");
      }),
    },
    "/api/runs/:id/edits/:round/undo": {
      POST: api((req) => {
        if (!isTrusted(req)) return forbidden();
        const round = Number(req.params.round);
        if (!Number.isInteger(round) || round < 0) return error(400, "Unknown round.");
        const result = undoEdit(req.params.id, round);
        if (result === "missing") return error(404, "There is no board change to undo.");
        if (result === "done") return error(409, "This change was already undone.");
        return new Response(null, { status: 204 });
      }),
    },
    // A task's team connector calls back here; its own token is the only key it needs.
    "/api/team/:op": {
      POST: open(async (req) => {
        const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
        const r = await teamCall(token, req.params.op, body);
        return r.ok ? Response.json({ text: r.text }) : Response.json({ error: r.error }, { status: 400 });
      }),
    },
    // Picks one stopped task back up, in its own session when it has one.
    // The person's Allow or No for a task the lead held because it is hard to undo.
    "/api/runs/:id/tasks/:node/approve": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { allow?: unknown };
        if (typeof body.allow !== "boolean") return error(400, "Say whether the task may run.");
        if (approveTask(req.params.id, req.params.node, body.allow) === "missing") return error(409, "That task is no longer waiting.");
        return new Response(null, { status: 204 });
      }),
    },
    "/api/runs/:id/tasks/:node/continue": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { prompt?: unknown };
        const result = continueTask(req.params.id, req.params.node, typeof body.prompt === "string" ? body.prompt : undefined);
        if (result === "missing") return error(404, "Task not found.");
        if (result === "busy") return error(409, "Agents are still working on this board.");
        if (result === "running") return error(409, "This task is still running.");
        return Response.json({ ok: true }, { status: 202 });
      }),
    },
    "/api/runs/:id/setup/:round/undo": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const round = Number(req.params.round);
        if (!Number.isInteger(round) || round < 0) return error(400, "Unknown round.");
        const problem = await undoSetup(req.params.id, round);
        return problem ? error(409, problem) : new Response(null, { status: 204 });
      }),
    },
    // The person's Allow or Skip on a setup change that runs code from outside Satgas.
    "/api/runs/:id/setup/:round/:index": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const round = Number(req.params.round);
        const index = Number(req.params.index);
        if (!Number.isInteger(round) || round < 0 || !Number.isInteger(index) || index < 0) return error(400, "Unknown change.");
        const body = (await req.json().catch(() => null)) as { allow?: unknown } | null;
        if (typeof body?.allow !== "boolean") return error(400, "Say allow true or false.");
        const problem = await decideSetup(req.params.id, round, index, body.allow);
        return problem ? error(409, problem) : new Response(null, { status: 204 });
      }),
    },
    "/api/runs/:id/cancel": {
      POST: api((req) => {
        if (!isTrusted(req)) return forbidden();
        return cancelRun(req.params.id) ? Response.json({ ok: true }) : error(409, "This mission is not running.");
      }),
    },
  },
  fetch(req, srv) {
    if (!allowedHost(req)) return misdirected();
    const { pathname } = new URL(req.url);
    if (pathname !== "/ws") return serveWeb(pathname);
    if (!isTrusted(req, false)) return forbidden();
    if (!authorized(req)) return signInFirst();
    return srv.upgrade(req, { data: { watching: null } }) ? undefined : error(400, "WebSocket upgrade failed.");
  },
  websocket: {
    open(ws) {
      ws.subscribe("runs");
    },
    message(ws, raw) {
      const msg = parse(String(raw));
      // The Pipeline page follows every board's lane while it is open.
      if (msg?.type === "pipeline") {
        if (msg.on) ws.subscribe("pipeline");
        else ws.unsubscribe("pipeline");
        return;
      }
      if (msg?.type !== "watch") return;
      if (ws.data.watching) ws.unsubscribe(topicOf(ws.data.watching));
      ws.data.watching = msg.runId;
      const run = msg.runId ? getRun(msg.runId) : undefined;
      if (!run) return;
      ws.subscribe(topicOf(run.id));
      send(ws, { type: "snapshot", run: forPage(run), logs: getLogs(run.id) });
    },
  },
});

setPublisher((topic, event) => server.publish(topic, JSON.stringify(event)));

const publicHost = config.publicUrl ? new URL(config.publicUrl).host.toLowerCase() : null;

// DNS rebinding makes a hostile page same-origin with Satgas under its own name; only this machine's names and the
// configured public address are answered.
function allowedHost(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const name = host.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || host === publicHost;
}

const misdirected = () => new Response("Satgas only answers requests addressed to this machine or to SATGAS_PUBLIC_URL.", { status: 421 });

const signInFirst = () => Response.json({ error: "Sign in to Satgas first.", signIn: true }, { status: 401 });

// Every API route: addressed to this machine or its public name, from a signed-in browser or script.
function api<R extends Request, A extends unknown[]>(handler: (req: R, ...rest: A) => Response | Promise<Response>) {
  return (req: R, ...rest: A) => (!allowedHost(req) ? misdirected() : authorized(req) ? handler(req, ...rest) : signInFirst());
}

// Routes that work before signing in (the sign-in itself) or check access themselves.
function open<R extends Request, A extends unknown[]>(handler: (req: R, ...rest: A) => Response | Promise<Response>) {
  return (req: R, ...rest: A) => (allowedHost(req) ? handler(req, ...rest) : misdirected());
}

// What the page gets for a board: the run plus its preview key and whether deleting it removes its files too.
const forPage = (run: Run) => ({ ...run, fileKey: fileKey(run.id), ownWorkspace: ownWorkspace(run.cwd) });

// Pages allowed to call the API: this server's own, the public address, and in development the Vite server in front.
// Any other local port may be a page an agent is serving.
const trustedOrigins = new Set([
  ...(isProd ? [server.port] : [server.port, config.webPort]).flatMap((port) =>
    ["localhost", "127.0.0.1", "[::1]"].map((host) => `http://${host}:${port}`),
  ),
  ...(config.publicUrl ? [new URL(config.publicUrl).origin] : []),
]);

// Blocks cross-site requests: a foreign Origin is refused outright, and a JSON content type (exactly that, since
// `text/plain; application/json` still counts as a simple type) forces a CORS preflight we never answer.
function isTrusted(req: Request, requireJson = true): boolean {
  const origin = req.headers.get("origin");
  if (origin && !trustedOrigins.has(origin)) return false;
  return !requireJson || (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

const forbidden = () => error(403, "Request refused.");

function parse(raw: string): ClientMessage | undefined {
  try {
    return JSON.parse(raw) as ClientMessage;
  } catch {
    return undefined;
  }
}

function send(ws: ServerWebSocket<SocketData>, event: ServerEvent) {
  ws.send(JSON.stringify(event));
}

let stopping = false;
async function stop(signal: string, code = 0) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal}: stopping agents and saving missions…`);
  await shutdown();
  await stopChannels();
  await flushAll();
  server.stop(true);
  process.exit(code);
}

// `bun --hot` re-runs this file, so the signal handlers are added once and always call the latest stop().
const hot = globalThis as typeof globalThis & { __satgasStop?: (signal: string) => void };
if (!hot.__satgasStop) {
  process.on("SIGINT", () => hot.__satgasStop?.("SIGINT"));
  process.on("SIGTERM", () => hot.__satgasStop?.("SIGTERM"));
}
hot.__satgasStop = (signal) => void stop(signal);

const pageUrl = config.publicUrl ?? `http://localhost:${isProd ? server.port : config.webPort}`;
console.log(isProd ? `Satgas is ready at ${pageUrl}` : `Satgas API on http://localhost:${server.port}; open the UI at ${pageUrl}`);
console.log(tokenFromEnv ? "Sign in with the token in SATGAS_TOKEN." : `Sign in once per browser: ${signInLink(pageUrl)}`);
