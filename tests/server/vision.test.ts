import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";
import { config } from "../../src/server/config";
import { buildNodePrompt, workingRules } from "../../src/server/prompt";
import { defaultSettings } from "../../src/server/settings";
import { canSee, probeVision, readerCandidates, sawProbe, seeAttachments, seeImage, withSight } from "../../src/server/vision";
import type { Settings } from "../../src/shared/settings";
import type { NodeState, ProviderStatus, Run } from "../../src/shared/types";
import { collector, jsonl, makeFakeCli, setFake } from "../helpers/fake-cli";

// A stand-in model endpoint: "seer" names the probe's colours when it gets the image, "blind" cannot, "refuser" rejects
// images outright and "flaky" is down.
let server: Server<undefined>;
const hits: Record<string, number> = {};
let dir = "";
let fake = { bin: "", dir: "" };
const original = { dataDir: config.dataDir, claudeBin: config.claudeBin, lean: config.leanAgents };
const g = globalThis as { __satgasSettings?: Settings; __satgasProviders?: unknown; __satgasSight?: unknown };
const saved = { settings: g.__satgasSettings, providers: g.__satgasProviders };

const answer = (model: string, sawImage: boolean): Response => {
  hits[model] = (hits[model] ?? 0) + 1;
  if (model.startsWith("refuser")) return Response.json({ error: { message: "image input is not supported" } }, { status: 400 });
  if (model.startsWith("flaky")) return new Response("down", { status: 503 });
  if (model.startsWith("missing")) return Response.json({ code: "InvalidParameter", message: "Model not exist." }, { status: 400 });
  return Response.json({ text: model.startsWith("seer") && sawImage ? "Red green" : "I can't see images, maybe blue and yellow" });
};

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = (await req.json()) as { model: string; messages: { content: { type: string }[] }[] };
      const parts = body.messages[0]?.content ?? [];
      const res = answer(
        body.model,
        parts.some((p) => p.type === "image" || p.type === "image_url"),
      );
      if (!res.ok) return res;
      const { text } = (await res.json()) as { text: string };
      return new URL(req.url).pathname.endsWith("/chat/completions")
        ? Response.json({ choices: [{ message: { content: text } }] })
        : Response.json({ content: [{ type: "text", text }] });
    },
  });
  dir = await mkdtemp(join(tmpdir(), "satgas-vision-"));
  fake = await makeFakeCli();
  config.claudeBin = fake.bin;
});

afterAll(async () => {
  server.stop(true);
  Object.assign(config, original);
  g.__satgasSettings = saved.settings;
  g.__satgasProviders = saved.providers;
  g.__satgasSight = undefined;
  await rm(dir, { recursive: true, force: true });
  await rm(fake.dir, { recursive: true, force: true });
});

const base = () => `http://127.0.0.1:${server.port}`;

function useSettings(claude: { provider: Settings["agents"]["claude"]["provider"]; model: string }) {
  const s = defaultSettings();
  s.agents.claude = { ...s.agents.claude, ...claude };
  s.agents.codex = { ...s.agents.codex, tasks: false };
  s.providers = { deepseek: { key: "k", baseUrl: `${base()}/anthropic` }, openai: { key: "k", baseUrl: `${base()}/v1` } };
  g.__satgasSettings = s;
  return s;
}

beforeEach(async () => {
  for (const k of Object.keys(hits)) delete hits[k];
  config.dataDir = await mkdtemp(join(dir, "data-"));
  g.__satgasSight = undefined;
});

describe("seeing the probe", () => {
  test("two colours named right is seeing; anything else is a guess", () => {
    expect(sawProbe("Red green")).toBe(true);
    expect(sawProbe("red, green.")).toBe(true);
    expect(sawProbe("I cannot see images")).toBe(false);
    expect(sawProbe("red blue")).toBe(false);
  });

  test("asks Anthropic-style and OpenAI-style endpoints with the image, and tells the outcomes apart", async () => {
    const cfg = { key: "k", baseUrl: `${base()}/anthropic` };
    expect(await probeVision("deepseek", cfg, "seer")).toBe(true);
    expect(await probeVision("deepseek", cfg, "blind")).toBe(false);
    expect(await probeVision("deepseek", cfg, "refuser")).toBe(false);
    expect(await probeVision("deepseek", cfg, "flaky")).toBeNull();
    expect(await probeVision("deepseek", cfg, "missing")).toBeNull();
    expect(await probeVision("openai", { key: "k", baseUrl: `${base()}/v1` }, "seer-gpt")).toBe(true);
  });
});

