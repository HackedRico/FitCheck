import type { ReactNode } from "react";

import type { WeatherKind } from "../lib/weather";

// =============================================================================
// Module Overview
// =============================================================================
// The app's line icons as inline SVG, drawn in `currentColor` on a 24 px grid so
// they inherit text colour. `Icon` picks one by name; `WeatherGlyph` draws the
// week strip's weather kinds.

const PATHS = {
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 15v5h16v-5" />
    </>
  ),
  flip: (
    <>
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  person: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 21v-3a7 7 0 0 1 14 0v3" />
    </>
  ),
  live: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
    </>
  ),
  hanger: (
    <>
      <path d="M12 7a2 2 0 1 1 2-2c0 1.5-2 1.8-2 3.5" />
      <path d="M12 8.5 3 15v2h18v-2z" />
    </>
  ),
  send: <path d="M4 12 20 4l-6 16-3-7z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/** A decorative 24 px line icon in the current text colour; its button or label carries the name. */
export function Icon({ name }: { name: IconName }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

const SUN = <circle cx="12" cy="12" r="4.5" />;
const RAYS = <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />;
const CLOUD = <path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 7 18z" />;

const WEATHER: Record<WeatherKind, ReactNode> = {
  clear: (
    <>
      {SUN}
      {RAYS}
    </>
  ),
  partly: (
    <>
      <path d="M9 4.5a4.5 4.5 0 0 1 6.2 4" />
      <path d="M9 2v1M3.5 8.5h1M5 4.5l.8.8" />
      <path d="M8 20h9a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.1.9A3 3 0 0 0 8 20z" />
    </>
  ),
  cloud: CLOUD,
  fog: <path d="M4 9h16M2 13h20M5 17h14" />,
  drizzle: (
    <>
      <path d="M7 14h10a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.1.9A3 3 0 0 0 7 14z" />
      <path d="M9 17v1M13 18v1M17 17v1" />
    </>
  ),
  rain: (
    <>
      <path d="M7 13h10a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.1.9A3 3 0 0 0 7 13z" />
      <path d="M8 16l-1 4M12 16l-1 4M16 16l-1 4" />
    </>
  ),
  snow: (
    <>
      <path d="M7 13h10a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.1.9A3 3 0 0 0 7 13z" />
      <path d="M8 17v.5M12 19v.5M16 17v.5M10 21v.5M14 21v.5" />
    </>
  ),
  storm: (
    <>
      <path d="M7 13h10a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.1.9A3 3 0 0 0 7 13z" />
      <path d="M12 14l-2 4h4l-2 4" />
    </>
  ),
};

/** A weather glyph for one day of the week strip. */
export function WeatherGlyph({ kind }: { kind: WeatherKind }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {WEATHER[kind]}
    </svg>
  );
}
