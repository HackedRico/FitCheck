import type { CalendarEvent, DayForecast } from "../api/client";

// =============================================================================
// Module Overview
// =============================================================================
// Turns the week from `/judge` into what the week strip draws: a `WeatherKind`
// per WMO weather code, day labels, and calendar events grouped by day.

export type WeatherKind = "clear" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** Map a WMO weather interpretation code, as Open-Meteo reports it, to a glyph kind. */
export function weatherKind(day: DayForecast): WeatherKind {
  const code = day.weather_code;
  if (code === null || code === undefined) return day.precipitation_mm >= 1 ? "rain" : "cloud";
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloud";
}

const KIND_WORD: Record<WeatherKind, string> = {
  clear: "clear",
  partly: "partly cloudy",
  cloud: "cloudy",
  fog: "fog",
  drizzle: "drizzle",
  rain: "rain",
  snow: "snow",
  storm: "storms",
};

/** Plain words for a weather kind, for screen readers and captions. */
export function weatherWord(kind: WeatherKind): string {
  return KIND_WORD[kind];
}

/** Parse an ISO `YYYY-MM-DD` as a local date, so the weekday does not shift by timezone. */
export function parseDay(isoDay: string): Date {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Local `YYYY-MM-DD` key for a timestamp, matching `DayForecast.day`. */
export function dayKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Group events by the local day they start on. */
export function eventsByDay(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dayKey(new Date(event.start));
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  return grouped;
}

/** "14:30" style local start time for an event. */
export function startTime(event: CalendarEvent): string {
  return new Date(event.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
