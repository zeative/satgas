export type FileKind = "image" | "svg" | "pdf" | "video" | "audio" | "text";

const KINDS: [RegExp, FileKind][] = [
  [/\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i, "image"],
  [/\.svg$/i, "svg"],
  [/\.pdf$/i, "pdf"],
  [/\.(mp4|m4v|webm|mov)$/i, "video"],
  [/\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i, "audio"],
];

// How the file view shows a path. Wider than isPicture, which only names what a model can be sent.
export const fileKind = (path: string): FileKind => KINDS.find(([ext]) => ext.test(path))?.[1] ?? "text";

// A NUL is what text never holds, so a font or an archive with an unknown extension is not painted as garbled code.
export const looksBinary = (text: string) => text.slice(0, 8000).includes("\0");
