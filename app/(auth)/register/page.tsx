'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Registration failed. Please try again.')
        return
      }

      const signInResult = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      })

      if (signInResult?.error) {
        setError('Account created, but sign-in failed. Please go to the login page.')
        return
      }

      router.push('/onboarding')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm mx-4">
      <div className="bg-white border border-zinc-200 rounded-2xl px-8 py-10 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-1">Create account</h1>
        <p className="text-zinc-500 text-sm mb-8">Start building your FitCheck wardrobe.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1.5">
              Display name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent transition"
              placeholder="Alex"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent transition"
              placeholder="Min. 8 characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 text-sm transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-violet-600 hover:text-violet-500 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
