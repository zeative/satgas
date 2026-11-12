import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { runClaude } from "./agents/claude";
import { runCodex } from "./agents/codex";
import { portOf, type Screen, screensOf } from "./apps";
import { config } from "./config";
import { auditFindings, COLLECT, type PageFacts } from "./page-audit";
import { getRun } from "./store";

// What Satgas itself checks after a task builds screens, so the check never depends on an agent choosing to run it: the
// source against the design system (the kit's ui-check), and a picture of every page at desktop and phone width.
export interface PageShots {
  route: string;
  name: string;
  // The picture the page was cloned from, relative to the board's folder.
  target?: string;
  shots: string[];
}

export interface VisualCheck {
  lint: string;
  clean: boolean;
  shots: string[];
  pages: PageShots[];
  hubs: string[];
  // What the rendered pages gave away, per page and width; only pages with findings.
  audit: { route: string; width: number; findings: string[] }[];
}

const MAX_PAGES = 8;
const WIDTHS = [
  [1440, 900],
  [390, 844],
] as const;

// Async, so the server keeps answering while a browser loads pages.
async function exec(cmd: string[], cwd: string, timeout = 60_000) {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => p.kill(), timeout);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  return { code, out: `${out}${err}`.trim() };
}
// agent-browser prints an eval's value, sometimes quoted once more.
function evalJson(out: string): unknown {
  try {
    const once = JSON.parse(out.split("\n").filter(Boolean).at(-1) ?? "null");
    return typeof once === "string" ? JSON.parse(once) : once;
  } catch {
    return null;
  }
}
const slug = (route: string) => route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home";

export async function visualCheck(runId: string, label: string): Promise<VisualCheck | null> {
  const run = getRun(runId);
  const app = Object.values(run?.apps ?? {}).find((a) => a.status === "running");
  if (!run || !app) return null;
  const dir = join(run.cwd, app.dir);
  if (!(await stat(join(dir, "src")).catch(() => null))) return null;

  const script = join(config.dataDir, "skills-builtin", "satgas-app", "scripts", "ui-check.mjs");
  const lint = (await stat(script).catch(() => null)) ? await exec(["node", script, dir], dir) : { code: 0, out: "" };

  const shots: string[] = [];
  const pages: PageShots[] = [];
  const audit: VisualCheck["audit"] = [];
  const port = portOf(runId, app.name);
  if (port) {
    const listed = await screensOf(runId, app.name);
    const screens: Screen[] = (listed.length ? listed : [{ route: "/", name: "Home" }]).slice(0, MAX_PAGES);
    for (const s of screens) {
      const target =
        s.target && (await stat(join(dir, s.target)).catch(() => null)) ? join(app.dir, s.target).replace(/^\.\//, "") : undefined;
      pages.push({ route: s.route, name: s.name, ...(target ? { target } : {}), shots: [] });
    }
    const out = join(run.cwd, "design", "shots", `check-${label}`);
    await mkdir(out, { recursive: true });
    const session = `satgas-check-${runId}`;
    const ab = (...args: string[]) => exec(["agent-browser", "--session", session, ...args], run.cwd);
    // A phone app is seen the way a phone shows it: one screen with its bars in place, then the same screen scrolled to
    // the end. A full-page picture would leave a fixed tab bar floating in the middle.
    const phone = screens.every((s) => s.device === "phone");
    const sizes = phone ? [WIDTHS[1]] : WIDTHS;
    const url = (s: Screen) => `http://127.0.0.1:${port}${app.path}${s.route.replace(/^\//, "")}`;
    const keep = (i: number, file: string) => {
      shots.push(file);
      pages[i]?.shots.push(file);
    };
    try {
      await ab("open", "about:blank");
      for (const [w, h] of sizes) {
        await ab("set", "viewport", String(w), String(h));
        for (const [i, s] of screens.entries()) {
          await ab("open", url(s));
          await ab("wait", "1500");
          const facts = evalJson((await ab("eval", COLLECT)).out) as PageFacts | null;
          const findings = facts?.texts ? auditFindings(facts, w) : [];
          if (findings.length) audit.push({ route: s.route, width: w, findings });
          const file = join(out, `${slug(s.route)}-${w}.png`);
          if ((await ab("screenshot", ...(phone ? [] : ["--full"]), file)).code === 0) keep(i, file);
          if (!phone) continue;
          const tall = await ab("eval", "document.documentElement.scrollHeight > innerHeight + 40");
          if (!tall.out.includes("true")) continue;
          await ab("eval", "scrollTo(0, document.documentElement.scrollHeight)");
          await ab("wait", "600");
          // At the end of the page is where a fixed tab bar sits on the last buttons.
          const atEnd = evalJson((await ab("eval", COLLECT)).out) as PageFacts | null;
          const late = atEnd?.covered?.length ? auditFindings({ texts: [], overflow: 0, broken: [], covered: atEnd.covered }, w) : [];
          if (late.length) audit.push({ route: `${s.route} (scrolled to the end)`, width: w, findings: late });
          const end = join(out, `${slug(s.route)}-${w}-end.png`);
          if ((await ab("screenshot", end)).code === 0) keep(i, end);
        }
      }
    } finally {
      await ab("close");
    }
  }
  const hubDir = join(run.cwd, "design", "hubs");
  const hubs = (await readdir(hubDir).catch(() => [] as string[]))
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => join("design", "hubs", f));
  return { lint: lint.out.slice(-4000), clean: lint.code === 0, shots, pages, hubs, audit };
}

