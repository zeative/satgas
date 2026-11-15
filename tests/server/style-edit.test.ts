import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classesFor, themeOf, writeClasses } from "../../src/server/style-edit";

let dir = "";
const page = [
  "export function Home() {",
  "  return (",
  '    <main className="mx-auto max-w-5xl">',
  '      <h1 className="text-display text-center font-medium text-foreground">Know who to call</h1>',
  "      <p",
  '        className="text-muted-foreground"',
  '        id="lead"',
  "      >",
  "        Words",
  "      </p>",
  "      <section>",
  "        <span>Plain</span>",
  "      </section>",
  '      <div className={cn("p-4", open && "bg-muted")}>x</div>',
  '      <div className={cn("rounded-control p-4")}>y</div>',
  "    </main>",
  "  );",
  "}",
].join("\n");
const css =
  '@import "tailwindcss";\n@theme {\n  --color-foreground: #0a0a0a;\n  --text-display: clamp(2.75rem, 4vw, 5.5rem);\n  --radius-control: 10px;\n}\n';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-style-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "home.tsx"), page);
  await writeFile(join(dir, "src", "index.css"), css);
});
afterAll(() => rm(dir, { recursive: true, force: true }));
const read = () => readFile(join(dir, "src", "home.tsx"), "utf8");

test("panel values become the classes Tailwind writes, and the rest is kept for the team", () => {
  const r = classesFor({
    textAlign: "left",
    fontWeight: "700",
    fontSize: "clamp(40px, 6vw, 80px)",
    paddingLeft: "24px",
    opacity: "0.5",
    fontFamily: '"Inter", sans-serif',
  });
  expect(r.classes).toEqual(["text-left", "font-bold", "text-[clamp(40px,6vw,80px)]", "pl-[24px]", "opacity-50"]);
  expect(r.rest).toEqual({ fontFamily: '"Inter", sans-serif' });
});

test("the app's theme tokens are read from its stylesheets", async () => {
  expect(await themeOf(dir)).toEqual({ color: ["foreground"], text: ["display"], radius: ["control"] });
});

test("new classes replace the ones they conflict with, theme tokens included", async () => {
  const r = await writeClasses(dir, "src/home.tsx:4", "h1", { textAlign: "left", fontSize: "48px", color: "#ff0000" });
  expect(r.ok).toBe(true);
  expect((await read()).split("\n")[3]).toBe(
    '      <h1 className="font-medium text-left text-[48px] text-[#ff0000]">Know who to call</h1>',
  );
});

test("an opening tag over several lines is followed to its class name", async () => {
  const r = await writeClasses(dir, "src/home.tsx:5", "p", { fontWeight: "600" });
  expect(r.ok).toBe(true);
  expect((await read()).split("\n")[5]).toBe('        className="text-muted-foreground font-semibold"');
});

test("an element without a class name gets one", async () => {
  const r = await writeClasses(dir, "src/home.tsx:12", "span", { borderRadius: "8px" });
  expect(r.ok).toBe(true);
  expect((await read()).split("\n")[11]).toBe('        <span className="rounded-[8px]">Plain</span>');
});

test("a class built in code goes to the team; a single cn() string is merged", async () => {
  expect((await writeClasses(dir, "src/home.tsx:14", "div", { gap: "8px" })).ok).toBe(false);
  const r = await writeClasses(dir, "src/home.tsx:15", "div", { borderRadius: "12px" });
  expect(r.ok).toBe(true);
  expect((await read()).split("\n")[14]).toBe('      <div className={cn("p-4 rounded-[12px]")}>y</div>');
});
