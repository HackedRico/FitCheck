'use client'

import { useEffect, useState } from 'react'
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
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function EventsCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loaded, setLoaded] = useState(false)

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

  if (!loaded || events.length === 0) return null

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Today&apos;s Schedule</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Styled in
        </span>
      </div>
      <p className="text-xs text-zinc-400 mt-0.5 mb-2">
        Today&apos;s fit already accounts for what&apos;s on your calendar.
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
          </li>
        ))}
      </ul>
    </div>
  )
}
