'use client'

import { useEffect, useRef, useState } from 'react'
import ShoppingCard from '@/components/ShoppingCard'
import type { ShoppingSuggestion } from '@/types'

const STORES_KEY = 'fitcheck.preferredStores'

export default function ShopPage() {
  const [queryText, setQueryText] = useState('')
  const storesRef = useRef<HTMLInputElement>(null)
  const [advice, setAdvice] = useState('')
  const [suggestions, setSuggestions] = useState<ShoppingSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORES_KEY)
    if (saved && storesRef.current) storesRef.current.value = saved
  }, [])

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!queryText.trim() || loading) return
    setLoading(true)
    setError(null)
    const storesText = storesRef.current?.value ?? ''
    window.localStorage.setItem(STORES_KEY, storesText)
    try {
      const res = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText.trim(),
          stores: storesText.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      })
      const data = (await res.json()) as {
        advice?: string
        suggestions?: ShoppingSuggestion[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setAdvice(data.advice ?? '')
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Shopping Assistant</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Personal picks based on your style, budget, closet and where you like to shop.
        </p>
      </div>

      <form onSubmit={search} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
        <div>
          <label htmlFor="shop-query" className="block text-xs font-medium text-zinc-500 mb-1">
            What are you shopping for?
          </label>
          <input
            id="shop-query"
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="e.g. a rain jacket for fall, white sneakers under $100…"
            className="w-full rounded-full border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
          />
        </div>
        <div>
          <label htmlFor="shop-stores" className="block text-xs font-medium text-zinc-500 mb-1">
            Where do you want to shop? (optional, comma-separated)
          </label>
          <input
            id="shop-stores"
            type="text"
            ref={storesRef}
            placeholder="e.g. Uniqlo, Nordstrom, Target"
            className="w-full rounded-full border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !queryText.trim()}
          className="w-full rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Finding your picks…' : 'Find It For Me'}
        </button>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      </form>

      {advice && (
        <div className="rounded-2xl bg-violet-50 border border-violet-100 px-4 py-3">
          <p className="text-sm text-violet-700">{advice}</p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suggestions.map((s, i) => (
            <ShoppingCard key={`${s.name}-${i}`} suggestion={s} />
          ))}
        </div>
      )}

      {searched && !loading && suggestions.length === 0 && !error && (
        <p className="text-sm text-zinc-400 text-center py-8">
          No picks found — try describing it differently.
        </p>
      )}
    </div>
  )
}
