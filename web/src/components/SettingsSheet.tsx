import { useState, type FormEvent, type ReactNode } from "react";

import { useApp } from "../state/app";
import { OWNER_PATTERN } from "../state/settings";
import { Sheet } from "./Sheet";

// =============================================================================
// Module Overview
// =============================================================================
// Settings: whose closet to use (the owner) and whether to send this device's
// location, rounded to about 1 km, for the forecast.

const LOCATION_WORDS = {
  off: "Off. The engine's default city is used.",
  asking: "Asking the browser",
  on: "On, rounded to about 1 km",
  denied: "Blocked by the browser. The engine's default city is used.",
  unavailable: "Not available. The engine's default city is used.",
} as const;

/** The settings sheet. */
export function SettingsSheet(): ReactNode {
  const { sheet, openSheet, settings, location } = useApp();
  const [draft, setDraft] = useState(settings.owner);
  const valid = OWNER_PATTERN.test(draft);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (valid) settings.setOwner(draft);
  };

  return (
    <Sheet open={sheet === "settings"} title="Settings" onClose={() => openSheet(null)}>
      <form className="field" onSubmit={submit}>
        <label className="kicker" htmlFor="owner">
          Owner
        </label>
        <div className="field-row">
          <input
            id="owner"
            value={draft}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value.trim().toLowerCase())}
          />
          <button type="submit" className="btn btn-solid" disabled={!valid || draft === settings.owner}>
            Use
          </button>
        </div>
        {!valid && <p className="muted">Lowercase letters, digits, - or _.</p>}
      </form>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.useDeviceLocation}
          onChange={(event) => settings.setUseDeviceLocation(event.target.checked)}
        />
        <span>
          Use this device's location for the weather
          <small className="muted">{LOCATION_WORDS[location.status]}</small>
        </span>
      </label>
    </Sheet>
  );
}
