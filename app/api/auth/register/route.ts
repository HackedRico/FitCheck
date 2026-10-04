import bcrypt from 'bcryptjs'
import { query } from '@/lib/snowflake'
import type { UserRow } from '@/types'

export async function POST(req: Request) {
  let body: { email?: unknown; name?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { email, name, password } = body

  if (!email || !name || !password) {
    return Response.json(
      { error: 'email, name, and password are all required' },
      { status: 400 }
    )
  }

  if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
    return Response.json({ error: 'Invalid field types' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return Response.json({ error: 'Invalid email format' }, { status: 400 })
  }

  if (password.length < 8) {
    return Response.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    )
  }

  try {
    const existing = await query<UserRow>(
      'SELECT ID FROM USERS WHERE EMAIL = ? LIMIT 1',
      [email.toLowerCase().trim()]
    )

    if (existing.length > 0) {
      return Response.json({ error: 'Email already in use' }, { status: 409 })
    }

    const hash = await bcrypt.hash(password, 12)
    const normalizedEmail = email.toLowerCase().trim()
    const trimmedName = name.trim()

    await query(
      `INSERT INTO USERS (ID, EMAIL, PASSWORD_HASH, DISPLAY_NAME)
       VALUES (?, ?, ?, ?)`,
      [crypto.randomUUID(), normalizedEmail, hash, trimmedName]
    )

    const created = await query<UserRow>(
      'SELECT ID, EMAIL, DISPLAY_NAME FROM USERS WHERE EMAIL = ? LIMIT 1',
      [normalizedEmail]
    )

    const newUser = created[0]

    return Response.json(
      {
        id: newUser.ID,
        email: newUser.EMAIL,
        name: newUser.DISPLAY_NAME,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Register error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
