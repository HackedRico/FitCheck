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
  const [activeItem, setActiveItem] = useState<ClosetItemRow | null>(null)

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
      <div className="flex gap-2 p-4">
        {items.slice(0, 4).map((item) => (
          <button
            key={item.ID}
            type="button"
            onClick={() => setActiveItem(activeItem?.ID === item.ID ? null : item)}
            className={`relative flex-1 aspect-[3/4] rounded-xl overflow-hidden bg-zinc-100 transition-all ${
              activeItem?.ID === item.ID ? 'ring-2 ring-violet-500 ring-offset-2' : ''
            }`}
          >
            <Image
              src={item.THUMBNAIL_URL ?? item.IMAGE_URL}
              alt={item.SUBCATEGORY ?? item.CATEGORY ?? 'clothing item'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 25vw, 20vw"
            />
            <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
              <span className="block text-[10px] font-medium text-white leading-tight">
                {item.SUBCATEGORY ?? item.CATEGORY}
              </span>
            </span>
          </button>
        ))}
      </div>

      {activeItem && (
        <div className="mx-4 mb-3 rounded-xl bg-zinc-50 border border-zinc-200 p-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-800 capitalize">
              {activeItem.SUBCATEGORY ?? activeItem.CATEGORY}
            </span>
            {activeItem.FORMALITY && (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600">
                {activeItem.FORMALITY}
              </span>
            )}
          </div>
          {activeItem.COLORS && activeItem.COLORS.length > 0 && (
            <div className="flex items-center gap-1.5">
              {activeItem.COLORS.map((c) => (
                <span key={c} className="text-xs text-zinc-500 capitalize">{c}</span>
              ))}
            </div>
          )}
          {activeItem.AI_DESCRIPTION && (
            <p className="text-xs text-zinc-500 leading-relaxed">{activeItem.AI_DESCRIPTION}</p>
          )}
        </div>
      )}

      <div className="px-4 pb-3 space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-3 py-1 text-xs font-medium text-sky-600">
          <span>🌡</span>
          <span>{weather.temp}°F • {weather.condition}</span>
          {weather.rain_chance > 20 && (
            <span className="text-sky-400">• {weather.rain_chance}% rain</span>
          )}
        </div>

        {rationale && (
          <p className="text-sm font-medium text-zinc-700 leading-relaxed">{rationale}</p>
        )}
      </div>

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
        <p className="px-4 pb-3 text-xs text-red-500 text-center">Something went wrong. Please try again.</p>
      )}
    </div>
  )
}
