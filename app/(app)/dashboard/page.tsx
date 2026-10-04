import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import type { OutfitRow, ClosetItemRow, ProductSuggestionRow, WeatherContext, ShoppingSuggestion } from '@/types'
import OutfitCard from '@/components/OutfitCard'
import ShoppingCard from '@/components/ShoppingCard'
import RegenerateButton from '@/components/RegenerateButton'

interface OutfitPayload {
  outfit: OutfitRow
  items: ClosetItemRow[]
  suggestions: (ProductSuggestionRow | ShoppingSuggestion)[]
  weather: WeatherContext
}

async function fetchTodaysOutfit(): Promise<
  | { ok: true; data: OutfitPayload }
  | { ok: false; error: string }
> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const cookieStore = await cookies()
    const res = await fetch(`${baseUrl}/api/outfit/generate`, {
      cache: 'no-store',
      headers: { cookie: cookieStore.toString() },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: (body as { error?: string }).error ?? 'unknown_error' }
    }
    return { ok: true, data: await res.json() as OutfitPayload }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const result = await fetchTodaysOutfit()

  if (!result.ok && result.error === 'location_required') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="text-5xl">📍</div>
        <h2 className="text-2xl font-semibold text-zinc-800">Location required</h2>
        <p className="text-zinc-500 max-w-sm">
          FitCheck needs your location to factor in today&apos;s weather. Add it in your profile settings.
        </p>
        <a
          href="/profile"
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Go to Profile
        </a>
      </div>
    )
  }

  if (!result.ok && result.error === 'insufficient_closet') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="text-5xl">👗</div>
        <h2 className="text-2xl font-semibold text-zinc-800">Upload at least 3 items</h2>
        <p className="text-zinc-500 max-w-sm">
          FitCheck needs at least 3 analyzed pieces to build a real combination for you.
        </p>
        <a
          href="/closet/upload"
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Upload Clothes
        </a>
      </div>
    )
  }

  if (!result.ok || !result.data.outfit) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="text-5xl">⚠️</div>
        <h2 className="text-2xl font-semibold text-zinc-800">Something went wrong</h2>
        <p className="text-zinc-500 max-w-sm">Couldn&apos;t build your outfit right now. Try again.</p>
        <RegenerateButton />
      </div>
    )
  }

  const { outfit, items, suggestions, weather } = result.data

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Today&apos;s Fit</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{weather.temp}°F, {weather.condition}</p>
        </div>
        <RegenerateButton />
      </div>

      <OutfitCard
        items={items}
        rationale={outfit.AI_RATIONALE ?? ''}
        weather={weather}
        outfitId={outfit.ID}
      />

      {suggestions && suggestions.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none flex items-center justify-between py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 transition-colors select-none">
            <span>Gap Fillers ({suggestions.length})</span>
            <svg className="h-4 w-4 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((s, i) => (
              <ShoppingCard key={'ID' in s ? s.ID : i} suggestion={s as ShoppingSuggestion} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
