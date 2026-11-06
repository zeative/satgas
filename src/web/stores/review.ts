import { create } from "zustand";
import type { ReviewScope } from "./runs";

// The wide view over the canvas: a diff review on a scope (with an optional file to land on), or files read whole in
// tabs. Going back to the canvas keeps the tabs, as an editor does; they belong to the board and go when it does.
export const useReview = create<{ scope: ReviewScope | null; focus?: string; file?: string; tabs: string[] }>(() => ({
  scope: null,
  tabs: [],
}));

export const openReview = (scope: ReviewScope, focus?: string) => useReview.setState({ scope, focus, file: undefined });
export const openFile = (path: string) =>
  useReview.setState((s) => ({ scope: null, focus: undefined, file: path, tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path] }));
export const closeReview = () => useReview.setState({ scope: null, focus: undefined, file: undefined });
// Closing the tab in view moves to its right-hand neighbour, else its left; the last one closes the view.
export const closeTab = (path: string) =>
  useReview.setState((s) => {
    const at = s.tabs.indexOf(path);
    const tabs = s.tabs.filter((p) => p !== path);
    return { tabs, file: s.file === path ? (tabs[at] ?? tabs[at - 1]) : s.file };
  });
export const resetReview = () => useReview.setState({ scope: null, focus: undefined, file: undefined, tabs: [] });
