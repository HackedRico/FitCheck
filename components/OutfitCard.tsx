'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { ClosetItemRow, WeatherContext } from '@/types'

interface OutfitCardProps {
  items: ClosetItemRow[]
  rationale: string
  weather: WeatherContext
  outfitId: string
}

export default function OutfitCard({ items, rationale, weather, outfitId }: OutfitCardProps) {
  const [saved, setSaved] = useState(false)
  const [worn, setWorn] = useState(false)
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [wornState, setWornState] = useState<'idle' | 'saving' | 'error'>('idle')

  async function handleSave() {
    if (saved) return
    setSavingState('saving')
    try {
      const res = await fetch(`/api/outfit/${outfitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_saved: true }),
      })
      if (res.ok) {
        setSaved(true)
        setSavingState('idle')
      } else {
        setSavingState('error')
      }
    } catch {
      setSavingState('error')
    }
  }

  async function handleMarkWorn() {
    if (worn) return
    setWornState('saving')
    try {
      const res = await fetch(`/api/outfit/${outfitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_worn: true, worn_date: new Date().toISOString().split('T')[0] }),
      })
      if (res.ok) {
        setWorn(true)
        setWornState('idle')
      } else {
        setWornState('error')
      }
    } catch {
      setWornState('error')
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      {/* Item image grid */}
      <div
        className={`grid gap-1 p-4 ${
          items.length <= 2
            ? 'grid-cols-2'
            : items.length === 3
            ? 'grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3'
        }`}
      >
        {items.slice(0, 6).map((item) => (
          <div
            key={item.ID}
            className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100"
          >
            <Image
              src={item.THUMBNAIL_URL ?? item.IMAGE_URL}
              alt={item.SUBCATEGORY ?? item.CATEGORY ?? 'clothing item'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 33vw"
            />
            {item.CATEGORY && (
              <span className="absolute bottom-1 left-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {item.CATEGORY}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Rationale and weather */}
      <div className="px-4 pb-2 space-y-3">
        {/* Weather pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-3 py-1 text-xs font-medium text-sky-600">
          <span>🌡</span>
          <span>{weather.temp}°F</span>
          <span className="text-sky-400">•</span>
          <span>{weather.condition}</span>
        </div>

        {/* AI rationale */}
        {rationale && (
          <p className="text-sm text-zinc-600 leading-relaxed">{rationale}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-4 border-t border-zinc-100">
        <button
          onClick={handleSave}
          disabled={saved || savingState === 'saving'}
          className={`flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium transition-colors ${
            saved
              ? 'bg-zinc-100 text-zinc-400 cursor-default'
              : 'bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-60'
          }`}
        >
          {savingState === 'saving' ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          )}
          {saved ? 'Saved' : 'Save Outfit'}
        </button>

        <button
          onClick={handleMarkWorn}
          disabled={worn || wornState === 'saving'}
          className={`flex-1 flex items-center justify-center gap-2 rounded-full border py-2.5 text-sm font-medium transition-colors ${
            worn
              ? 'border-zinc-200 bg-zinc-50 text-zinc-400 cursor-default'
              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-60'
          }`}
        >
          {wornState === 'saving' ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {worn ? 'Worn Today' : 'Mark as Worn'}
        </button>
      </div>

      {(savingState === 'error' || wornState === 'error') && (
        <p className="px-4 pb-3 text-xs text-red-500 text-center">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  )
}
