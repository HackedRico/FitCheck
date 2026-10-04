import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTodaysEvents } from '@/lib/calendar'

export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const events = await getTodaysEvents()
  return Response.json({ events })
}
