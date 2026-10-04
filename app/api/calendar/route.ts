import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(`${ENGINE_URL}/week/demo`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) throw new Error(`engine ${res.status}`)
    const data = (await res.json()) as { week?: { events?: EngineEvent[] } }
    const raw = Array.isArray(data.week?.events) ? data.week.events : []

    const events: CalendarEvent[] = raw
      .filter((e) => typeof e.title === 'string' && typeof e.start === 'string')
      .map((e) => ({
        title: e.title,
        start: e.start,
        formality: FORMALITY_LABELS[e.formality] ?? 'casual',
      }))
      .slice(0, 5)

    return Response.json({ events })
  } catch {
    return Response.json({ events: [] })
  }
}
