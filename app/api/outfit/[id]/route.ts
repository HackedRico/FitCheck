import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed: Record<string, string> = {
    is_saved: 'IS_SAVED',
    is_worn: 'IS_WORN',
    worn_date: 'WORN_DATE',
    user_rating: 'USER_RATING',
  }

  const setClauses: string[] = []
  const binds: unknown[] = []

  for (const [key, col] of Object.entries(allowed)) {
    if (key in body) {
      setClauses.push(`${col} = ?`)
      binds.push(body[key])
    }
  }

  if (setClauses.length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  binds.push(id, session.user.id)

  await query(
    `UPDATE OUTFITS SET ${setClauses.join(', ')} WHERE ID = ? AND USER_ID = ?`,
    binds
  )

  return Response.json({ ok: true })
}
