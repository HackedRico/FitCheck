import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { embedText } from '@/lib/cortex'
import { query } from '@/lib/snowflake'

interface SearchRow {
  ID: string
  THUMBNAIL_URL: string | null
  IMAGE_URL: string
  CATEGORY: string | null
  SUBCATEGORY: string | null
  AI_DESCRIPTION: string | null
  SCORE: number
}

export async function GET(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q) {
    return Response.json({ error: 'Query required' }, { status: 400 })
  }

  const embedding = await embedText(q)

  const rows = await query<SearchRow>(
    `SELECT ID, THUMBNAIL_URL, IMAGE_URL, CATEGORY, SUBCATEGORY, AI_DESCRIPTION,
       VECTOR_COSINE_SIMILARITY(EMBEDDING, PARSE_JSON(?)::VECTOR(FLOAT, 768)) AS SCORE
     FROM CLOSET_ITEMS
     WHERE USER_ID = ? AND IS_ACTIVE = TRUE AND AI_STATUS = 'complete' AND EMBEDDING IS NOT NULL
     ORDER BY SCORE DESC
     LIMIT 6`,
    [JSON.stringify(embedding), session.user.id]
  )

  return Response.json({
    results: rows.map((r) => ({
      id: r.ID,
      thumbnail_url: r.THUMBNAIL_URL ?? r.IMAGE_URL,
      category: r.CATEGORY,
      subcategory: r.SUBCATEGORY,
      description: r.AI_DESCRIPTION,
      score: r.SCORE,
    })),
  })
}
