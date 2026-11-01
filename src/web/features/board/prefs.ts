import { useCallback, useState } from "react";

// How the person likes the board drawn; kept per browser, not per board.
export interface BoardPrefs {
  grid: boolean;
  snap: boolean;
}

const KEY = "satgas.board.prefs";
const DEFAULTS: BoardPrefs = { grid: true, snap: false };

function read(): BoardPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<BoardPrefs>;
    return {
      grid: typeof raw.grid === "boolean" ? raw.grid : DEFAULTS.grid,
      snap: typeof raw.snap === "boolean" ? raw.snap : DEFAULTS.snap,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useBoardPrefs() {
  const [prefs, setPrefs] = useState(read);
  const toggle = useCallback((key: keyof BoardPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return { prefs, toggle };
}
