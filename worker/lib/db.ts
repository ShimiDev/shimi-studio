import { HTTPException } from 'hono/http-exception'

export const uid = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const r = await db.prepare(sql).bind(...params).all<T>()
  return r.results
}
export async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>()
}
export async function run(db: D1Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...params).run()
}

/** שגיאה עם הודעה בעברית שתוצג למשתמש */
export function fail(status: 400 | 401 | 403 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message })
}
export function must<T>(v: T | null | undefined, msg = 'לא נמצא'): T {
  if (v == null) fail(404, msg)
  return v
}
