import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <nav className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href="/dashboard"
            className="text-lg font-bold tracking-tight text-zinc-900 hover:text-zinc-600 transition-colors"
          >
            FitCheck
          </Link>

          <div className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/closet"
              className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            >
              Closet
            </Link>
            <Link
              href="/profile"
              className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            >
              Profile
            </Link>
          </div>
        </div>
      </nav>

      <main>{children}</main>
    </div>
  )
}
