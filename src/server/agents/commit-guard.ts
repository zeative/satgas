import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COMMIT_TRAILER } from "../../shared/commits";
import { config } from "../config";

// A prompt only asks, and a weak model may not listen, so every git an agent runs goes through these hooks: they credit
// Satgas Agent on any commit whatever the model wrote, then hand over to the repository's own hook of that name.
const HOOKS = [
  "applypatch-msg",
  "pre-applypatch",
  "post-applypatch",
  "pre-commit",
  "pre-merge-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "pre-rebase",
  "post-checkout",
  "post-merge",
  "pre-push",
  "post-rewrite",
  "pre-auto-gc",
  "sendemail-validate",
  "reference-transaction",
  "post-index-change",
];

// A person credited at a company stays; only an AI tool's own lines go.
const AI_LINES =
  "^co-authored-by:.*(claude|codex|chatgpt|gpt-[0-9]|copilot|qwen|gemini|deepseek|kimi|mistral|llama|grok|cursor|aider|devin|windsurf|opus|sonnet|haiku|@anthropic\\.com|@openai\\.com)|generated (with|by) .*(claude|codex|chatgpt|copilot|qwen|gemini|deepseek|cursor|aider|ai\\b)";

// post-commit is the backstop: --no-verify skips commit-msg but not this, and a real agent did reach for it. Its own amend
// finds the message right and stops there. A rebase is left alone, since those commits may not be this agent's.
const script = (name: string) => `#!/bin/sh
credit() {
  { grep -v -i -E '${AI_LINES}' "$1" || true; } > "$1.satgas" && mv "$1.satgas" "$1"
  git interpret-trailers --in-place --if-exists addIfDifferent --trailer "${COMMIT_TRAILER}" "$1"
}
if [ "${name}" = commit-msg ]; then
  credit "$1"
fi
if [ "${name}" = post-commit ] && [ ! -d "$(git rev-parse --git-path rebase-merge)" ] && [ ! -d "$(git rev-parse --git-path rebase-apply)" ]; then
  note=$(mktemp)
  git log -1 --format=%B > "$note"
  if grep -q -i -E '${AI_LINES}' "$note" || ! grep -q -F "${COMMIT_TRAILER}" "$note"; then
    credit "$note"
    git commit --amend --no-verify -q -F "$note"
  fi
  rm -f "$note"
fi
theirs=$(GIT_CONFIG_COUNT=0 git config --path --get core.hooksPath 2>/dev/null)
[ -n "$theirs" ] || theirs="$(git rev-parse --git-common-dir)/hooks"
[ -x "$theirs/${name}" ] && exec "$theirs/${name}" "$@"
exit 0
`;

const ready = new Map<string, Promise<string>>();

function prepare(): Promise<string> {
  const dir = join(config.dataDir, "git-hooks");
  let job = ready.get(dir);
  if (!job) {
    job = (async () => {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await Promise.all(
        HOOKS.map(async (name) => {
          const file = join(dir, name);
          await writeFile(file, script(name), { mode: 0o755 });
          await chmod(file, 0o755);
        }),
      );
      return dir;
    })();
    ready.set(dir, job);
    job.catch(() => ready.delete(dir));
  }
  return job;
}

// Added after any config the environment already passes to git, so that keeps working.
export async function commitGuardEnv(inherited: Record<string, string | undefined> = process.env): Promise<Record<string, string>> {
  const at = Number(inherited.GIT_CONFIG_COUNT) || 0;
  return {
    GIT_CONFIG_COUNT: String(at + 1),
    [`GIT_CONFIG_KEY_${at}`]: "core.hooksPath",
    [`GIT_CONFIG_VALUE_${at}`]: await prepare(),
  };
}
