'use client'

import { useState } from 'react'
import type { ClosetItemRow } from '@/types'

interface Props {
  item: ClosetItemRow
  onDelete?: (id: string) => void
  onUpdate?: (item: ClosetItemRow) => void
}

const DOT_PALETTE: Record<string, string> = {
  black: '#111111',
  white: '#f5f5f5',
  grey: '#9ca3af',
  gray: '#9ca3af',
  red: '#ef4444',
  pink: '#ec4899',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  navy: '#1e3a5f',
  purple: '#a855f7',
  brown: '#92400e',
  beige: '#d2b48c',
  cream: '#fffdd0',
  khaki: '#c3b091',
}

function colorDot(colorName: string) {
  const key = colorName.toLowerCase().replace(/\s+/g, '')
  const bg = DOT_PALETTE[key] ?? '#6b7280'
  return (
    <span
      key={colorName}
      title={colorName}
      style={{ backgroundColor: bg }}
      className="inline-block w-3 h-3 rounded-full border border-zinc-300 flex-shrink-0"
    />
  )
}

export default function ClosetItemCard({ item, onDelete, onUpdate }: Props) {
  const [retrying, setRetrying] = useState(false)
  const imageUrl = item.THUMBNAIL_URL ?? item.IMAGE_URL
  const isPending = item.AI_STATUS === 'pending'
  const isFailed = item.AI_STATUS === 'failed'

  async function retryAnalysis() {
    if (retrying) return
    setRetrying(true)
    try {
      const res = await fetch('/api/closet/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.ID }),
      })
      const data = (await res.json()) as { item?: ClosetItemRow }
      if (res.ok && data.item && onUpdate) onUpdate(data.item)
    } catch {
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="group relative rounded-2xl overflow-hidden bg-white border border-zinc-200 hover:border-zinc-300 transition-colors">
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-50">
        <img
          src={imageUrl}
          alt={item.SUBCATEGORY ?? item.CATEGORY ?? 'Closet item'}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {(isPending || retrying) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70">
            <svg
              className="w-7 h-7 animate-spin text-zinc-700"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-xs text-zinc-600">Analysing…</span>
          </div>
        )}

        {isFailed && !retrying && (
          <button
            onClick={(e) => {
              e.preventDefault()
              retryAnalysis()
            }}
            className="absolute top-2 left-2 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 hover:bg-amber-100 transition-colors"
          >
            <svg
              className="w-3 h-3 text-amber-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs text-amber-700 font-medium">Retry analysis</span>
          </button>
        )}

        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault()
              onDelete(item.ID)
            }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 text-base leading-none"
            aria-label="Delete item"
          >
            ×
          </button>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        {item.CATEGORY && (
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-600 border border-violet-100">
            {item.CATEGORY}
          </span>
        )}

        {item.SUBCATEGORY && (
          <p className="text-sm text-zinc-700 leading-snug">{item.SUBCATEGORY}</p>
        )}

        {item.COLORS && item.COLORS.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {item.COLORS.slice(0, 6).map((c) => colorDot(c))}
          </div>
        )}
      </div>
    </div>
  )
}
