import DiffWorker from "@pierre/diffs/worker/worker.js?worker";
import type { CSSProperties } from "react";

export const POOL = { poolSize: 2, workerFactory: () => new DiffWorker() };
export const HIGHLIGHT = { theme: { light: "pierre-light", dark: "pierre-dark" } } as const;
// The renderer's own type scale, set to Satgas's: code at 12px on 20px lines in the app's mono, headers in its sans.
export const REVIEW_STYLE = {
  height: "100%",
  overflow: "auto",
  "--diffs-font-size": "12px",
  "--diffs-line-height": "20px",
  "--diffs-font-family": "var(--font-mono)",
  "--diffs-header-font-family": "var(--font-inter)",
} as CSSProperties;
