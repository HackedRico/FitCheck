import type { CSSProperties, ReactNode } from "react";

import type { CalendarEvent, WeekContext } from "../api/client";
import { dressCode } from "../lib/garments";
import { dayKey, eventsByDay, parseDay, startTime, weatherKind, weatherWord } from "../lib/weather";
import { WeatherGlyph } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// The week a verdict weighed: seven days of forecast with highs, lows and a rain
// bar, plans pinned to their day with the inferred dress code, and the
// Open-Meteo attribution its CC BY 4.0 licence requires.

function FormalityDots({ value }: { value: number }): ReactNode {
  return (
    <span className="dots" role="img" aria-label={`dress code ${dressCode(value)}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} data-on={n <= value} />
      ))}
    </span>
  );
}

function EventRow({ event }: { event: CalendarEvent }): ReactNode {
  const day = new Date(event.start).toLocaleDateString([], { weekday: "short" });
  return (
    <li className="event">
      <span className="event-when">
        {day} {startTime(event)}
      </span>
      <span className="event-title">{event.title}</span>
      {event.formality !== null && event.formality !== undefined ? (
        <span className="event-code">
          {dressCode(event.formality)}
          <FormalityDots value={event.formality} />
        </span>
      ) : (
        <span className="event-code is-unknown">no dress code</span>
      )}
    </li>
  );
}

/** Seven days of weather and the owner's plans, as the verdict saw them. */
export function WeekStrip({ week }: { week: WeekContext }): ReactNode {
  const forecast = week.forecast ?? null;
  const events = eventsByDay(week.events);
  const days = forecast?.days ?? [];
  const today = dayKey(new Date());

  return (
    <section className="week" aria-label="The week">
      <header className="week-head">
        <h3 className="kicker">The week{forecast?.location.name ? ` in ${forecast.location.name}` : ""}</h3>
      </header>
      {days.length > 0 ? (
        <ol className="week-days">
          {days.map((day, i) => {
            const kind = weatherKind(day);
            const date = parseDay(day.day);
            const planned = events.get(day.day)?.length ?? 0;
            const rain = day.precipitation_probability ?? Math.min(100, day.precipitation_mm * 10);
            return (
              <li
                key={day.day}
                className="week-day"
                data-kind={kind}
                data-today={day.day === today}
                style={{ "--i": i, "--rain": `${rain}%` } as CSSProperties}
              >
                <span className="week-dow">{date.toLocaleDateString([], { weekday: "short" })}</span>
                <span className="week-date">{date.getDate()}</span>
                <span className="week-glyph" role="img" aria-label={weatherWord(kind)} title={weatherWord(kind)}>
                  <WeatherGlyph kind={kind} />
                </span>
                <span className="week-hi">{Math.round(day.temp_max_c)}°</span>
                <span className="week-lo">{Math.round(day.temp_min_c)}°</span>
                <span className="week-rain" role="img" aria-label={`${Math.round(rain)}% chance of rain`}>
                  <span />
                </span>
                {planned > 0 && <span className="week-plan" role="img" aria-label={`${planned} plans`} />}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="week-missing">No forecast this time. The verdict went ahead without the weather.</p>
      )}
      {week.events.length > 0 ? (
        <ul className="events">
          {week.events.map((event, i) => (
            <EventRow key={`${event.start}-${i}`} event={event} />
          ))}
        </ul>
      ) : (
        <p className="week-missing">No plans on the calendar this week.</p>
      )}
      {forecast && <p className="attribution">{forecast.attribution ?? "Weather data by Open-Meteo.com"}</p>}
    </section>
  );
}
