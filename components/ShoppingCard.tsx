'use client'

import type { ShoppingSuggestion } from '@/types'

interface ShoppingCardProps {
  suggestion: ShoppingSuggestion
}

export default function ShoppingCard({ suggestion }: ShoppingCardProps) {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.search_query)}`

  const isOnline = suggestion.source === 'online'

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm gap-3">
      {/* Header row: name + source badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 text-sm leading-tight truncate">
            {suggestion.name}
          </p>
          {suggestion.brand && (
            <p className="text-xs text-zinc-500 mt-0.5">{suggestion.brand}</p>
          )}
        </div>

        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isOnline
              ? 'bg-violet-50 text-violet-600 border border-violet-200'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}
        >
          {isOnline ? 'Online' : 'In-Store'}
        </span>
      </div>

      {/* Price + store */}
      <div className="flex items-center gap-3">
        {suggestion.price != null && (
          <span className="text-lg font-bold text-zinc-900">
            ${suggestion.price.toFixed(0)}
          </span>
        )}
        {suggestion.store_name && (
          <span className="text-xs text-zinc-500 border border-zinc-200 rounded-full px-2 py-0.5">
            {suggestion.store_name}
          </span>
        )}
        {suggestion.category && (
          <span className="text-xs text-zinc-400 ml-auto">{suggestion.category}</span>
        )}
      </div>

      {/* Why suggested */}
      {suggestion.suggested_because && (
        <p className="text-xs text-zinc-500 leading-relaxed border-t border-zinc-100 pt-2">
          {suggestion.suggested_because}
        </p>
      )}

      {/* CTA */}
      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Find It
      </a>
    </div>
  )
}
