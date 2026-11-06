import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const COARSE_QUERY = "(pointer: coarse)";

// Fingers rather than a mouse, which also covers tablets too wide to count as mobile.
export function useCoarsePointer() {
  return React.useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(COARSE_QUERY);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(COARSE_QUERY).matches,
    () => false,
  );
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(MOBILE_QUERY);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
