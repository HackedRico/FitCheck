'use client'

import { useState } from 'react'
import type { ClosetItemRow } from '@/types'
import ClosetItemCard from '@/components/ClosetItemCard'

interface Props {
  items: ClosetItemRow[]
}

export default function ClosetGrid({ items: initialItems }: Props) {
  const [items, setItems] = useState<ClosetItemRow[]>(initialItems)

  const handleUpdate = (updated: ClosetItemRow) => {
    setItems((prev) => prev.map((i) => (i.ID === updated.ID ? updated : i)))
  }

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.ID !== id))

    try {
      const res = await fetch('/api/closet/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: id }),
      })
      if (!res.ok) {
        setItems(initialItems)
      }
    } catch {
      setItems(initialItems)
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-center text-zinc-500 py-16">
        No items left. Upload something new!
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map((item) => (
        <ClosetItemCard key={item.ID} item={item} onDelete={handleDelete} onUpdate={handleUpdate} />
      ))}
    </div>
  )
}
