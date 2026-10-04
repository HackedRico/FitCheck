'use client'

import { useState } from 'react'

export default function TryOnCard({ outfitId }: { outfitId: string }) {
  const [personFile, setPersonFile] = useState<File | null>(null)
  const [personPreview, setPersonPreview] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState<'outfit' | 'link' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setPersonFile(file)
    setResult(null)
    setError(null)
    if (personPreview) URL.revokeObjectURL(personPreview)
    setPersonPreview(file ? URL.createObjectURL(file) : null)
  }

  async function tryOn(mode: 'outfit' | 'link') {
    if (!personFile) {
      setError('Add a full-body photo of yourself first.')
      return
    }
    if (mode === 'link' && !link.trim()) {
      setError('Paste a product link to try it on.')
      return
    }
    setLoading(mode)
    setError(null)
    const form = new FormData()
    form.append('person', personFile)
    if (mode === 'outfit') form.append('outfitId', outfitId)
    else form.append('link', link.trim())
    try {
      const res = await fetch('/api/tryon', { method: 'POST', body: form })
      const data = (await res.json()) as { image?: string; error?: string }
      if (!res.ok || !data.image) throw new Error(data.error ?? 'Try-on failed')
      setResult(data.image)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try-on failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Try It On</h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          See today&apos;s fit or a shop item on your own photo. Your photo never
          leaves this device except for the render and is never stored.
        </p>
      </div>

      <div className="flex items-start gap-4">
        <label className="flex flex-col items-center justify-center w-24 h-32 rounded-xl border-2 border-dashed border-zinc-300 hover:border-zinc-400 cursor-pointer text-zinc-400 text-xs text-center transition-colors overflow-hidden shrink-0">
          {personPreview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={personPreview} alt="You" className="w-full h-full object-cover" />
          ) : (
            <span className="px-2">Add full-body photo</span>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPhotoChange}
          />
        </label>

        <div className="flex-1 space-y-3">
          <button
            onClick={() => tryOn('outfit')}
            disabled={loading !== null}
            className="w-full rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            {loading === 'outfit' ? 'Rendering…' : "Try On Today's Outfit"}
          </button>

          <div className="flex gap-2">
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste a product link…"
              className="flex-1 rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
            />
            <button
              onClick={() => tryOn('link')}
              disabled={loading !== null}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors shrink-0"
            >
              {loading === 'link' ? '…' : 'Try On'}
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      {result && (
        <div className="pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result}
            alt="Try-on result"
            className="w-full max-w-sm mx-auto rounded-xl border border-zinc-200"
          />
        </div>
      )}
    </div>
  )
}
