// Markdown imported `with { type: "text" }` arrives as its text, so the compiled binary carries the built-in skills.
declare module "*.md" {
  const text: string;
  export default text;
}

// Scripts that ship inside vendored skills, stored as .txt so they are embedded as text and never run at build.
declare module "*.txt" {
  const text: string;
  export default text;
}
