import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { config } from "../config";

// Programs that reach a person's outside accounts with a sign-in saved on this machine. Agents reach those only through
// the connectors the person chose, so these stay out of their hands even when already signed in.
export const ACCOUNT_CLIS = [
  "gh",
  "glab",
  "vercel",
  "netlify",
  "wrangler",
  "flyctl",
  "fly",
  "railway",
  "supabase",
  "firebase",
  "heroku",
  "doctl",
  "aws",
  "gcloud",
  "az",
  "stripe",
  "kubectl",
  "terraform",
];

const GITHUB_TOKENS = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"];
// AWS keys stay: Claude Code itself may need them for Bedrock.
const OTHER_TOKENS = [
  "GITLAB_TOKEN",
  "VERCEL_TOKEN",
  "NETLIFY_AUTH_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "FLY_API_TOKEN",
  "RAILWAY_TOKEN",
  "SUPABASE_ACCESS_TOKEN",
  "HEROKU_API_KEY",
  "DIGITALOCEAN_ACCESS_TOKEN",
  "STRIPE_API_KEY",
];

const script = (name: string) => `#!/bin/sh
echo "${name}: Satgas agents reach outside accounts only through connectors. Tell the person to connect this service under Integrations, Connectors." >&2
exit 1
`;

// Satgas's design tools (`satgas design check`) for agents' shells; from source, the entry script under Bun. Only
// `design` passes: the bare binary starts a server, which an agent must never do.
const compiled = import.meta.dir.includes("$bunfs") || import.meta.dir.includes("~BUN");
const shq = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
export const selfScript = () => `#!/bin/sh
if [ "$1" != "design" ]; then echo 'satgas: agents can run only "satgas design" (check, refs, compare).' >&2; exit 2; fi
exec ${shq(process.execPath)}${compiled ? "" : ` ${shq(join(import.meta.dir, "..", "main.ts"))}`} "$@"
`;

const ready = new Map<string, Promise<{ bin: string; empty: string }>>();

function prepare(watchedPull: boolean): Promise<{ bin: string; empty: string }> {
  const root = join(config.dataDir, "account-guard");
  const bin = join(root, watchedPull ? "bin-pull" : "bin");
  let job = ready.get(bin);
  if (!job) {
    job = (async () => {
      const empty = join(root, "no-sign-in");
      await mkdir(bin, { recursive: true, mode: 0o700 });
      await mkdir(empty, { recursive: true, mode: 0o700 });
      await Promise.all(
        ACCOUNT_CLIS.filter((name) => !(watchedPull && name === "gh")).map(async (name) => {
          const file = join(bin, name);
          await writeFile(file, script(name), { mode: 0o755 });
          await chmod(file, 0o755);
        }),
      );
      await writeFile(join(bin, "satgas"), selfScript(), { mode: 0o755 });
      await chmod(join(bin, "satgas"), 0o755);
      return { bin, empty };
    })();
    ready.set(bin, job);
    job.catch(() => ready.delete(bin));
  }
  return job;
}

// A prompt only asks. The stand-ins go first on PATH; the empty config also holds where a shell reorders PATH.
// A watched pull request is the person's own link, so that round keeps the GitHub CLI and its sign-in.
export async function accountGuardEnv(watchedPull = false, path = process.env.PATH ?? "") {
  const { bin, empty } = await prepare(watchedPull);
  return {
    set: { PATH: `${bin}${delimiter}${path}`, ...(watchedPull ? {} : { GH_CONFIG_DIR: empty }) },
    unset: watchedPull ? OTHER_TOKENS : [...GITHUB_TOKENS, ...OTHER_TOKENS],
  };
}
