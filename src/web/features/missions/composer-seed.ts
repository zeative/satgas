// A template joins what is already typed instead of replacing it, and its first [blank] is selected to type over.
export function withTemplate(typed: string, prompt: string) {
  const before = typed.trimEnd();
  const text = before ? `${before}\n\n${prompt}` : prompt;
  const from = text.length - prompt.length;
  const blank = /\[[^\]]+\]/.exec(prompt);
  const start = from + (blank?.index ?? prompt.length);
  return { text, start, end: start + (blank?.[0].length ?? 0) };
}
