// Drives agent-browser, the agents' own browser, in a session of its own, so a check never moves the page an agent has
// open. Every call closes that session at the end.
import { pathToFileURL } from "node:url";
import type { Axe } from "./analyze";
import { type Measured, probeScript } from "./probe";

export const VIEWPORTS = { desktop: { w: 1280, h: 800 }, phone: { w: 390, h: 844 } } as const;
export type ViewportName = keyof typeof VIEWPORTS;

const bin = () => process.env.SATGAS_AGENT_BROWSER || "agent-browser";

export class BrowserError extends Error {}

export function targetUrl(target: string, cwd = process.cwd()): string {
  if (/^(https?|file):\/\//i.test(target)) return target;
  return pathToFileURL(target.startsWith("/") ? target : `${cwd}/${target}`).href;
}

// The data part of agent-browser's JSON reply; its error as a thrown message.
export function dataOf(stdout: string): unknown {
  const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  let json: { success?: boolean; data?: unknown; error?: unknown };
  try {
    json = JSON.parse(line);
  } catch {
    throw new BrowserError(stdout.trim().slice(0, 300) || "agent-browser gave no reply");
  }
  if (json.success === false) throw new BrowserError(typeof json.error === "string" ? json.error : JSON.stringify(json.error));
  return json.data;
}

// Scroll to the end and back, so lazy pictures load and scroll reveals fire before anything is measured.
const SETTLE = `(async () => {
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  const h = document.documentElement.scrollHeight;
  for (let y = 0; y < h; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
  scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 400));
  return true;
})()`;

export class Browser {
  readonly session = `satgas-design-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;

  async run(args: string[]): Promise<unknown> {
    const proc = Bun.spawn([bin(), "--session", this.session, "--json", "--allow-file-access", "--idle-timeout", "2m", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    await proc.exited;
    if (!out.trim() && proc.exitCode !== 0) throw new BrowserError(err.trim().slice(0, 300) || `agent-browser exited ${proc.exitCode}`);
    return dataOf(out);
  }

  async eval(script: string): Promise<unknown> {
    const data = (await this.run(["eval", "-b", Buffer.from(script).toString("base64")])) as { result?: unknown } | undefined;
    return data?.result;
  }

  async open(url: string, at: ViewportName) {
    const { w, h } = VIEWPORTS[at];
    await this.run(["set", "viewport", String(w), String(h)]);
    await this.run(["open", url]);
    await this.eval(SETTLE);
    await this.run(["wait", "300"]);
  }

  async measure(at: ViewportName): Promise<Measured> {
    const m = (await this.eval(probeScript(VIEWPORTS[at].w))) as Measured | undefined;
    if (!m || typeof m !== "object" || !("sizes" in m)) throw new BrowserError("The page could not be measured.");
    return m;
  }

  async shot(path: string, full = false) {
    await this.run(["screenshot", ...(full ? ["--full"] : []), path]);
  }

  async axe(): Promise<Axe | null> {
    try {
      const data = (await this.run(["a11y", "--tags", "wcag2a,wcag2aa"])) as Axe | undefined;
      return data && Array.isArray(data.violations) ? data : null;
    } catch {
      // An older agent-browser has no a11y; the rest of the check still stands.
      return null;
    }
  }

  async errors(): Promise<string[]> {
    try {
      const data = (await this.run(["errors"])) as unknown;
      const list = Array.isArray(data) ? data : ((data as { errors?: unknown[] } | undefined)?.errors ?? []);
      return list.map((e) => (typeof e === "string" ? e : String((e as { message?: string }).message ?? JSON.stringify(e)))).slice(0, 10);
    } catch {
      return [];
    }
  }

  async close() {
    await this.run(["close"]).catch(() => {});
  }
}
