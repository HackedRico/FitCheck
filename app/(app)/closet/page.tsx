import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'
import type { ClosetItemRow, Season } from '@/types'
import ClosetGrid from '@/components/ClosetGrid'
import ClosetSearch from '@/components/ClosetSearch'

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
    SEASONS: (Array.isArray(row.SEASONS)
      ? row.SEASONS
      : typeof row.SEASONS === 'string'
        ? JSON.parse(row.SEASONS)
        : null) as Season[] | null,
  }))
}

export default async function ClosetPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/login')
  }

  const items = await getClosetItems(session.user.id)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">My Closet</h1>
        <Link
          href="/closet/upload"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          + Add Item
        </Link>
      </div>

      <main>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
            <div className="w-20 h-20 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-zinc-400"
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
              <h2 className="text-lg font-semibold text-zinc-800">Your closet is empty</h2>
              <p className="text-zinc-500 text-sm mt-1">
                Upload your first item to get started.
              </p>
            </div>
            <Link
              href="/closet/upload"
              className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Upload First Item
            </Link>
          </div>
        ) : (
          <>
            <ClosetSearch />
            <ClosetGrid items={items} />
          </>
        )}
      </main>
    </div>
  )
}
