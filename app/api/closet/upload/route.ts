import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadImage } from '@/lib/cloudinary'
import { analyzeClothingImage, embedText } from '@/lib/cortex'
import { query } from '@/lib/snowflake'
import type { ClosetItemRow, Season } from '@/types'

const MAX_SIZE = 10 * 1024 * 1024

function parseArrayField(value: unknown): string[] | null {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return null
}

function coerceRow(row: ClosetItemRow): ClosetItemRow {
  return {
    ...row,
    COLORS: parseArrayField(row.COLORS),
    SEASONS: parseArrayField(row.SEASONS) as Season[] | null,
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const fileEntry = formData.get('file')
  if (!fileEntry || !(fileEntry instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }
  const file = fileEntry

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'File must be an image' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'File exceeds 10 MB limit' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let uploadResult: Awaited<ReturnType<typeof uploadImage>>
  try {
    uploadResult = await uploadImage(buffer, `users/${userId}`)
  } catch {
    return Response.json({ error: 'Image upload failed' }, { status: 502 })
  }

  const itemId = crypto.randomUUID()

  await query(
    `INSERT INTO CLOSET_ITEMS (
      ID, USER_ID, IMAGE_URL, THUMBNAIL_URL,
      AI_STATUS, IS_ACTIVE, CREATED_AT
    ) VALUES (?, ?, ?, ?, 'pending', TRUE, CURRENT_TIMESTAMP())`,
    [itemId, userId, uploadResult.url, uploadResult.thumbnail_url]
  )

  try {
    const analysis = await analyzeClothingImage(uploadResult.url)
    const descriptionText =
      `${analysis.category} ${analysis.subcategory} — ${analysis.description}`
    const embedding = await embedText(descriptionText)

    await query(
      `UPDATE CLOSET_ITEMS SET
        CATEGORY       = ?,
        SUBCATEGORY    = ?,
        COLORS         = PARSE_JSON(?),
        PATTERN        = ?,
        MATERIAL       = ?,
        FORMALITY      = ?,
        SEASONS        = PARSE_JSON(?),
        AI_DESCRIPTION = ?,
        EMBEDDING      = TO_VECTOR(?, FLOAT, 768),
        AI_STATUS      = 'complete'
      WHERE ID = ?`,
      [
        analysis.category,
        analysis.subcategory,
        JSON.stringify(analysis.colors),
        analysis.pattern,
        analysis.material,
        analysis.formality,
        JSON.stringify(analysis.seasons),
        analysis.description,
        JSON.stringify(embedding),
        itemId,
      ]
    )
  } catch {
    await query(
      `UPDATE CLOSET_ITEMS SET AI_STATUS = 'failed' WHERE ID = ?`,
      [itemId]
    )
  }

  const rows = await query<ClosetItemRow>(
    `SELECT * FROM CLOSET_ITEMS WHERE ID = ? LIMIT 1`,
    [itemId]
  )
  const item = coerceRow(rows[0])

  return Response.json({ item }, { status: 201 })
}
