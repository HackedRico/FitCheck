'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TasteProfilePayload } from '@/types'

const STYLE_OPTIONS = [
  'minimalist',
  'streetwear',
  'preppy',
  'boho',
  'classic',
  'Y2K',
  'business casual',
  'athleisure',
]

const COLOR_OPTIONS = [
  'black',
  'white',
  'navy',
  'grey',
  'brown',
  'beige',
  'red',
  'pink',
  'green',
  'blue',
  'purple',
  'yellow',
  'orange',
]

const TOPS_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const BOTTOMS_SIZES = Array.from({ length: 15 }, (_, i) => String(i + 24))
const SHOE_SIZES = Array.from({ length: 19 }, (_, i) =>
  String(i + 5 <= 14 ? i + 5 : i + 5)
).filter((_, i) => i + 5 <= 14)

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

interface PillProps {
  label: string
  selected: boolean
  onClick: () => void
}

function Pill({ label, selected, onClick }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
        selected
          ? 'border-violet-500 bg-violet-500/20 text-violet-300'
          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  )
}

interface SelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}

function Select({ label, value, onChange, options, placeholder }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

interface FormState {
  style_aesthetics: string[]
  favorite_colors: string[]
  avoid_colors: string[]
  brandInput: string
  favorite_brands: string[]
  budget_min: number
  budget_max: number
  size_tops: string
  size_bottoms: string
  size_shoes: string
  gender: string
  body_type: string
  skin_tone: string
}

const INITIAL_STATE: FormState = {
  style_aesthetics: [],
  favorite_colors: [],
  avoid_colors: [],
  brandInput: '',
  favorite_brands: [],
  budget_min: 0,
  budget_max: 250,
  size_tops: '',
  size_bottoms: '',
  size_shoes: '',
  gender: '',
  body_type: '',
  skin_tone: '',
}

const TOTAL_STEPS = 5

function Step1({
  state,
  setState,
}: {
  state: FormState
  setState: React.Dispatch<React.SetStateAction<FormState>>
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">
          Your style aesthetic
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Pick as many as feel like you.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {STYLE_OPTIONS.map((s) => (
          <Pill
            key={s}
            label={s}
            selected={state.style_aesthetics.includes(s)}
            onClick={() =>
              setState((prev) => ({
                ...prev,
                style_aesthetics: toggle(prev.style_aesthetics, s),
              }))
            }
          />
        ))}
      </div>
    </div>
  )
}

function Step2({
  state,
  setState,
}: {
  state: FormState
  setState: React.Dispatch<React.SetStateAction<FormState>>
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">Colors</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Select colors you love and colors you avoid.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-zinc-300">Favorite colors</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((c) => (
            <Pill
              key={c}
              label={c}
              selected={state.favorite_colors.includes(c)}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  favorite_colors: toggle(prev.favorite_colors, c),
                }))
              }
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-zinc-300">
          Colors to avoid
        </p>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((c) => (
            <Pill
              key={c}
              label={c}
              selected={state.avoid_colors.includes(c)}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  avoid_colors: toggle(prev.avoid_colors, c),
                }))
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Step3({
  state,
  setState,
}: {
  state: FormState
  setState: React.Dispatch<React.SetStateAction<FormState>>
}) {
  function addBrand() {
    const raw = state.brandInput.trim()
    if (!raw) return
    const newBrands = raw
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean)
    setState((prev) => ({
      ...prev,
      brandInput: '',
      favorite_brands: [
        ...prev.favorite_brands,
        ...newBrands.filter((b) => !prev.favorite_brands.includes(b)),
      ],
    }))
  }

  function removeBrand(brand: string) {
    setState((prev) => ({
      ...prev,
      favorite_brands: prev.favorite_brands.filter((b) => b !== brand),
    }))
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">
          Brands &amp; budget
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Tell us which brands you love and how much you like to spend.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-zinc-300">
          Favorite brands
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={state.brandInput}
            onChange={(e) =>
              setState((prev) => ({ ...prev, brandInput: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addBrand()
              }
            }}
            placeholder="e.g. Zara, Levi's, Nike"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addBrand}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            Add
          </button>
        </div>
        {state.favorite_brands.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {state.favorite_brands.map((b) => (
              <span
                key={b}
                className="flex items-center gap-1 rounded-full border border-violet-700 bg-violet-500/10 px-3 py-1 text-sm text-violet-300"
              >
                {b}
                <button
                  type="button"
                  onClick={() => removeBrand(b)}
                  className="ml-1 text-violet-400 hover:text-violet-200"
                  aria-label={`Remove ${b}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-300">Budget per item</label>
          <span className="text-sm text-zinc-400">
            ${state.budget_min} – ${state.budget_max}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="w-8 text-xs text-zinc-500">Min</span>
            <input
              type="range"
              min={0}
              max={500}
              step={10}
              value={state.budget_min}
              onChange={(e) => {
                const val = Number(e.target.value)
                setState((prev) => ({
                  ...prev,
                  budget_min: Math.min(val, prev.budget_max - 10),
                }))
              }}
              className="flex-1 accent-violet-500"
            />
            <span className="w-10 text-right text-xs text-zinc-400">
              ${state.budget_min}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 text-xs text-zinc-500">Max</span>
            <input
              type="range"
              min={0}
              max={500}
              step={10}
              value={state.budget_max}
              onChange={(e) => {
                const val = Number(e.target.value)
                setState((prev) => ({
                  ...prev,
                  budget_max: Math.max(val, prev.budget_min + 10),
                }))
              }}
              className="flex-1 accent-violet-500"
            />
            <span className="w-10 text-right text-xs text-zinc-400">
              ${state.budget_max}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step4({
  state,
  setState,
}: {
  state: FormState
  setState: React.Dispatch<React.SetStateAction<FormState>>
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">Your sizes</h2>
        <p className="mt-1 text-sm text-zinc-400">
          We use this to filter suggestions that actually fit.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Select
          label="Tops"
          value={state.size_tops}
          onChange={(v) => setState((prev) => ({ ...prev, size_tops: v }))}
          options={TOPS_SIZES}
          placeholder="Select size"
        />
        <Select
          label="Bottoms (waist)"
          value={state.size_bottoms}
          onChange={(v) => setState((prev) => ({ ...prev, size_bottoms: v }))}
          options={BOTTOMS_SIZES}
          placeholder="Select waist"
        />
        <Select
          label="Shoes (US)"
          value={state.size_shoes}
          onChange={(v) => setState((prev) => ({ ...prev, size_shoes: v }))}
          options={Array.from({ length: 10 }, (_, i) => String(i + 5))}
          placeholder="Select size"
        />
        <Select
          label="Gender"
          value={state.gender}
          onChange={(v) => setState((prev) => ({ ...prev, gender: v }))}
          options={['women', 'men', 'non-binary', 'prefer not to say']}
          placeholder="Select gender"
        />
      </div>
    </div>
  )
}

function Step5({
  state,
  setState,
}: {
  state: FormState
  setState: React.Dispatch<React.SetStateAction<FormState>>
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">
          A little more about you{' '}
          <span className="text-zinc-500">(optional)</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Helps us recommend outfits that flatter your look.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Select
          label="Body type"
          value={state.body_type}
          onChange={(v) => setState((prev) => ({ ...prev, body_type: v }))}
          options={['petite', 'regular', 'tall', 'plus']}
          placeholder="Select body type"
        />
        <Select
          label="Skin tone"
          value={state.skin_tone}
          onChange={(v) => setState((prev) => ({ ...prev, skin_tone: v }))}
          options={['fair', 'light', 'medium', 'olive', 'tan', 'deep']}
          placeholder="Select skin tone"
        />
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<FormState>(INITIAL_STATE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleBack() {
    setError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  function handleNext() {
    setError(null)
    setStep((s) => Math.min(TOTAL_STEPS, s + 1))
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)

    const payload: TasteProfilePayload = {
      style_aesthetics: state.style_aesthetics,
      favorite_colors: state.favorite_colors,
      avoid_colors: state.avoid_colors,
      favorite_brands: state.favorite_brands,
      budget_min: state.budget_min,
      budget_max: state.budget_max,
      body_type: state.body_type,
      skin_tone: state.skin_tone,
      gender: state.gender,
      size_tops: state.size_tops,
      size_bottoms: state.size_bottoms,
      size_shoes: state.size_shoes,
    }

    try {
      const res = await fetch('/api/taste-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          (data as { error?: string }).error ?? `Request failed (${res.status})`
        )
      }

      router.push('/closet/upload')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  const progressPct = Math.round((step / TOTAL_STEPS) * 100)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
            Build your taste profile
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Step {step} of {TOTAL_STEPS}
          </p>
        </div>

        <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
          {step === 1 && <Step1 state={state} setState={setState} />}
          {step === 2 && <Step2 state={state} setState={setState} />}
          {step === 3 && <Step3 state={state} setState={setState} />}
          {step === 4 && <Step4 state={state} setState={setState} />}
          {step === 5 && <Step5 state={state} setState={setState} />}

          {error && (
            <p className="mt-6 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Back
            </button>

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-violet-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
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
                    Saving…
                  </>
                ) : (
                  'Finish setup'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
