import { getServerSession } from 'next-auth'
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
    const res = await fetch(`${baseUrl}/api/outfit/generate`, {
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: (body as { error?: string }).error ?? 'unknown_error' }
    }
    const data = await res.json()
    return { ok: true, data: data as OutfitPayload }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const result = await fetchTodaysOutfit()

  // ─── Error: no location set ────────────────────────────────────────────────
  if (!result.ok && result.error === 'location_required') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="text-5xl">📍</div>
        <h2 className="text-2xl font-semibold text-zinc-800">Location required</h2>
        <p className="text-zinc-500 max-w-sm">
          FitCheck needs your location to factor in today&apos;s weather when building your outfit.
          Add it in your profile settings.
        </p>
        <a
          href="/profile"
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Go to Profile
        </a>
      </div>
    )
  }

  // ─── Error: not enough closet items ────────────────────────────────────────
  if (!result.ok && result.error === 'insufficient_closet') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="text-5xl">👗</div>
        <h2 className="text-2xl font-semibold text-zinc-800">Your closet needs more items</h2>
        <p className="text-zinc-500 max-w-sm">
          Upload at least 3 clothing items to your closet so FitCheck can build a complete outfit for you.
        </p>
        <a
          href="/closet"
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Upload Clothes
        </a>
      </div>
    )
  }

  // ─── Generic error ─────────────────────────────────────────────────────────
  if (!result.ok) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="text-5xl">⚠️</div>
        <h2 className="text-2xl font-semibold text-zinc-800">Something went wrong</h2>
        <p className="text-zinc-500 max-w-sm">
          We couldn&apos;t generate your outfit right now. Please try again in a moment.
        </p>
        <RegenerateButton />
      </div>
    )
  }

  const { outfit, items, suggestions, weather } = result.data

  // ─── Empty closet (no error but no outfit returned) ────────────────────────
  if (!outfit) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="text-5xl">👚</div>
        <h2 className="text-2xl font-semibold text-zinc-800">Your closet is empty</h2>
        <p className="text-zinc-500 max-w-sm">
          Start by uploading photos of your clothes so FitCheck can create personalized outfits for you.
        </p>
        <a
          href="/closet"
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Add to Closet
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Weather strip */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 border border-sky-200 px-4 py-2 text-sm text-sky-700 font-medium">
          <span>🌡</span>
          <span>{weather.temp}°F, {weather.condition}</span>
          {weather.rain_chance > 20 && (
            <span className="text-sky-500">· {weather.rain_chance}% rain</span>
          )}
        </div>
        <RegenerateButton />
      </div>

      {/* Today's Outfit */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">Today&apos;s Outfit</h2>
        <OutfitCard
          items={items}
          rationale={outfit.AI_RATIONALE ?? ''}
          weather={weather}
          outfitId={outfit.ID}
        />
      </section>

      {/* Shopping Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-zinc-800 mb-1">Complete the Look</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Pieces that would elevate today&apos;s outfit
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {suggestions.map((s, i) => (
              <ShoppingCard key={'ID' in s ? s.ID : i} suggestion={s as ShoppingSuggestion} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
