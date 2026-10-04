import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'
import type { ClosetItemRow, OutfitRow } from '@/types'

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:8000'
const MAX_PERSON_SIZE = 10 * 1024 * 1024

const REGION_BY_CATEGORY: Record<string, 'upper' | 'lower' | 'full'> = {
  TOP: 'upper',
  OUTERWEAR: 'upper',
  DRESS: 'full',
  BOTTOM: 'lower',
}

const RENDER_ORDER = ['DRESS', 'BOTTOM', 'TOP', 'OUTERWEAR']

async function renderGarment(
  person: Blob,
  garment: Blob,
  region: string
): Promise<Blob> {
  const form = new FormData()
  form.append('person', person, 'person.png')
  form.append('garment', garment, 'garment.png')
  form.append('region', region)
  const res = await fetch(`${ENGINE_URL}/render`, { method: 'POST', body: form })
  if (!res.ok) {
    throw new Error(`Engine render failed (${res.status})`)
  }
  const data = (await res.json()) as { image_png_base64: string }
  return new Blob([Buffer.from(data.image_png_base64, 'base64')], {
    type: 'image/png',
  })
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

  const person = formData.get('person')
  if (!person || !(person instanceof File)) {
    return Response.json({ error: 'A person photo is required' }, { status: 400 })
  }
  if (!person.type.startsWith('image/')) {
    return Response.json({ error: 'Person photo must be an image' }, { status: 400 })
  }
  if (person.size > MAX_PERSON_SIZE) {
    return Response.json({ error: 'Person photo exceeds 10 MB limit' }, { status: 400 })
  }

  const outfitId = formData.get('outfitId')
  const link = formData.get('link')

  try {
    let current: Blob = person

    if (typeof link === 'string' && link.length > 0) {
      let url: URL
      try {
        url = new URL(link)
      } catch {
        return Response.json({ error: 'Invalid product link' }, { status: 400 })
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return Response.json({ error: 'Link must be http(s)' }, { status: 400 })
      }

      const linkRes = await fetch(`${ENGINE_URL}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.toString() }),
      })
      if (!linkRes.ok) {
        return Response.json(
          { error: 'Could not fetch a garment image from that link' },
          { status: 502 }
        )
      }
      const linkData = (await linkRes.json()) as { image_png_base64: string }
      const garment = new Blob([Buffer.from(linkData.image_png_base64, 'base64')], {
        type: 'image/png',
      })

      const regionField = formData.get('region')
      const region =
        typeof regionField === 'string' &&
        ['upper', 'lower', 'full'].includes(regionField)
          ? regionField
          : 'upper'

      current = await renderGarment(current, garment, region)
    } else if (typeof outfitId === 'string' && outfitId.length > 0) {
      const outfits = await query<OutfitRow>(
        `SELECT * FROM OUTFITS WHERE ID = ? AND USER_ID = ? LIMIT 1`,
        [outfitId, userId]
      )
      let outfit = outfits[0]
      if (!outfit) {
        const todays = await query<OutfitRow>(
          `SELECT * FROM OUTFITS WHERE USER_ID = ? AND OUTFIT_DATE = CURRENT_DATE()
           ORDER BY GENERATED_AT DESC LIMIT 1`,
          [userId]
        )
        outfit = todays[0]
      }
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
            RENDER_ORDER.indexOf(a.CATEGORY as string) -
            RENDER_ORDER.indexOf(b.CATEGORY as string)
        )

      if (renderable.length === 0) {
        return Response.json(
          { error: 'No renderable garments in this outfit' },
          { status: 400 }
        )
      }

      for (const item of renderable) {
        const imgRes = await fetch(item.IMAGE_URL)
        if (!imgRes.ok) continue
        const garment = new Blob([await imgRes.arrayBuffer()], { type: 'image/png' })
        current = await renderGarment(
          current,
          garment,
          REGION_BY_CATEGORY[item.CATEGORY as string]
        )
      }
    } else {
      return Response.json(
        { error: 'Provide either outfitId or link' },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await current.arrayBuffer())
    return Response.json({
      image: `data:image/png;base64,${buffer.toString('base64')}`,
    })
  } catch (err) {
    console.error('Try-on failed:', err)
    return Response.json(
      { error: 'Try-on engine unavailable. Is the engine running on port 8000?' },
      { status: 502 }
    )
  }
}
