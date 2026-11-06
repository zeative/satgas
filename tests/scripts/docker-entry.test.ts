import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ENTRY = resolve(import.meta.dir, "../../scripts/docker-entry.sh");
let dir: string;
let log: string;

// A stand-in binary: prints its version, otherwise logs that it ran and follows the given shell lines.
async function binary(path: string, version: string, name: string, body = "exit 0") {
  await Bun.write(path, `#!/bin/sh\n[ "$1" = --version ] && { echo ${version}; exit 0; }\necho ${name} >> "${log}"\n${body}\n`);
  await chmod(path, 0o755);
}
const builtin = () => join(dir, "builtin");
const update = () => join(dir, "data", "update", "satgas");
const start = () =>
  Bun.spawn(["sh", ENTRY], {
    env: { ...process.env, SATGAS_BUILTIN_BIN: builtin(), SATGAS_DATA_DIR: join(dir, "data") },
    stdout: "ignore",
    stderr: "ignore",
  });
const ran = async () => (await Bun.file(log).text()).trim().split("\n");

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-entry-"));
  log = join(dir, "log");
  await mkdir(join(dir, "data", "update"), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("runs the image's own binary when nothing was downloaded, and passes its exit code on", async () => {
  await binary(builtin(), "1.0.0", "builtin", "exit 3");
  expect(await start().exited).toBe(3);
  expect(await ran()).toEqual(["builtin"]);
});

test("prefers a newer download, and ignores one older than the image", async () => {
  await binary(builtin(), "1.2.0", "builtin");
  await binary(update(), "1.10.0", "update");
  expect(await start().exited).toBe(0);
  expect(await ran()).toEqual(["update"]);
  await rm(log);
  await binary(update(), "1.1.9", "update");
  expect(await start().exited).toBe(0);
  expect(await ran()).toEqual(["builtin"]);
});

test("exit 75 starts the newest binary again, which is how an update takes effect", async () => {
  await binary(update(), "0.0.1", "old-update");
  await binary(
    builtin(),
    "1.0.0",
    "builtin",
    `cat > "${update()}" <<'NEXT'\n#!/bin/sh\n[ "$1" = --version ] && { echo 2.0.0; exit 0; }\necho update >> "${log}"\nNEXT\nexit 75`,
  );
  expect(await start().exited).toBe(0);
  expect(await ran()).toEqual(["builtin", "update"]);
});

test("a download that dies right away is removed and the image's own takes over", async () => {
  await binary(builtin(), "1.0.0", "builtin");
  await binary(update(), "2.0.0", "update", "exit 1");
  expect(await start().exited).toBe(0);
  expect(await ran()).toEqual(["update", "builtin"]);
  expect(await Bun.file(update()).exists()).toBe(false);
});

test("a stop reaches the app, which gets to finish before the container goes", async () => {
  await binary(builtin(), "1.0.0", "builtin", `trap 'sleep 0.2; echo saved >> "${log}"; exit 0' TERM\nsleep 30 &\nwait $!`);
  const proc = start();
  for (let i = 0; i < 200 && !(await Bun.file(log).exists()); i++) await Bun.sleep(10);
  await Bun.sleep(100);
  proc.kill("SIGTERM");
  expect(await proc.exited).toBe(0);
  expect(await ran()).toEqual(["builtin", "saved"]);
});
