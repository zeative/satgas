// A template joins what is already typed instead of replacing it. It reads as a finished brief, and its {sample value} is selected to type over.
export function withTemplate(typed: string, prompt: string) {
  const sample = /\{([^}]+)\}/.exec(prompt);
  const brief = sample ? prompt.replace(sample[0], sample[1] ?? "") : prompt;
  const before = typed.trimEnd();
  const text = before ? `${before}\n\n${brief}` : brief;
  const from = text.length - brief.length;
  const start = from + (sample?.index ?? brief.length);
  return { text, start, end: start + (sample?.[1]?.length ?? 0) };
}
