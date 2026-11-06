import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { isLive } from "../../src/server/orchestrator";
import { checkPull, detectPulls, feedbackOf, type GhRunner, linkPull, MAX_FIXES, pullsIn, readChecks } from "../../src/server/pulls";
import { createRun, flushAll, getRun, patchRun } from "../../src/server/store";
import { jsonl, makeFakeCli, setFake } from "../helpers/fake-cli";

const original = { dataDir: config.dataDir, bin: config.claudeBin };
let dir = "";
let cli = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-pulls-"));
  await mkdir(join(dir, "runs"), { recursive: true });
  config.dataDir = dir;
  const fake = await makeFakeCli();
  cli = fake.dir;
  config.claudeBin = fake.bin;
  // A round the watch starts is answered by the lead straight away, with no tasks.
  setFake({
    FAKE_CLI_OUTPUT: jsonl({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "",
      structured_output: { title: "t", summary: "s", reply: "On it", nodes: [] },
    }),
  });
});
afterAll(async () => {
  await flushAll();
  config.dataDir = original.dataDir;
  config.claudeBin = original.bin;
  await rm(dir, { recursive: true, force: true });
  await rm(cli, { recursive: true, force: true });
});

async function settled(id: string) {
  for (let i = 0; i < 400 && isLive(id); i++) await Bun.sleep(10);
}

test("pull request links are found once each, in any text", () => {
  const text =
    "Opened https://github.com/acme/web/pull/12 and see https://github.com/acme/web/pull/12/files, also https://github.com/acme/api/pull/3.";
  expect(pullsIn(text)).toEqual([
    { url: "https://github.com/acme/web/pull/12", repo: "acme/web", number: 12 },
    { url: "https://github.com/acme/api/pull/3", repo: "acme/api", number: 3 },
  ]);
});

test("checks read as failing, pending, passing or none", () => {
  expect(readChecks([])).toEqual({ checks: "none", failed: [] });
  expect(
    readChecks([
      { name: "test", status: "COMPLETED", conclusion: "FAILURE" },
      { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
    ]),
  ).toEqual({
    checks: "failing",
    failed: ["test"],
  });
  expect(readChecks([{ name: "test", status: "IN_PROGRESS" }]).checks).toBe("pending");
  expect(readChecks([{ context: "ci", state: "SUCCESS" }]).checks).toBe("passing");
});

test("feedback counts people only, never the author or bots", () => {
  const pr = {
    number: 1,
    title: "",
    state: "OPEN",
    mergeable: "MERGEABLE",
    headRefOid: "a",
    author: { login: "me" },
    comments: [
      { author: { login: "me" }, body: "self note" },
      { author: { login: "vercel[bot]" }, body: "Preview ready" },
      { author: { login: "ana" }, body: "Rename this" },
    ],
    reviews: [{ author: { login: "budi" }, state: "CHANGES_REQUESTED", body: "" }],
  };
  expect(feedbackOf(pr)).toEqual([
    { who: "ana", text: "Rename this" },
    { who: "budi", text: "Requested changes." },
  ]);
});

const ghWith =
  (pr: object): GhRunner =>
  async () => ({ ok: true, out: JSON.stringify(pr), err: "" });
const base = { number: 7, title: "Add billing", state: "OPEN", mergeable: "MERGEABLE", author: { login: "me" }, reviews: [] };

test("a failed check starts one round per head commit, and feedback from before the link is left alone", async () => {
  const run = createRun("ship it", dir);
  patchRun(run.id, { status: "done" });
  detectPulls(run.id, "Opened https://github.com/acme/web/pull/7");
  const pull = getRun(run.id)?.pulls?.[0];
  if (!pull) throw new Error("not linked");
  expect(pull.watch).toBe(true);
  const failing = {
    ...base,
    headRefOid: "sha1",
    statusCheckRollup: [{ name: "test", status: "COMPLETED", conclusion: "FAILURE" }],
    comments: [{ author: { login: "ana" }, body: "old remark" }],
  };
  await checkPull(getRun(run.id) as never, pull, ghWith(failing));
  await settled(run.id);
  expect(getRun(run.id)?.rounds).toHaveLength(1);
  expect(getRun(run.id)?.origins?.[1]).toEqual({ kind: "pull", label: "PR #7" });
  expect(getRun(run.id)?.rounds?.[0]).toContain("These CI checks failed: test");
  expect(getRun(run.id)?.rounds?.[0]).not.toContain("old remark");
  const after = getRun(run.id)?.pulls?.[0];
  expect(after).toMatchObject({ checks: "failing", fixes: 1, seen: { failedSha: "sha1", feedback: 1 } });

  // The same head again starts nothing; a new comment does.
  await checkPull(getRun(run.id) as never, after as never, ghWith(failing));
  await settled(run.id);
  expect(getRun(run.id)?.rounds).toHaveLength(1);
  const commented = { ...failing, comments: [...failing.comments, { author: { login: "ana" }, body: "Use cents, not floats" }] };
  await checkPull(getRun(run.id) as never, getRun(run.id)?.pulls?.[0] as never, ghWith(commented));
  await settled(run.id);
  expect(getRun(run.id)?.rounds?.[1]).toContain("ana: Use cents, not floats");
});

test("the watch stops at its cap and when the pull request is merged", async () => {
  const run = createRun("ship it", dir);
  patchRun(run.id, { status: "done" });
  const pull = linkPull(run.id, "https://github.com/acme/web/pull/8", true);
  if (typeof pull === "string") throw new Error(pull);
  patchRun(run.id, { pulls: [{ ...pull, fixes: MAX_FIXES }] });
  const failing = { ...base, number: 8, headRefOid: "x", statusCheckRollup: [{ name: "t", conclusion: "FAILURE", status: "COMPLETED" }] };
  await checkPull(getRun(run.id) as never, getRun(run.id)?.pulls?.[0] as never, ghWith(failing));
  expect(getRun(run.id)?.rounds ?? []).toHaveLength(0);
  await checkPull(getRun(run.id) as never, getRun(run.id)?.pulls?.[0] as never, ghWith({ ...failing, state: "MERGED" }));
  expect(getRun(run.id)?.pulls?.[0]).toMatchObject({ state: "merged", watch: false });
  expect(linkPull(run.id, "not a link")).toBe("That is not a GitHub pull request link.");
});

test("a missing or signed-out gh shows on the pull request instead of failing", async () => {
  const run = createRun("x", dir);
  const pull = linkPull(run.id, "https://github.com/acme/web/pull/9", true);
  if (typeof pull === "string") throw new Error(pull);
  await checkPull(getRun(run.id) as never, pull, async () => ({
    ok: false,
    out: "",
    err: "To get started with GitHub CLI, please run: gh auth login",
  }));
  expect(getRun(run.id)?.pulls?.[0]?.error).toContain("gh auth login");
});
