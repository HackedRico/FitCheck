'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CalendarEvent } from '@/types'

const FORMALITY_STYLES: Record<string, string> = {
  casual: 'bg-emerald-50 text-emerald-700',
  'smart casual': 'bg-sky-50 text-sky-700',
  dressy: 'bg-violet-50 text-violet-700',
  formal: 'bg-zinc-900 text-white',
}

function formatEventTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today ${time}`
  return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`
}

export default function EventsCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [dressing, setDressing] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    fetch('/api/calendar')
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data: { events?: CalendarEvent[] }) => {
        if (!cancelled) setEvents(Array.isArray(data.events) ? data.events : [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function dressFor(event: CalendarEvent) {
    setDressing(event.title)
    try {
      await fetch('/api/outfit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occasion: `${event.title} (${event.formality})` }),
      })
      router.refresh()
    } finally {
      setDressing(null)
    }
  }

  if (!loaded || events.length === 0) return null

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold text-zinc-900">On Your Calendar</h2>
      <p className="text-xs text-zinc-400 mt-0.5 mb-3">
        Get an outfit styled for a specific event.
      </p>
      <ul className="divide-y divide-zinc-100">
        {events.map((event) => (
          <li key={`${event.title}-${event.start}`} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-800 truncate">{event.title}</p>
              <p className="text-xs text-zinc-400">{formatEventTime(event.start)}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${
                FORMALITY_STYLES[event.formality] ?? 'bg-zinc-100 text-zinc-600'
              }`}
            >
              {event.formality}
            </span>
            <button
              onClick={() => dressFor(event)}
              disabled={dressing !== null}
              className="shrink-0 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              {dressing === event.title ? 'Styling…' : 'Dress for this'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
