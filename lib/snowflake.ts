import snowflake from 'snowflake-sdk'

snowflake.configure({ logLevel: 'ERROR' })

let connection: snowflake.Connection | null = null
let connecting: Promise<snowflake.Connection> | null = null

function getConnection(): snowflake.Connection {
  if (!connection) {
    connection = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!,
      username: process.env.SNOWFLAKE_USERNAME!,
      password: process.env.SNOWFLAKE_PASSWORD!,
      database: process.env.SNOWFLAKE_DATABASE!,
      schema: process.env.SNOWFLAKE_SCHEMA!,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
      role: process.env.SNOWFLAKE_ROLE,
    })
  }
  return connection
}

function ensureConnected(): Promise<snowflake.Connection> {
  const conn = getConnection()
  if (conn.isUp()) return Promise.resolve(conn)
  if (!connecting) {
    connecting = new Promise((resolve, reject) => {
      conn.connect((err) => {
        connecting = null
        if (err) {
          connection = null
          return reject(err)
        }
        resolve(conn)
      })
    })
  }
  return connecting
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  binds: unknown[] = []
): Promise<T[]> {
  const conn = await ensureConnected()
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      binds: binds as snowflake.Binds,
      complete: (err, _stmt, rows) => {
        if (err) return reject(err)
        resolve((rows ?? []) as T[])
      },
    })
  })
}
