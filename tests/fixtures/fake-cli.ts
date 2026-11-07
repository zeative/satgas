// Stand-in for the claude/codex CLIs: records stdin, prints canned JSONL, then exits as instructed.
// Streaming input (Claude Code's --input-format stream-json): the prompt is the first user line, and stdin stays open
// until Satgas sees the result; later lines are messages sent mid-task.
const streaming = process.argv.includes("--input-format");
const raw = streaming ? "" : await new Response(Bun.stdin.stream()).text();
const reader = streaming ? Bun.stdin.stream().getReader() : null;
let pending = "";
async function nextLine(): Promise<string | null> {
  while (reader) {
    const nl = pending.indexOf("\n");
    if (nl >= 0) {
      const line = pending.slice(0, nl);
      pending = pending.slice(nl + 1);
      return line;
    }
    const { value, done } = await reader.read();
    if (done) return null;
    pending += new TextDecoder().decode(value);
  }
  return null;
}
const textOf = (line: string | null) => (line ? String(JSON.parse(line).message?.content ?? "") : "");
const stdin = streaming ? textOf(await nextLine()) : raw;
if (process.env.FAKE_CLI_STDIN_OUT) await Bun.write(process.env.FAKE_CLI_STDIN_OUT, stdin);
// A message that arrives mid-task is recorded, so tests can see what reached the agent.
const heard: string[] = [];
if (streaming && process.env.FAKE_CLI_HEARD_OUT && process.env.FAKE_CLI_HEAR_MS) {
  const until = Date.now() + Number(process.env.FAKE_CLI_HEAR_MS);
  const read = nextLine().then((l) => l && heard.push(textOf(l)));
  await Promise.race([read, Bun.sleep(Math.max(0, until - Date.now()))]);
  await Bun.write(process.env.FAKE_CLI_HEARD_OUT, JSON.stringify(heard));
}
if (process.env.FAKE_CLI_ARGS_OUT) await Bun.write(process.env.FAKE_CLI_ARGS_OUT, JSON.stringify(process.argv.slice(2)));

// A run under an output-token cap can answer differently, like a gateway that refused the uncapped request.
const capped = process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS && process.env.FAKE_CLI_OUTPUT_CAPPED !== undefined;
if (process.env.FAKE_CLI_CAP_OUT) await Bun.write(process.env.FAKE_CLI_CAP_OUT, process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS ?? "");
// A task can answer apart from the planner: as a Claude Code worker (streaming input) or as Codex (`codex exec`).
const codex = process.argv[2] === "exec";
// The lead's quick answer to a message sent mid-work has its own canned reply, so it never races the plan's.
const aside = !streaming && process.env.FAKE_CLI_ASIDE_OUTPUT !== undefined && stdin.includes("The person's message:");
const output = aside
  ? process.env.FAKE_CLI_ASIDE_OUTPUT
  : codex && process.env.FAKE_CLI_CODEX_OUTPUT !== undefined
    ? process.env.FAKE_CLI_CODEX_OUTPUT
    : streaming && process.env.FAKE_CLI_WORKER_OUTPUT !== undefined
      ? process.env.FAKE_CLI_WORKER_OUTPUT
      : capped
        ? process.env.FAKE_CLI_OUTPUT_CAPPED
        : process.env.FAKE_CLI_OUTPUT;
process.stdout.write(output ?? "");
if (process.env.FAKE_CLI_STDERR) process.stderr.write(process.env.FAKE_CLI_STDERR);
if (process.env.FAKE_CLI_SLEEP && !aside) await Bun.sleep(Number(process.env.FAKE_CLI_SLEEP));
// Something sent to the background that outlives the CLI, in its process group, like `npm run build &`.
if (process.env.FAKE_CLI_BACKGROUND) Bun.spawn(["sleep", process.env.FAKE_CLI_BACKGROUND], { stdout: "ignore", stderr: "ignore" }).unref();
// Like the real CLI, a streaming run ends once Satgas closes stdin after the result.
if (streaming) while ((await nextLine()) !== null) {}
process.exit(capped ? 0 : Number(process.env.FAKE_CLI_EXIT ?? 0));

export {};
