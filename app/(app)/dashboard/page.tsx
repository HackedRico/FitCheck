import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import type { OutfitRow, ClosetItemRow, WeatherContext, ShoppingSuggestion } from '@/types'
import OutfitCard from '@/components/OutfitCard'
import ShoppingCard from '@/components/ShoppingCard'
import RegenerateButton from '@/components/RegenerateButton'
import TryOnCard from '@/components/TryOnCard'
import EventsCard from '@/components/EventsCard'

interface OutfitPayload {
  outfit: OutfitRow
  items: ClosetItemRow[]
  suggestions: ShoppingSuggestion[]
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
          <p className="text-sm text-zinc-400 mt-0.5">
            {weather.temp}°F, {weather.condition}
            {outfit.OCCASION && outfit.OCCASION !== 'daily' && (
              <span className="ml-2 inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-600 capitalize">
                {outfit.OCCASION}
              </span>
            )}
          </p>
        </div>
        <RegenerateButton />
      </div>

      <OutfitCard
        items={items}
        rationale={outfit.AI_RATIONALE ?? ''}
        weather={weather}
        outfitId={outfit.ID}
      />

      <EventsCard />

      <TryOnCard outfitId={outfit.ID} />

      {suggestions && suggestions.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between py-2">
            <h2 className="text-base font-semibold text-zinc-900">Shop the Look</h2>
            <span className="text-xs text-zinc-400">
              {suggestions.length} picks · online &amp; in-store
            </span>
          </div>
          <p className="text-xs text-zinc-400 mb-3 -mt-1">
            Pieces that complete this outfit — buy online or find them at a store near you.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((s, i) => (
              <ShoppingCard key={`${s.name}-${i}`} suggestion={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