describe("who can see", () => {
  test("Claude and Codex sign-ins see without being asked", async () => {
    useSettings({ provider: "claude", model: "" });
    expect(await canSee("claude", "")).toBe(true);
    expect(await canSee("codex", "")).toBe(true);
    expect(Object.keys(hits)).toHaveLength(0);
  });

  test("a gateway model is asked once, and the answer is kept in the data folder", async () => {
    useSettings({ provider: "deepseek", model: "blind" });
    expect(await canSee("deepseek", "blind")).toBe(false);
    expect(await canSee("deepseek", "blind")).toBe(false);
    expect(hits.blind).toBe(1);
    const kept = JSON.parse(await readFile(join(config.dataDir, "vision.json"), "utf8")) as Record<string, boolean>;
    expect(Object.values(kept)).toEqual([false]);
  });

  test("when the endpoint cannot answer, only the model's name decides, and nothing is kept", async () => {
    useSettings({ provider: "deepseek", model: "flaky" });
    expect(await canSee("deepseek", "flaky")).toBe(false);
    expect(await canSee("deepseek", "flaky-vl")).toBe(true);
    expect(await canSee("deepseek", "flaky")).toBe(false);
    expect(hits.flaky).toBe(2);
  });
});

describe("readers", () => {
  test("strongest first, newest version, frontier models only; local servers and failed providers never read", () => {
    const readers = readerCandidates([
      ok("ollama", ["llava"]),
      ok("openai", ["gpt-4o", "gpt-5", "gpt-5.1", "gpt-5-mini"]),
      { kind: "zai", state: "failed", models: [] },
      ok("claude"),
    ]);
    expect(readers.map((r) => `${r.kind}:${r.model}`)).toEqual(["claude:opus", "openai:gpt-5.1"]);
  });
});

