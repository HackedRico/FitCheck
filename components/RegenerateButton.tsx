'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const OCCASIONS = ['daily', 'work', 'interview', 'date night', 'party', 'weekend']

export default function RegenerateButton() {
  const [loading, setLoading] = useState(false)
  const [occasion, setOccasion] = useState('daily')
  const router = useRouter()

  async function handleRegenerate() {
    setLoading(true)
    try {
      await fetch('/api/outfit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occasion }),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={occasion}
        onChange={(e) => setOccasion(e.target.value)}
        disabled={loading}
        className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:border-zinc-400 disabled:opacity-50 capitalize"
      >
        {OCCASIONS.map((o) => (
          <option key={o} value={o} className="capitalize">
            {o}
          </option>
        ))}
      </select>
    <button
      onClick={handleRegenerate}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )}
      {loading ? 'Generating…' : 'Regenerate'}
    </button>
    </div>
  )
}
