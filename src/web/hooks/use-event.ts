import { useCallback, useLayoutEffect, useRef } from "react";

// A function with a fixed identity that always runs the latest closure, so memoized children and React Flow props stay put.
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
