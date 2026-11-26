// עטיפה קטנה ל-fetch: כל שגיאה מהשרת חוזרת כהודעה בעברית
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function req<T>(method: string, path: string, data?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError('אין חיבור לאינטרנט', 0)
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError((json as { error?: string } | null)?.error ?? 'משהו השתבש', res.status)
  return json as T
}

export const api = {
  get: <T>(p: string) => req<T>('GET', p),
  post: <T>(p: string, d?: unknown) => req<T>('POST', p, d ?? {}),
  patch: <T>(p: string, d: unknown) => req<T>('PATCH', p, d),
  put: <T>(p: string, d: unknown) => req<T>('PUT', p, d),
  del: <T>(p: string) => req<T>('DELETE', p),
}
