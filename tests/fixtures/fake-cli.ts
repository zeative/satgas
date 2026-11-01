// Stand-in for the claude/codex CLIs: records stdin, prints canned JSONL, then exits as instructed.
const stdin = await new Response(Bun.stdin.stream()).text();
if (process.env.FAKE_CLI_STDIN_OUT) await Bun.write(process.env.FAKE_CLI_STDIN_OUT, stdin);
if (process.env.FAKE_CLI_ARGS_OUT) await Bun.write(process.env.FAKE_CLI_ARGS_OUT, JSON.stringify(process.argv.slice(2)));

process.stdout.write(process.env.FAKE_CLI_OUTPUT ?? "");
if (process.env.FAKE_CLI_STDERR) process.stderr.write(process.env.FAKE_CLI_STDERR);
if (process.env.FAKE_CLI_SLEEP) await Bun.sleep(Number(process.env.FAKE_CLI_SLEEP));
process.exit(Number(process.env.FAKE_CLI_EXIT ?? 0));

export {};
