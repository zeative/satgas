// Anthropic's list prices per million tokens (input, cache read, output), for splitting a cost by type and working out what
// caching saved. The total itself comes from Claude Code. A cache write costs twice the input, since it caches for an hour;
// checked against its reported cost: 1175 in, 11228 read, 6709 written, 18 out on Haiku 5.5 is $0.00158058 either way.
const PRICES: Record<string, { input: number; read: number; output: number }> = {
  "claude-fable-5-1": { input: 10, read: 0.25, output: 50 },
  "claude-fable-5": { input: 10, read: 1, output: 50 },
  "claude-opus-5-5": { input: 4, read: 0.2, output: 20 },
  "claude-opus-5": { input: 5, read: 0.5, output: 25 },
  "claude-opus-4-8": { input: 5, read: 0.5, output: 25 },
  "claude-opus-4-7": { input: 5, read: 0.5, output: 25 },
  "claude-opus-4-6": { input: 5, read: 0.5, output: 25 },
  "claude-sonnet-5-5": { input: 2, read: 0.2, output: 10 },
  "claude-sonnet-5": { input: 2, read: 0.2, output: 10 },
  "claude-sonnet-4-6": { input: 3, read: 0.3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, read: 0.01, output: 0.5 },
  "claude-haiku-4-5": { input: 1, read: 0.1, output: 5 },
};

export const priceOf = (model: string) => {
  const p = PRICES[model];
  return p ? { ...p, write: p.input * 2 } : null;
};
