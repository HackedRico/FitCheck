'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClosetItemRow } from '@/types'

type UploadState =
  | { stage: 'idle' }
  | { stage: 'preview'; file: File; objectUrl: string }
  | { stage: 'uploading' }
  | { stage: 'done'; item: ClosetItemRow }
  | { stage: 'error'; message: string }

export default function UploadPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>({ stage: 'idle' })
  const [dragOver, setDragOver] = useState(false)

  const selectFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setState({ stage: 'error', message: 'Please choose an image file.' })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setState({ stage: 'error', message: 'Image must be 10 MB or smaller.' })
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setState({ stage: 'preview', file, objectUrl })
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) selectFile(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) selectFile(file)
    e.target.value = ''
  }

  const handleUpload = async () => {
    if (state.stage !== 'preview') return
    const { file } = state

    setState({ stage: 'uploading' })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/closet/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`)
      }

      const data = await res.json() as { item: ClosetItemRow }
      setState({ stage: 'done', item: data.item })
    } catch (err) {
      setState({
        stage: 'error',
        message: err instanceof Error ? err.message : 'Upload failed.',
      })
    }
  }

  const reset = () => {
    if (state.stage === 'preview') URL.revokeObjectURL(state.objectUrl)
    setState({ stage: 'idle' })
  }

  if (state.stage === 'done') {
    const { item } = state
    const analysisSucceeded = item.AI_STATUS === 'complete'

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-3">{analysisSucceeded ? '✓' : '⚠'}</div>
            <h1 className="text-2xl font-bold">
              {analysisSucceeded ? 'Item added!' : 'Saved — analysis failed'}
            </h1>
            {!analysisSucceeded && (
              <p className="text-zinc-400 mt-2 text-sm">
                The item was saved but AI analysis couldn&apos;t complete. You can retry it from your closet.
              </p>
            )}
          </div>

          <div className="aspect-square w-full overflow-hidden rounded-2xl bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.THUMBNAIL_URL ?? item.IMAGE_URL}
              alt="Uploaded item"
              className="w-full h-full object-cover"
            />
          </div>

          {analysisSucceeded && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 uppercase tracking-widest">Category</span>
                <span className="text-sm font-semibold text-indigo-400">{item.CATEGORY}</span>
              </div>
              {item.SUBCATEGORY && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500 uppercase tracking-widest">Type</span>
                  <span className="text-sm text-zinc-200">{item.SUBCATEGORY}</span>
                </div>
              )}
              {item.COLORS && item.COLORS.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500 uppercase tracking-widest">Colors</span>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {item.COLORS.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {item.AI_DESCRIPTION && (
                <p className="text-xs text-zinc-400 pt-1 border-t border-zinc-800">
                  {item.AI_DESCRIPTION}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm font-medium"
            >
              Upload Another
            </button>
            <button
              onClick={() => router.push('/closet')}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors text-sm font-medium"
            >
              View My Closet
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Add to Closet</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Upload a photo of any clothing item — AI will tag it automatically.
          </p>
        </div>

        {state.stage === 'idle' || state.stage === 'error' ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={[
              'relative flex flex-col items-center justify-center gap-3',
              'rounded-2xl border-2 border-dashed cursor-pointer',
              'aspect-square w-full transition-colors select-none',
              dragOver
                ? 'border-indigo-500 bg-indigo-950/30'
                : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800',
            ].join(' ')}
          >
            <div className="text-5xl text-zinc-600">+</div>
            <p className="text-zinc-400 text-sm text-center px-6">
              Drag &amp; drop an image here, or click to browse
            </p>
            <p className="text-zinc-600 text-xs">PNG, JPG, WEBP · max 10 MB</p>
          </div>
        ) : state.stage === 'preview' ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.objectUrl}
              alt="Preview"
              className="w-full h-full object-cover"
            />
            <button
              onClick={reset}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center text-lg leading-none hover:bg-black/80 transition-colors"
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ) : state.stage === 'uploading' ? (
          <div className="flex flex-col items-center justify-center aspect-square w-full rounded-2xl bg-zinc-900 border border-zinc-800 gap-4">
            <svg
              className="w-10 h-10 animate-spin text-indigo-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-zinc-400 text-sm">Uploading &amp; analysing…</p>
          </div>
        ) : null}

        {state.stage === 'error' && (
          <p className="text-red-400 text-sm">{state.message}</p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
        />

        <div className="flex gap-3">
          {state.stage === 'preview' && (
            <>
              <button
                onClick={reset}
                className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm font-medium"
              >
                Choose Different
              </button>
              <button
                onClick={handleUpload}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors text-sm font-medium"
              >
                Upload
              </button>
            </>
          )}
          {(state.stage === 'idle' || state.stage === 'error') && (
            <button
              onClick={() => router.push('/closet')}
              className="w-full py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors text-sm"
            >
              Back to Closet
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
