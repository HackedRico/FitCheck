import { useCallback, useEffect, useState } from "react";

// =============================================================================
// Module Overview
// =============================================================================
// Hash routing for one guided path: `home` is the camera, `result` tells the
// story of one scan, `live` is the on-device preview, `you` holds the person
// photo and `closet` the owner's garments. A hash route survives a phone reload.

export const ROUTES = ["home", "result", "live", "you", "closet"] as const;
export type Route = (typeof ROUTES)[number];

// Old links from the tabbed layout still land somewhere sensible
const LEGACY: Record<string, Route> = { scan: "home", render: "result", me: "you" };

function readRoute(): Route {
  const name = window.location.hash.replace(/^#\/?/, "");
  if ((ROUTES as readonly string[]).includes(name)) return name as Route;
  return LEGACY[name] ?? "home";
}

/** Return the current screen and a function that moves to another. */
export function useRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = (): void => {
      setRoute(readRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    window.location.hash = `/${next}`;
  }, []);

  return [route, navigate];
}
