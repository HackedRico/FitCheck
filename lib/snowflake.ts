import snowflake from 'snowflake-sdk'

snowflake.configure({ logLevel: 'ERROR' })

let connection: snowflake.Connection | null = null

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

export async function query<T = Record<string, unknown>>(
  sql: string,
  binds: unknown[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const conn = getConnection()

    const execute = () => {
      conn.execute({
        sqlText: sql,
        binds: binds as snowflake.Binds,
        complete: (err, _stmt, rows) => {
          if (err) return reject(err)
          resolve((rows ?? []) as T[])
        },
      })
    }

    if (conn.isUp()) {
      execute()
    } else {
      conn.connect((err) => {
        if (err) {
          connection = null // reset so next call retries
          return reject(err)
        }
        execute()
      })
    }
  })
}
