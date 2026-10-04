import { useCallback, useEffect, useRef, useState } from "react";

import type { Location } from "../api/client";

// =============================================================================
// Module Overview
// =============================================================================
// The device location for the forecast. `useDeviceLocation` asks the browser
// once when enabled; `resolve` waits briefly for an answer so a verdict is never
// held up by a slow permission prompt, and the engine's default city fills in.

export type LocationStatus = "off" | "asking" | "on" | "denied" | "unavailable";

export interface LocationState {
  location: Location | null;
  status: LocationStatus;
  resolve: () => Promise<Location | null>;
}

// A judge call waits this long for a first fix before using the engine default
const RESOLVE_WAIT_MS = 1500;
// Two decimals is about 1 km: plenty for a forecast, and less precise than a home address
const COORD_DECIMALS = 2;

/** Ask for the device location while `enabled`; `null` means use the engine default. */
export function useDeviceLocation(enabled: boolean): LocationState {
  const [location, setLocation] = useState<Location | null>(null);
  const [status, setStatus] = useState<LocationStatus>("off");
  const pending = useRef<Promise<Location | null>>(Promise.resolve(null));

  useEffect(() => {
    setLocation(null);
    if (!enabled) {
      setStatus("off");
      pending.current = Promise.resolve(null);
      return undefined;
    }
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      pending.current = Promise.resolve(null);
      return undefined;
    }
    let cancelled = false;
    setStatus("asking");
    pending.current = new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const found: Location = {
            latitude: round(position.coords.latitude),
            longitude: round(position.coords.longitude),
            name: null,
          };
          if (!cancelled) {
            setLocation(found);
            setStatus("on");
          }
          resolve(found);
        },
        (error) => {
          if (!cancelled) setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
          resolve(null);
        },
        { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 10_000 },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const resolve = useCallback(
    () =>
      Promise.race([
        pending.current,
        new Promise<null>((done) => window.setTimeout(() => done(null), RESOLVE_WAIT_MS)),
      ]),
    [],
  );

  return { location, status, resolve };
}

function round(value: number): number {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}
