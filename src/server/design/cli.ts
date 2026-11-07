// `satgas design check|refs|compare`: the measuring tools behind the satgas-design skill. Agents run them from their
// shell; the design bench runs the same ones, so what an agent is held to is what the bench scores.
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { analyze, describeReport, describeTokens, type Report, tokensOf } from "./analyze";
import { Browser, BrowserError, targetUrl, VIEWPORTS } from "./browser";
import type { Measured } from "./probe";

export const USAGE = `satgas design check <file|url> [--out <dir>] [--name <name>]
  Screenshots the page at desktop (1280) and phone (390) width, measures it, and lists what to fix first.
satgas design refs <url> [<url>...] [--out <dir>]
  Screenshots reference sites and measures their type, colour, spacing and text column.
satgas design compare <build.png> <reference.png> [...] [--out <file>]
  Puts a build next to its references in one picture, to judge them side by side.`;

export interface Checked {
  report: Report;
  measured: { desktop: Measured; phone: Measured };
  shots: { desktop: string; phone: string; desktopFull: string; phoneFull: string };
}

const slug = (s: string) =>
  s
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 48) || "page";

export async function check(
  target: string,
  outDir: string,
  name = slug(basename(target).replace(/\.html?$/i, "") || target),
): Promise<Checked> {
  await mkdir(outDir, { recursive: true });
  const url = targetUrl(target);
  const b = new Browser();
  const shot = (at: string, full: boolean) => join(outDir, `${name}-${at}${full ? "-full" : ""}.png`);
  try {
    await b.open(url, "desktop");
    const desktop = await b.measure("desktop");
    await b.shot(shot("desktop", false));
    await b.shot(shot("desktop", true), true);
    const axe = await b.axe();
    const errors = await b.errors();
    await b.open(url, "phone");
    const phone = await b.measure("phone");
    await b.shot(shot("phone", false));
    await b.shot(shot("phone", true), true);
    const report = analyze(desktop, phone, axe, errors);
    return {
      report,
      measured: { desktop, phone },
      shots: {
        desktop: shot("desktop", false),
        phone: shot("phone", false),
        desktopFull: shot("desktop", true),
        phoneFull: shot("phone", true),
      },
    };
  } finally {
    await b.close();
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// One page with the pictures in a row under their names; the browser renders it, so no image library is needed.
export function compareHtml(images: { label: string; src: string }[]): string {
  const cells = images.map((i) => `<figure><figcaption>${esc(i.label)}</figcaption><img src="${esc(i.src)}"></figure>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#18181b;font:14px system-ui;color:#e4e4e7;display:grid;grid-template-columns:repeat(${images.length},minmax(0,1fr));gap:24px;align-items:start}
figure{margin:0}figcaption{margin:0 0 8px}img{width:100%;display:block;border-radius:8px;background:#fff}
</style>${cells}`;
}

const flag = (args: string[], name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};

export async function runDesign(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const args = [...rest];
  const out = flag(args, "--out");
  const name = flag(args, "--name");
  try {
    if (cmd === "check" && args[0]) {
      const dir = resolve(out ?? "design/check");
      const r = await check(args[0], dir, name);
      await writeFile(join(dir, `${basename(r.shots.desktop).replace(/-desktop\.png$/, "")}.json`), JSON.stringify(r, null, 2));
      console.log(describeReport(r.report));
      console.log(`\nScreenshots: ${Object.values(r.shots).join(", ")}`);
      return 0;
    }
    if (cmd === "refs" && args.length) {
      const dir = resolve(out ?? "design/refs");
      const lines: string[] = ["# References, measured", ""];
      const all: Record<string, unknown> = {};
      for (const url of args) {
        try {
          const r = await check(url, dir, slug(url));
          all[url] = { tokens: tokensOf(r.measured.desktop), phone: tokensOf(r.measured.phone), shots: r.shots };
          lines.push(
            `## ${url}`,
            "",
            describeTokens(tokensOf(r.measured.desktop)),
            "",
            `Screenshots: ${r.shots.desktop}, ${r.shots.phone}, ${r.shots.desktopFull}`,
            "",
          );
          console.log(`measured ${url}`);
        } catch (e) {
          // One site that blocks the browser should not cost the others.
          lines.push(`## ${url}`, "", `Could not be measured: ${e instanceof Error ? e.message : e}`, "");
          console.log(`skipped ${url}: ${e instanceof Error ? e.message : e}`);
        }
      }
      await writeFile(join(dir, "refs.json"), JSON.stringify(all, null, 2));
      await writeFile(join(dir, "refs.md"), lines.join("\n"));
      console.log(`\n${lines.join("\n")}\nWritten: ${join(dir, "refs.md")}`);
      return 0;
    }
    if (cmd === "compare" && args.length >= 2) {
      const file = resolve(out ?? "design/compare.png");
      const page = `${file.replace(/\.png$/i, "")}.html`;
      await writeFile(
        page,
        compareHtml(args.map((p, i) => ({ label: i === 0 ? `Build: ${basename(p)}` : basename(p), src: targetUrl(p) }))),
      );
      const b = new Browser();
      try {
        await b.run(["set", "viewport", String(Math.min(560 * args.length, 2400)), String(VIEWPORTS.desktop.h)]);
        await b.run(["open", targetUrl(page)]);
        await b.run(["wait", "500"]);
        await b.shot(file, true);
      } finally {
        await b.close();
      }
      console.log(`Written: ${file}`);
      return 0;
    }
    console.log(USAGE);
    return cmd ? 2 : 0;
  } catch (e) {
    if (e instanceof BrowserError) {
      console.error(`satgas design: the browser failed: ${e.message}`);
      return 1;
    }
    throw e;
  }
}
