import { useCallback, useEffect, useState } from "react";

// =============================================================================
// Module Overview
// =============================================================================
// Hash routing for the five screens. A hash route survives a reload on the
// phone and lets the presenter jump to a screen by typing `#/live` on the laptop.

export const ROUTES = ["scan", "live", "me", "closet", "render"] as const;
export type Route = (typeof ROUTES)[number];

function readRoute(): Route {
  const name = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : "scan";
}

/** Return the current screen and a function that moves to another. */
export function useRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = (): void => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    window.location.hash = `/${next}`;
  }, []);

  return [route, navigate];
}
