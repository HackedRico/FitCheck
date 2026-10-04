'use client'

import { useState, useEffect } from 'react'
import { signOut } from 'next-auth/react'
import type { TasteProfileRow } from '@/types'

export default function ProfilePage() {
  const [profile, setProfile] = useState<TasteProfileRow | null>(null)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [locationSaving, setLocationSaving] = useState(false)
  const [locationMsg, setLocationMsg] = useState('')

  useEffect(() => {
    fetch('/api/taste-profile')
      .then((r) => r.json())
      .then((data) => setProfile(data))
      .catch(() => null)
  }, [])

  function detectLocation() {
    if (!navigator.geolocation) {
      setLocationMsg('Geolocation not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude))
        setLng(String(pos.coords.longitude))
        setLocationMsg('Location detected! Hit Save.')
      },
      () => setLocationMsg('Unable to detect location. Enter manually.')
    )
  }

  async function saveLocation() {
    if (!lat || !lng) return
    setLocationSaving(true)
    setLocationMsg('')
    const res = await fetch('/api/user/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: parseFloat(lat), lng: parseFloat(lng) }),
    })
    setLocationMsg(res.ok ? 'Location saved!' : 'Failed to save.')
    setLocationSaving(false)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-zinc-900">Profile</h1>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
        <h2 className="font-semibold text-zinc-800">Your Location</h2>
        <p className="text-sm text-zinc-500">
          Required for weather-aware outfit recommendations.
        </p>
        <button
          onClick={detectLocation}
          className="w-full py-2.5 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
        >
          Detect My Location
        </button>
        <div className="flex gap-3">
          <input value={lat} onChange={(e) => setLat(e.target.value)}
            placeholder="Latitude"
            className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input value={lng} onChange={(e) => setLng(e.target.value)}
            placeholder="Longitude"
            className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={saveLocation} disabled={locationSaving || !lat || !lng}
          className="w-full py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition">
          {locationSaving ? 'Saving…' : 'Save Location'}
        </button>
        {locationMsg && <p className="text-sm text-zinc-500 text-center">{locationMsg}</p>}
      </section>

      {profile && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800">Taste Profile</h2>
            <a href="/onboarding" className="text-sm text-indigo-600 hover:text-indigo-500">Edit</a>
          </div>
          {profile.STYLE_AESTHETICS && profile.STYLE_AESTHETICS.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Style</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.STYLE_AESTHETICS.map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-zinc-100 text-zinc-600">{s}</span>
                ))}
              </div>
            </div>
          )}
          {profile.FAVORITE_COLORS && profile.FAVORITE_COLORS.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Favorite Colors</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.FAVORITE_COLORS.map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded-full text-xs bg-zinc-100 text-zinc-600">{c}</span>
                ))}
              </div>
            </div>
          )}
          {profile.AVOID_COLORS && profile.AVOID_COLORS.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Colors to Avoid</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.AVOID_COLORS.map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-500">{c}</span>
                ))}
              </div>
            </div>
          )}
          {profile.FAVORITE_BRANDS && profile.FAVORITE_BRANDS.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Brands</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.FAVORITE_BRANDS.map((b) => (
                  <span key={b} className="px-2 py-0.5 rounded-full text-xs bg-violet-50 text-violet-600">{b}</span>
                ))}
              </div>
            </div>
          )}
          {profile.BUDGET_MIN != null && profile.BUDGET_MAX != null && (
            <p className="text-sm text-zinc-600">Budget: ${profile.BUDGET_MIN} – ${profile.BUDGET_MAX} per item</p>
          )}
          {(profile.SIZE_TOPS || profile.SIZE_BOTTOMS || profile.SIZE_SHOES) && (
            <p className="text-sm text-zinc-600">
              Sizes: {[
                profile.SIZE_TOPS && `tops ${profile.SIZE_TOPS}`,
                profile.SIZE_BOTTOMS && `bottoms ${profile.SIZE_BOTTOMS}`,
                profile.SIZE_SHOES && `shoes ${profile.SIZE_SHOES}`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          {(profile.BODY_TYPE || profile.SKIN_TONE || profile.GENDER) && (
            <p className="text-sm text-zinc-600 capitalize">
              {[profile.GENDER, profile.BODY_TYPE && `${profile.BODY_TYPE} build`, profile.SKIN_TONE && `${profile.SKIN_TONE} skin tone`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </section>
      )}

      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="w-full py-2.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition"
      >
        Sign Out
      </button>
    </div>
  )
}
