import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'
import type { ClosetItemRow, OutfitRow } from '@/types'

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:8000'

const REGION_BY_CATEGORY: Record<string, 'upper' | 'lower' | 'full'> = {
  TOP: 'upper',
  OUTERWEAR: 'upper',
  DRESS: 'full',
  BOTTOM: 'lower',
}

const RENDER_ORDER = ['DRESS', 'BOTTOM', 'TOP', 'OUTERWEAR']

interface GarmentOut {
  region: 'upper' | 'lower' | 'full'
  label: string
  image: string
}

async function cutout(bytes: ArrayBuffer, type: string): Promise<string> {
  const form = new FormData()
  form.append('image', new Blob([bytes], { type }), 'garment')
  try {
    const res = await fetch(`${ENGINE_URL}/scan`, { method: 'POST', body: form })
    if (res.ok) {
      const data = (await res.json()) as { cutout_png_base64?: string }
      if (data.cutout_png_base64) return `data:image/png;base64,${data.cutout_png_base64}`
    }
  } catch {}
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { outfitId?: unknown; link?: unknown; region?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.link === 'string' && body.link.trim()) {
    let url: URL
    try {
      url = new URL(body.link.trim())
    } catch {
      return Response.json({ error: 'Invalid product link' }, { status: 400 })
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return Response.json({ error: 'Link must be http(s)' }, { status: 400 })
    }
    try {
      const res = await fetch(`${ENGINE_URL}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.toString() }),
      })
      if (!res.ok) {
        return Response.json(
          { error: 'Could not fetch a garment image from that link' },
          { status: 502 }
        )
      }
      const data = (await res.json()) as { image_png_base64: string; title?: string | null }
      const region =
        typeof body.region === 'string' && ['upper', 'lower', 'full'].includes(body.region)
          ? (body.region as GarmentOut['region'])
          : 'upper'
      const garments: GarmentOut[] = [
        {
          region,
          label: data.title ?? url.hostname,
          image: `data:image/png;base64,${data.image_png_base64}`,
        },
      ]
      return Response.json({ garments })
    } catch {
      return Response.json(
        { error: 'Try-on engine unavailable. Is the engine running on port 8000?' },
        { status: 502 }
      )
    }
  }

  if (typeof body.outfitId !== 'string' || !body.outfitId) {
    return Response.json({ error: 'Provide either outfitId or link' }, { status: 400 })
  }

  const outfits = await query<OutfitRow>(
    `SELECT * FROM OUTFITS WHERE ID = ? AND USER_ID = ? LIMIT 1`,
    [body.outfitId, userId]
  )
  const outfit = outfits[0]
  if (!outfit) {
    return Response.json({ error: 'Outfit not found' }, { status: 404 })
  }
  const itemIds: string[] = Array.isArray(outfit.ITEM_IDS) ? outfit.ITEM_IDS : []
  if (itemIds.length === 0) {
    return Response.json({ error: 'Outfit has no items' }, { status: 400 })
  }

  const items = await query<ClosetItemRow>(
    `SELECT * FROM CLOSET_ITEMS
     WHERE ID IN (${itemIds.map(() => '?').join(',')}) AND USER_ID = ?`,
    [...itemIds, userId]
  )

  const renderable = items
    .filter((i) => i.CATEGORY && REGION_BY_CATEGORY[i.CATEGORY])
    .sort(
      (a, b) =>
        RENDER_ORDER.indexOf(a.CATEGORY as string) - RENDER_ORDER.indexOf(b.CATEGORY as string)
    )

  if (renderable.length === 0) {
    return Response.json({ error: 'No renderable garments in this outfit' }, { status: 400 })
  }

  const garments: GarmentOut[] = []
  for (const item of renderable) {
    const res = await fetch(item.IMAGE_URL)
    if (!res.ok) continue
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    garments.push({
      region: REGION_BY_CATEGORY[item.CATEGORY as string],
      label: item.SUBCATEGORY ?? (item.CATEGORY as string),
      image: await cutout(await res.arrayBuffer(), type),
    })
  }

  return Response.json({ garments })
}
