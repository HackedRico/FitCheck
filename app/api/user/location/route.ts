import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { lat?: unknown; lng?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const lat = Number(body.lat)
  const lng = Number(body.lng)

  if (isNaN(lat) || isNaN(lng)) {
    return Response.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  await query(
    `UPDATE USERS SET LOCATION_LAT = ?, LOCATION_LNG = ? WHERE ID = ?`,
    [lat, lng, session.user.id]
  )

  return Response.json({ ok: true })
}