// A builder grading its own screens is lenient: it remembers what it meant, not what it made. The review comes from a
// fresh session that never saw the build, holding each page beside the picture it was cloned from.
export interface Review {
  pages: { route: string; score: number; template: boolean; fixes: string[] }[];
}

const REVIEW_SCHEMA = {
  type: "object",
  required: ["pages"],
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        required: ["route", "score", "template", "fixes"],
        properties: {
          route: { type: "string" },
          score: { type: "number", description: "1 to 10: how close the build comes to its target's level of craft" },
          template: { type: "boolean", description: "true when it reads as a generic template, not as its target" },
          fixes: {
            type: "array",
            maxItems: 10,
            items: { type: "string", description: "One difference: where, what the target does, what the build does, the exact fix" },
          },
        },
      },
    },
  },
};

const REVIEWER = `You are a senior product designer reviewing a build someone else made. You never saw it being made.
For each page you get its pictures and the picture it was cloned from (or the hub screens it was derived from). Open
every picture with the Read tool before you judge it. Compare them part by part, top to bottom: layout and proportions,
spacing, type (family, size, weight, case, tracking), colours, corner radius and shadows, pictures and their crop, icons,
and the state shown (a target mid-use beside an empty build is a difference). List the differences that matter most,
each as: where, what the target does, what the build does, and the exact fix with values. Score how close the build
comes to the target's level of craft from 1 to 10, where 10 would sit beside it on Dribbble's popular page. Be strict:
a page that is tidy but plainer than its target is a 5. Name broken things too: overlapping elements, cut-off text,
fixed bars covering content, empty gaps. Judge the pictures as the target's art director would: a photo that does
not show this product's world, does not match the others in light and style, or repeats, is a difference.`;

