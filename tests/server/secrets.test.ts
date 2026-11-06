import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import {
  answerSecret,
  closeSecrets,
  forgetSecret,
  removeRunSecrets,
  requestSecret,
  savedSecrets,
  secretWait,
  sweepSecrets,
} from "../../src/server/secrets";
import { closeWaitingSecrets, createRun, flushAll, getRun, patchRun } from "../../src/server/store";
import { SECRET_KEEP_MS, waitingSecret } from "../../src/shared/secrets";

const original = config.dataDir;
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-secrets-"));
  await mkdir(join(dir, "runs"), { recursive: true });
  config.dataDir = dir;
});
afterAll(async () => {
  await flushAll();
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await Bun.sleep(5);
}

test("a given secret reaches the task as a private file, never as text, and stays for the board's next tasks", async () => {
  const run = createRun("deploy", dir);
  const asked = requestSecret(run.id, "n1", "Stripe test key", "to create the webhook", "  starts\nwith sk_  ");
  await until(() => !!waitingSecret(getRun(run.id)?.secrets, "n1"));
  const ask = waitingSecret(getRun(run.id)?.secrets, "n1");
  expect(ask?.label).toBe("Stripe test key");
  expect(ask?.hint).toBe("starts with sk_");
  expect(await answerSecret(run.id, ask?.id ?? "", "sk_test_123", false)).toBeNull();
  const reply = await asked;
  expect(reply).not.toContain("sk_test_123");
  const file = /in (\S+), a private/.exec(reply)?.[1] ?? "";
  expect(await Bun.file(file).text()).toBe("sk_test_123");
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(getRun(run.id))).not.toContain("sk_test_123");
  expect(getRun(run.id)?.secrets?.[0]?.state).toBe("given");
  closeSecrets(run.id, "n1");
  expect(await Bun.file(file).exists()).toBe(true);
  expect(savedSecrets(getRun(run.id) ?? run)).toEqual([{ label: "Stripe test key", file }]);
  // Answered once is answered for good.
  expect(await answerSecret(run.id, ask?.id ?? "", "again", false)).toBe("This request is no longer waiting.");
});

test("a declined, unanswered or abandoned request lets the task carry on", async () => {
  const run = createRun("deploy", dir);
  const declined = requestSecret(run.id, "n1", "Token", "");
  await until(() => !!waitingSecret(getRun(run.id)?.secrets, "n1"));
  await answerSecret(run.id, waitingSecret(getRun(run.id)?.secrets, "n1")?.id ?? "", undefined, true);
  expect(await declined).toContain("chose not to give Token");

  const saved = secretWait.ms;
  secretWait.ms = 30;
  expect(await requestSecret(run.id, "n2", "Key", "")).toContain("did not answer in time");
  secretWait.ms = saved;
  expect(getRun(run.id)?.secrets?.find((a) => a.nodeId === "n2")?.state).toBe("expired");

  const abandoned = requestSecret(run.id, "n3", "Key", "");
  await until(() => !!waitingSecret(getRun(run.id)?.secrets, "n3"));
  closeSecrets(run.id, "n3");
  expect(await abandoned).toContain("did not answer in time");
  expect(await requestSecret(run.id, "n4", "  ", "")).toContain("Name the secret");
});

test("the sweep removes what outlived its 24 hours, a leftover from a crash, and a board that is gone", async () => {
  const run = createRun("deploy", dir);
  const asked = requestSecret(run.id, "n1", "Fresh", "");
  await until(() => !!waitingSecret(getRun(run.id)?.secrets, "n1"));
  await answerSecret(run.id, waitingSecret(getRun(run.id)?.secrets, "n1")?.id ?? "", "v1", false);
  const fresh = /in (\S+), a private/.exec(await asked)?.[1] ?? "";
  const old = requestSecret(run.id, "n2", "Old", "");
  await until(() => !!waitingSecret(getRun(run.id)?.secrets, "n2"));
  await answerSecret(run.id, waitingSecret(getRun(run.id)?.secrets, "n2")?.id ?? "", "v2", false);
  const stale = /in (\S+), a private/.exec(await old)?.[1] ?? "";
  const past = Date.now() - SECRET_KEEP_MS;
  patchRun(run.id, { secrets: getRun(run.id)?.secrets?.map((a) => (a.nodeId === "n2" ? { ...a, until: past } : a)) });
  const crashed = join(dir, "secrets", run.id, "n9-abcd1234");
  const orphan = join(dir, "secrets", "gone-board", "x");
  await Bun.write(crashed, "left behind");
  await Bun.write(orphan, "left behind");

  await sweepSecrets();

  expect(await Bun.file(fresh).exists()).toBe(true);
  expect(await Bun.file(stale).exists()).toBe(false);
  expect(await Bun.file(crashed).exists()).toBe(false);
  expect(await Bun.file(orphan).exists()).toBe(false);
  expect(savedSecrets(getRun(run.id) ?? run).map((s) => s.label)).toEqual(["Fresh"]);
  await removeRunSecrets(run.id);
  expect(await Bun.file(fresh).exists()).toBe(false);
});

test("a request still open when the server stopped loads as unanswered, never as a card nobody can answer", () => {
  const run = createRun("deploy", dir);
  run.secrets = [{ id: "a", nodeId: "n1", label: "Key", reason: "", state: "waiting", at: 1 }];
  closeWaitingSecrets(run);
  expect(run.secrets?.[0]?.state).toBe("expired");
});

test("taking a secret back removes the file at once, and agents stop being told about it", async () => {
  const run = createRun("deploy", dir);
  const asked = requestSecret(run.id, "n1", "Key", "");
  await until(() => !!waitingSecret(getRun(run.id)?.secrets, "n1"));
  const id = waitingSecret(getRun(run.id)?.secrets, "n1")?.id ?? "";
  await answerSecret(run.id, id, "v", false);
  const file = /in (\S+), a private/.exec(await asked)?.[1] ?? "";
  expect(await forgetSecret(run.id, id)).toBe(true);
  expect(await Bun.file(file).exists()).toBe(false);
  expect(savedSecrets(getRun(run.id) ?? run)).toEqual([]);
  expect(await forgetSecret(run.id, id)).toBe(false);
});
