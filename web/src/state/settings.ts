import { useCallback, useState } from "react";

import { readSetting, writeSetting } from "../lib/storage";

// =============================================================================
// Module Overview
// =============================================================================
// Device settings kept in `localStorage`: whose closet to use (the owner, "ricky"
// by default) and whether to send this device's location for the forecast.

const OWNER_KEY = "fitcheck.owner";
const LOCATION_KEY = "fitcheck.useLocation";
export const DEFAULT_OWNER = "ricky";

// Mirrors `_OWNER_PATTERN` in `engine/src/fitcheck/engine.py`, which names folders on disk
export const OWNER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface SettingsState {
  owner: string;
  setOwner: (owner: string) => void;
  useDeviceLocation: boolean;
  setUseDeviceLocation: (on: boolean) => void;
}

/** Owner and location settings, read once and saved on every change. */
export function useSettings(): SettingsState {
  const [owner, setOwnerState] = useState(() => {
    const saved = readSetting(OWNER_KEY, DEFAULT_OWNER);
    return OWNER_PATTERN.test(saved) ? saved : DEFAULT_OWNER;
  });
  const [useDeviceLocation, setLocationState] = useState(
    () => readSetting(LOCATION_KEY, "on") === "on",
  );

  const setOwner = useCallback((next: string) => {
    if (!OWNER_PATTERN.test(next)) {
      throw new Error("owner must be lowercase letters, digits, `-` or `_`, up to 64 characters.");
    }
    writeSetting(OWNER_KEY, next);
    setOwnerState(next);
  }, []);

  const setUseDeviceLocation = useCallback((on: boolean) => {
    writeSetting(LOCATION_KEY, on ? "on" : "off");
    setLocationState(on);
  }, []);

  return { owner, setOwner, useDeviceLocation, setUseDeviceLocation };
}
