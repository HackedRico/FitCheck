import type { CalendarEvent } from '@/types'

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:8000'

const FORMALITY_LABELS: Record<number, string> = {
  1: 'casual',
  2: 'smart casual',
  3: 'dressy',
  4: 'formal',
}

interface EngineEvent {
  title: string
  start: string
  end: string | null
  location: string | null
  formality: number
}

export async function getTodaysEvents(): Promise<CalendarEvent[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/week/demo`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { week?: { events?: EngineEvent[] } }
    const raw = Array.isArray(data.week?.events) ? data.week.events : []
    const today = new Date().toDateString()

    return raw
      .filter(
        (e) =>
          typeof e.title === 'string' &&
          typeof e.start === 'string' &&
          new Date(e.start).toDateString() === today
      )
      .map((e) => ({
        title: e.title,
        start: e.start,
        formality: FORMALITY_LABELS[e.formality] ?? 'casual',
      }))
      .slice(0, 5)
  } catch {
    return []
  }
}

export function occasionFromEvents(events: CalendarEvent[]): string | null {
  if (events.length === 0) return null
  return events.map((e) => `${e.title} (${e.formality})`).join(', ')
}
