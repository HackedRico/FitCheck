import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, errorMessage, type HealthOut } from "../api/client";
import { useRoute, type Route } from "../lib/route";
import { useCandidateFlow, type Flow } from "./candidate";
import { useDeviceLocation, type LocationState } from "./location";
import { useOutfit, type OutfitState } from "./outfit";
import { usePersonPhoto, type PersonState } from "./person";
import { usePipelines, type PipelinesState } from "./pipelines";
import { useSettings, type SettingsState } from "./settings";

// =============================================================================
// Module Overview
// =============================================================================
// One React context that every screen reads through `useApp`: the route, the
// owner settings, device location, the person photo, the candidate `Flow`, the
// outfit in the live preview, the recorded pipelines, engine health, and which
// sheet is open.

export type Sheet = "pipeline" | "settings" | null;

export interface EngineHealth {
  health: HealthOut | null;
  error: string | null;
  refresh: () => void;
}

export interface AppState {
  route: Route;
  navigate: (next: Route) => void;
  settings: SettingsState;
  location: LocationState;
  person: PersonState;
  pipelines: PipelinesState;
  flow: Flow;
  outfit: OutfitState;
  engine: EngineHealth;
  sheet: Sheet;
  openSheet: (sheet: Sheet) => void;
}

const AppContext = createContext<AppState | null>(null);

/** Provide the app state to every screen. */
export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const [route, navigate] = useRoute();
  const settings = useSettings();
  const location = useDeviceLocation(settings.useDeviceLocation);
  const person = usePersonPhoto();
  const pipelines = usePipelines();
  const engine = useEngineHealth();
  const outfit = useOutfit();
  const [sheet, openSheet] = useState<Sheet>(null);

  const flow = useCandidateFlow({
    owner: settings.owner,
    resolveLocation: location.resolve,
    record: pipelines.record,
    personPhoto: person.photo,
  });

  // The hooks above return fresh objects each render, so memoising this bundle would buy nothing
  const value: AppState = { route, navigate, settings, location, person, pipelines, flow, outfit, engine, sheet, openSheet };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Read the app state; only valid under `AppProvider`. */
export function useApp(): AppState {
  const state = useContext(AppContext);
  if (state === null) throw new Error("useApp must be called inside `AppProvider`.");
  return state;
}

function useEngineHealth(): EngineHealth {
  const [health, setHealth] = useState<HealthOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((out) => {
        if (cancelled) return;
        setHealth(out);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  return useMemo(() => ({ health, error, refresh }), [health, error, refresh]);
}
