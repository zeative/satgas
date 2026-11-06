// Agents start most commands with `cd <workspace> &&`; the card has room for one line, so it shows what runs after.
export const bare = (cmd: string) => cmd.replace(/^\s*cd\s+("[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*/, "").trim() || cmd.trim();
