# The week: weather and calendar

A verdict weighs the candidate against the closet and the week: the forecast for the coming days and the owner's plans. `Engine.judge` asks the `weather` slot for a `Forecast` and the `calendar` slot for `CalendarEvent`s, bundles them into a `WeekContext` and hands it to `fitcheck.verdict.decide`. Rain on a day with no waterproof outerwear in the closet, or an occasion more formal than anything the owner has, is a gap the candidate can fill.

Either source may fail. The engine then records the step as skipped in the pipeline and decides without it, so a dead wifi link costs the weather reasons, not the verdict.

## Adapters

| Env value | What it serves | `runs_on` |
| --- | --- | --- |
| `FITCHECK_WEATHER=fixture` (default) | A fixed demo week starting today | this machine |
| `FITCHECK_WEATHER=open_meteo` | The real forecast from api.open-meteo.com | public API |
| `FITCHECK_CALENDAR=fixture` (default) | Three demo plans | this machine |
| `FITCHECK_CALENDAR=none` | No plans | this machine |
| `FITCHECK_CALENDAR=ics` | One iCal feed, from an https address or a file | public API for https, this machine for a file |

`GET /week/{owner}` shows what the engine sees, with the pipeline.

The demo verdicts depend on the fixtures, and tests pin every number. The fixture weather has rain of at least 1 mm on days 2, 4 and 5 (today is day 1), lows of 8 to 14 C and highs of 14 to 20 C. The fixture calendar has "Climbing gym" on day 1 at 18:00, "Team dinner" on day 3 at 19:30 and "Job interview" on day 5 at 10:00.

## Occasions

`fitcheck.context.occasions.infer_formality` reads an event title and returns its dress code, the same way for every calendar adapter. It matches whole words in any case, and the strictest keyword in the title wins.

| Dress code | Keywords |
| --- | --- |
| 1 | gym, run, climbing |
| 2 | brunch, drinks, coffee |
| 3 | dinner, date, party, presentation |
| 4 | interview, client meeting, office |
| 5 | wedding, gala, black tie, formal |

A title with none of these, such as "Dentist", gets no dress code and does not count as an occasion.

## Connect a Google Calendar

1. Open Google Calendar on the web, go to Settings, and pick your calendar under "Settings for my calendars".
2. Under "Integrate calendar", copy "Secret address in iCal format".
3. Put it in `engine/.env`, which git ignores:

   ```
   FITCHECK_CALENDAR=ics
   FITCHECK_CALENDAR_ICS_URL=https://calendar.google.com/calendar/ical/.../private-.../basic.ics
   ```

4. Restart the API and check `GET /week/ricky`.

The secret address works like a password: anyone holding it can read the calendar. Never commit it or paste it in chat. FitCheck keeps it in a `SecretStr` and leaves it out of every log line and error message. If it leaks, reset it on the same Google settings page.

The adapter expands recurring events, drops cancelled ones and caches the feed for 5 minutes. Google can take a while to publish edits to the feed, so add events well before a demo. One feed serves every owner.

For an offline demo, point the same setting at a file: `FITCHECK_CALENDAR_ICS_URL=tests/context/week.ics`. A relative path resolves from the folder the API starts in, which is `engine/` for `make api`.

### Why not OAuth

Reading a calendar through Google's API needs a Google Cloud project, an OAuth consent screen with every teammate added as a test user (or Google's review of the calendar scope), a redirect flow and per-owner token storage. None of that helps the demo. The secret address is one read-only string with no app review. The cost: one calendar for the whole app, no sign-in per owner, and the owner has to guard the address.

## Open-Meteo attribution

Open-Meteo's forecast data is licensed CC BY 4.0, so every screen that shows forecast numbers must credit it. The adapter sets `Forecast.attribution` to "Weather data by Open-Meteo.com"; the web app shows that text as a link to https://open-meteo.com/ wherever the forecast appears. The fixture sets its own attribution, "Demo weather, not a real forecast", so the UI never credits Open-Meteo for numbers it did not make. Show whatever `attribution` says rather than hard-coding the line.

Requests send only coordinates, rounded to two decimals (about 1 km), and never an image. Answers are cached in memory for 30 minutes per location and day count, so a wifi drop within 30 minutes of a successful call does not lose the forecast. Call `GET /week/{owner}` once just before a demo. The free API is for non-commercial use.
