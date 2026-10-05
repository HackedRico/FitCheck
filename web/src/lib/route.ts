import { useCallback, useEffect, useState } from "react";

// =============================================================================
// Module Overview
// =============================================================================
// Hash routing for one guided path: `home` is the camera, `result` tells the
// story of one scan, `live` is the on-device preview, `you` holds the person
// photo and `closet` the owner's garments. A hash route survives a phone reload.

const ROUTES = ["home", "result", "live", "you", "closet"] as const;
export type Route = (typeof ROUTES)[number];

// Screens this tab has moved to inside the app; above zero, history.back() stays in FitCheck
let inAppSteps = 0;

/** Whether going back in history lands on another FitCheck screen rather than leaving the app. */
export function canGoBackInApp(): boolean {
  return inAppSteps > 0;
}

function readRoute(): Route {
  const name = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : "home";
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
    if (readRoute() !== next) inAppSteps += 1;
    window.location.hash = `/${next}`;
  }, []);

  return [route, navigate];
}
