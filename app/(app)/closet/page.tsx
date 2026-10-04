import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'
import type { ClosetItemRow } from '@/types'
import ClosetGrid from '@/components/ClosetGrid'

async function getClosetItems(userId: string): Promise<ClosetItemRow[]> {
  const rows = await query<ClosetItemRow>(
    `SELECT
       ID, USER_ID, IMAGE_URL, THUMBNAIL_URL, CATEGORY, SUBCATEGORY,
       COLORS, PATTERN, MATERIAL, FORMALITY, SEASONS, AI_DESCRIPTION,
       AI_STATUS, BRAND, NOTES, IS_ACTIVE, CREATED_AT
     FROM CLOSET_ITEMS
     WHERE USER_ID = ? AND IS_ACTIVE = TRUE
     ORDER BY CREATED_AT DESC`,
    [userId]
  )

  return rows.map((row) => ({
    ...row,
    COLORS: Array.isArray(row.COLORS)
      ? row.COLORS
      : typeof row.COLORS === 'string'
        ? (JSON.parse(row.COLORS) as string[])
        : null,
    SEASONS: Array.isArray(row.SEASONS)
      ? row.SEASONS
      : typeof row.SEASONS === 'string'
        ? (JSON.parse(row.SEASONS) as string[])
        : null,
  }))
}

export default async function ClosetPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/login')
  }

  const items = await getClosetItems(session.user.id)

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">My Closet</h1>
        <Link
          href="/closet/upload"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          + Add Item
        </Link>
      </header>

      <main className="p-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
            <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-200">Your closet is empty</h2>
              <p className="text-zinc-500 text-sm mt-1">
                Upload your first item to get started.
              </p>
            </div>
            <Link
              href="/closet/upload"
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Upload First Item
            </Link>
          </div>
        ) : (
          <ClosetGrid items={items} />
        )}
      </main>
    </div>
  )
}
