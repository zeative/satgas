import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BUILTIN } from "../../../src/server/builtin-skills";

const files = BUILTIN["satgas-app"] ?? {};

// The skill as agents get it on disk, so its scripts find the kit beside them.
async function unpack() {
  const dir = await mkdtemp(join(tmpdir(), "satgas-app-"));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, "skill", path)), { recursive: true });
    await writeFile(join(dir, "skill", path), text);
  }
  return dir;
}

test("ui-check flags a tell, unless DESIGN.md says the target itself uses it", async () => {
  const dir = await unpack();
  const app = join(dir, "app");
  await mkdir(join(app, "src/pages"), { recursive: true });
  await writeFile(
    join(app, "src/pages/Home.tsx"),
    'import { Text } from "@/kit";\nexport default () => <Text className="uppercase tracking-widest">Steps</Text>;\n',
  );
  const check = () => Bun.spawnSync(["node", join(dir, "skill/scripts/ui-check.mjs"), app]);
  const flagged = check();
  expect(flagged.exitCode).toBe(1);
  expect(flagged.stdout.toString()).toContain("tracked caps label");
  await writeFile(join(app, "DESIGN.md"), "# Look\n\nui-check allows: tracked caps label\n");
  expect(check().exitCode).toBe(0);
  await rm(dir, { recursive: true, force: true });
});

// Type is where generated pages give themselves away first: a default face, a stock serif, or none for headlines.
test("ui-check fails a default or missing typeface, and no DESIGN.md line can allow it", async () => {
  const dir = await unpack();
  const app = join(dir, "app");
  await mkdir(join(app, "src/pages"), { recursive: true });
  await writeFile(join(app, "src/pages/Home.tsx"), 'import { Text } from "@/kit";\nexport default () => <Text>Kopi</Text>;\n');
  await writeFile(join(app, "DESIGN.md"), "ui-check allows: default font\n");
  const check = () => Bun.spawnSync(["node", join(dir, "skill/scripts/ui-check.mjs"), app]);
  await writeFile(join(app, "src/index.css"), '@theme {\n  --font-sans: "Geist", sans-serif;\n  --font-display: var(--font-sans);\n}\n');
  const stock = check();
  expect(stock.exitCode).toBe(1);
  expect(stock.stdout.toString()).toContain("default font (3)");
  await writeFile(
    join(app, "src/index.css"),
    '@theme {\n  --font-sans: "Satoshi", sans-serif;\n  --font-display: "Clash Display", sans-serif;\n}\n',
  );
  expect(check().stdout.toString()).toContain("never loaded");
  await writeFile(
    join(app, "index.html"),
    '<link href="https://api.fontshare.com/v2/css?f[]=clash-display@600&f[]=satoshi@400&display=swap">',
  );
  expect(check().exitCode).toBe(0);
  await rm(dir, { recursive: true, force: true });
});

test("a phone app is scaffolded so every page shows as a phone frame", async () => {
  const dir = await unpack();
  const run = Bun.spawnSync([
    "node",
    join(dir, "skill/scripts/scaffold.mjs"),
    join(dir, "app"),
    "--name",
    "Langkah",
    "--home",
    "Hari ini",
    "--phone",
  ]);
  expect(run.exitCode).toBe(0);
  expect(JSON.parse(await readFile(join(dir, "app/.satgas/screens.json"), "utf8"))).toEqual({
    device: "phone",
    screens: [{ route: "/", name: "Hari ini" }],
  });
  await rm(dir, { recursive: true, force: true });
});
