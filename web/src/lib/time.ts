import { useEffect, useState } from "react";

// =============================================================================
// Module Overview
// =============================================================================
// Clocks for the latency choreography: `useElapsed` ticks while a step runs so
// the screen never looks idle, and `formatMs` prints a duration the same way
// everywhere.

/** Milliseconds since `startedAt`, re-rendering every 100 ms while `startedAt` is set. */
export function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (startedAt === null) return undefined;
    setNow(performance.now());
    const timer = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

/** "840 ms" under a second, "2.4 s" above. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