export async function reviewScreens(
  runId: string,
  check: VisualCheck,
  agent: "claude" | "codex",
  signal: AbortSignal,
): Promise<Review | null> {
  const run = getRun(runId);
  const pages = check.pages.filter((p) => p.shots.length);
  if (!run || !pages.length) return null;
  const rel = (p: string) => p.replace(`${run.cwd}/`, "");
  const hubs = check.hubs.length ? check.hubs.join(", ") : "none saved";
  const list = pages
    .map(
      (p) =>
        `- ${p.route} (${p.name}): build ${p.shots.map(rel).join(", ")}; ${p.target ? `target ${p.target}` : `no target of its own, so judge it against the hub screens (${hubs})`}`,
    )
    .join("\n");
  const prompt = `Review these pages.\n\n${list}\n\nThe design direction is in DESIGN.md and design/directions.md if you need it.`;
  const req = { prompt, cwd: run.cwd, signal, onLog: () => {}, readOnly: true };
  const result = await (agent === "codex"
    ? runCodex(
        { ...req, prompt: `${REVIEWER}\n\n${prompt}\n\nAnswer with only JSON shaped as: ${JSON.stringify(REVIEW_SCHEMA)}` },
        { bare: true },
      )
    : runClaude(req, { systemPrompt: REVIEWER, jsonSchema: REVIEW_SCHEMA, tools: "Read" })
  ).catch(() => null);
  const raw =
    result?.structured ??
    (() => {
      const text = result?.output ?? "";
      try {
        return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      } catch {
        return null;
      }
    })();
  return cleanReview(raw);
}

export function cleanReview(raw: unknown): Review | null {
  const pages = (raw as { pages?: unknown })?.pages;
  if (!Array.isArray(pages)) return null;
  const out = pages.flatMap((p) => {
    if (typeof p?.route !== "string" || typeof p?.score !== "number") return [];
    const fixes = Array.isArray(p.fixes) ? p.fixes.filter((f: unknown): f is string => typeof f === "string").slice(0, 10) : [];
    return [{ route: p.route, score: Math.max(1, Math.min(10, Math.round(p.score))), template: p.template === true, fixes }];
  });
  return out.length ? { pages: out } : null;
}

// The turn a task gets after the check: the findings, the pictures, and the bar they are held to.
export function checkMessage(check: VisualCheck, cwd: string, review?: Review | null): string {
  const rel = (p: string) => p.replace(`${cwd}/`, "");
  const steps: string[] = [];
  if (!check.clean)
    steps.push(`ui-check found these; fix every one (run \`bun run check:ui\` until it is clean):\n\`\`\`\n${check.lint}\n\`\`\``);
  if (check.audit.length)
    steps.push(
      `Satgas read the rendered pages and found these; fix every one:\n${check.audit.map((a) => `${a.route} at ${a.width}px:\n${a.findings.map((f) => `  - ${f}`).join("\n")}`).join("\n")}`,
    );
  if (review?.pages.length) {
    const pages = review.pages
      .map((p) => `${p.route}: ${p.score}/10${p.template ? ", reads as a template" : ""}\n${p.fixes.map((f) => `  - ${f}`).join("\n")}`)
      .join("\n");
    steps.push(
      `A reviewer who never saw you build held every page beside its target and found this:\n${pages}\nFix every point. Where a page has no target of its own and reads as a template, take one from its hub or design/refs/ and add it to that page in .satgas/screens.json as "target".`,
    );
  } else if (check.shots.length) {
    steps.push(
      `Satgas took a picture of every page (full page at 1440 and 390 wide; a phone app as the phone shows it, then scrolled to the end). Open each one next to its target in design/refs/:\n${check.shots.map((s) => `- ${rel(s)}`).join("\n")}\nScore every page from 1 to 10 on each of: alignment to the grid, spacing rhythm, type scale and hierarchy, consistency with the hub screens in design/hubs/ and with the other pages, pictures (real, well cropped), states, and how it holds at 390. Then the hard test: set each picture beside its target. Would it sit on Dribbble's popular page next to it, or does it read as a template? Write the scores and every failure in design/review.md, then fix all of them.`,
    );
  }
  steps.push(
    "Then compare each page you changed with its target or its hub using satgas-design's compare script, fix what still differs, and give your report again with the final scores.",
  );
  return ["Satgas checked the screens you built. Before this is done:", ...steps.map((s, i) => `${i + 1}. ${s}`)].join("\n\n");
}
