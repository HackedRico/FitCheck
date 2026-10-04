'use client'

import type { ShoppingSuggestion } from '@/types'

interface ShoppingCardProps {
  suggestion: ShoppingSuggestion
}

export default function ShoppingCard({ suggestion }: ShoppingCardProps) {
  const isOnline = suggestion.source === 'online'

  const queryText =
    suggestion.search_query?.trim() ||
    [suggestion.brand, suggestion.name].filter(Boolean).join(' ').trim() ||
    suggestion.store_name

  const shopUrl = queryText
    ? isOnline
      ? `https://www.google.com/search?q=${encodeURIComponent(
          ['buy', suggestion.store_name, queryText].filter(Boolean).join(' ')
        )}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          suggestion.store_name
            ? `${suggestion.store_name} near me`
            : `stores selling ${queryText} near me`
        )}`
    : null

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm gap-3">
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

      <div className="flex items-center gap-3">
        {Number.isFinite(Number(suggestion.price)) && Number(suggestion.price) > 0 && (
          <span className="text-lg font-bold text-zinc-900">
            ${Number(suggestion.price).toFixed(0)}
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

      {suggestion.already_owned && (
        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5">
          <svg className="h-3.5 w-3.5 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-xs font-medium text-emerald-700">
            Already in your closet: {suggestion.already_owned}
          </p>
        </div>
      )}

      {suggestion.suggested_because && (
        <p className="text-xs text-zinc-500 leading-relaxed border-t border-zinc-100 pt-2">
          {suggestion.suggested_because}
        </p>
      )}

      {shopUrl && (
        <a
          href={shopUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          {isOnline ? (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          {isOnline
            ? `Shop Online${suggestion.store_name ? ` · ${suggestion.store_name}` : ''}`
            : `Find ${suggestion.store_name || 'a Store'} Nearby`}
        </a>
      )}
    </div>
  )
}
