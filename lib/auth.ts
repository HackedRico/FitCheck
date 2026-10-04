import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/snowflake'
import type { UserRow } from '@/types'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const rows = await query<UserRow>(
          `SELECT * FROM USERS WHERE EMAIL = ? LIMIT 1`,
          [credentials.email.toLowerCase()]
        )
        const user = rows[0]
        if (!user) return null

        const valid = await bcrypt.compare(credentials.password, user.PASSWORD_HASH)
        if (!valid) return null

        return { id: user.ID, email: user.EMAIL, name: user.DISPLAY_NAME }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string
      return session
    },
  },
}
