// Entry of the compiled binary: `satgas hook <event>` answers one agent hook and `satgas team-mcp` serves a task's team
// connector, each without loading the server; anything else starts it.
if (process.argv[2] === "hook") {
  const { runHook } = await import("./tools/hook");
  await runHook(process.argv[3] ?? "");
} else if (process.argv[2] === "team-mcp") {
  const { runTeamMcp } = await import("./team/mcp");
  await runTeamMcp();
} else {
  await import("./index");
}

export {};
