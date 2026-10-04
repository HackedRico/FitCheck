'use client'

import { useState } from 'react'

interface SearchResult {
  id: string
  thumbnail_url: string
  category: string | null
  subcategory: string | null
  description: string | null
  score: number
}

export default function ClosetSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/closet/search?q=${encodeURIComponent(q.trim())}`)
      const data = (await res.json()) as { results?: SearchResult[]; error?: string }
      if (!res.ok || !data.results) throw new Error(data.error ?? 'Search failed')
      setResults(data.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-6 space-y-4">
      <form onSubmit={search} className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Search your closet by vibe — "cozy fall layers", "interview outfit"…'
          className="flex-1 rounded-full border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="rounded-full bg-zinc-900 hover:bg-zinc-700 disabled:opacity-50 px-5 py-2.5 text-sm font-medium text-white transition-colors shrink-0"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        {results && (
          <button
            type="button"
            onClick={() => {
              setResults(null)
              setQ('')
            }}
            className="rounded-full border border-zinc-200 px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors shrink-0"
          >
            Clear
          </button>
        )}
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {results && results.length === 0 && (
        <p className="text-sm text-zinc-500">No matches in your closet.</p>
      )}

      {results && results.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
            Semantic matches via Snowflake vector search
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {results.map((r) => (
              <div
                key={r.id}
                className="rounded-xl overflow-hidden bg-white border border-zinc-200"
              >
                <div className="aspect-[3/4] relative">
                  <img
                    src={r.thumbnail_url}
                    alt={r.subcategory ?? 'item'}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {Math.round(r.score * 100)}%
                  </span>
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium text-zinc-700 truncate">
                    {r.subcategory ?? r.category ?? 'Item'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