describe("describing attached images", () => {
  const run = (images: string[], notes: Run["imageNotes"] = {}): Run => ({
    id: "r",
    prompt: "What does the chart show?",
    cwd: dir,
    status: "running",
    createdAt: 1,
    nodes: [],
    files: { 0: images },
    imageNotes: notes,
  });
  const node: NodeState = {
    id: "t",
    title: "Read the chart",
    role: "analyst",
    task: "Answer",
    agent: "claude",
    dependsOn: [],
    x: 0,
    y: 0,
    status: "pending",
  };

  async function workspace() {
    const cwd = await mkdtemp(join(dir, "ws-"));
    await mkdir(join(cwd, "attachments"));
    await Bun.write(join(cwd, "attachments/chart.png"), new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
    return cwd;
  }

  test("a model that can see gets nothing extra", async () => {
    useSettings({ provider: "claude", model: "" });
    const cwd = await workspace();
    const sight = await seeAttachments(cwd, ["attachments/chart.png"], {}, new AbortController().signal, collector().onLog);
    expect(sight).toEqual({ blind: { claude: false, codex: false }, notes: {}, texts: {} });
  });

  test("for a blind model the strongest reader describes the image next to it, once per picture", async () => {
    const s = useSettings({ provider: "deepseek", model: "blind" });
    g.__satgasProviders = { at: Date.now(), key: JSON.stringify(s.providers), list: [ok("claude"), ok("deepseek")] };
    const args = join(dir, "args.json");
    setFake({
      FAKE_CLI_ARGS_OUT: args,
      FAKE_CLI_OUTPUT: jsonl({ type: "result", subtype: "success", result: "A bar chart of monthly sales: Jan 120, Feb 98." }),
    });
    const cwd = await workspace();
    const { logs, onLog } = collector();
    const sight = await seeAttachments(cwd, ["attachments/chart.png"], {}, new AbortController().signal, onLog);
    expect(sight.blind.claude).toBe(true);
    expect(sight.notes["attachments/chart.png"]).toMatchObject({ file: "attachments/chart.png.md" });
    expect(sight.texts["attachments/chart.png"]).toContain("Jan 120");
    expect(await readFile(join(cwd, "attachments/chart.png.md"), "utf8")).toContain("A bar chart of monthly sales");
    expect(logs.some((l) => l.kind === "info" && /reading the attached image/.test(l.text))).toBe(true);
    const argv = JSON.parse(await readFile(args, "utf8")) as string[];
    expect(argv).toContain("opus");
    expect(argv.slice(argv.indexOf("--tools"), argv.indexOf("--tools") + 2)).toEqual(["--tools", "Read"]);

    // The same picture on another board is not read again.
    setFake({ FAKE_CLI_OUTPUT: jsonl({ type: "result", subtype: "success", result: "something else" }) });
    const other = await workspace();
    const again = await seeAttachments(other, ["attachments/chart.png"], {}, new AbortController().signal, onLog);
    expect(again.texts["attachments/chart.png"]).toContain("Jan 120");
  });

  test("with no strong reader connected, the image is marked unread instead of guessed", async () => {
    const s = useSettings({ provider: "deepseek", model: "blind" });
    g.__satgasProviders = { at: Date.now(), key: JSON.stringify(s.providers), list: [ok("deepseek"), ok("ollama", ["llava"])] };
    const cwd = await workspace();
    const sight = await seeAttachments(cwd, ["attachments/chart.png"], {}, new AbortController().signal, collector().onLog);
    expect(sight.notes["attachments/chart.png"]?.error).toMatch(/No strong vision model/);
  });

  test("a blind agent's prompt points at the description, or says plainly that it could not see", () => {
    const described = buildNodePrompt(
      run(["attachments/chart.png"], { "attachments/chart.png": { file: "attachments/chart.png.md", by: "Claude Opus" } }),
      node,
      1000,
      true,
    );
    expect(described).toContain("attachments/chart.png.md describes it in full, written by Claude Opus");
    const unread = buildNodePrompt(
      run(["attachments/chart.png"], { "attachments/chart.png": { error: "No strong vision model is connected" } }),
      node,
      1000,
      true,
    );
    expect(unread).toContain("Do not guess what it shows");
    const seeing = buildNodePrompt(run(["attachments/chart.png"]), node, 1000, false);
    expect(seeing).toContain("- attachments/chart.png\n");
    expect(workingRules(false)).toContain("Never say what a file, page or image contains without opening it");
    expect(buildNodePrompt({ ...run([]), lang: "id-ID" }, node, 1000)).toContain("when unclear, Indonesian, the person's browser language");
  });
});

function ok(kind: ProviderStatus["kind"], ids: string[] = []): ProviderStatus {
  return { kind, state: "ok", models: ids.map((id) => ({ id, name: id })) };
}

test("a picture an agent opens mid-task must be a real image file before any reader is asked", async () => {
  const signal = new AbortController().signal;
  expect(await seeImage("shot.png", "/w", signal)).toEqual({ error: "Give the full path of a .png, .jpg, .gif or .webp file." });
  expect(await seeImage("/w/notes.md", "/w", signal)).toEqual({ error: "Give the full path of a .png, .jpg, .gif or .webp file." });
  expect(await seeImage("/satgas-no-such-dir/shot.png", "/w", signal)).toEqual({
    error: "There is no file at /satgas-no-such-dir/shot.png.",
  });
});

test("the picker learns what a probe found for models whose provider never said, without probing anything new", async () => {
  const before = config.dataDir;
  const tmp = await mkdtemp(join(tmpdir(), "satgas-sight-"));
  config.dataDir = tmp;
  try {
    await Bun.write(join(tmp, "vision.json"), JSON.stringify({ "groq|https://api.groq.com/openai/v1|blind-model": false }));
    const [groq, codex] = await withSight([
      {
        kind: "groq",
        state: "ok",
        models: [
          { id: "blind-model", name: "Blind" },
          { id: "never-probed", name: "New" },
          { id: "said", name: "Said", vision: true },
        ],
      },
      { kind: "codex", state: "ok", models: [{ id: "gpt-x", name: "GPT" }] },
    ]);
    expect(groq?.models.map((m) => m.vision)).toEqual([false, undefined, true]);
    expect(codex?.models[0]?.vision).toBe(true);
  } finally {
    config.dataDir = before;
    await rm(tmp, { recursive: true, force: true });
  }
});
