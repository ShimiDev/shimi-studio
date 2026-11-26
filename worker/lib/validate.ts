// ולידציה קטנה וידנית, כדי שכל קלט מהדפדפן ייבדק לפני שהוא נוגע במסד.
import { fail } from './db'

type Obj = Record<string, unknown>

export async function body(req: Request): Promise<Obj> {
  try {
    const b = await req.json()
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Obj
  } catch { /* נופל למטה */ }
  fail(400, 'הבקשה לא תקינה')
}

export function str(o: Obj, k: string, opts: { required?: boolean; max?: number } = {}): string | null {
  const v = o[k]
  if (v == null || v === '') {
    if (opts.required) fail(400, `חסר שדה: ${k}`)
    return null
  }
  if (typeof v !== 'string') fail(400, `שדה לא תקין: ${k}`)
  const s = v.trim()
  if (s.length > (opts.max ?? 2000)) fail(400, `שדה ארוך מדי: ${k}`)
  if (opts.required && !s) fail(400, `חסר שדה: ${k}`)
  return s || null
}

export function oneOf<T extends string>(o: Obj, k: string, allowed: readonly T[], def?: T): T {
  const v = o[k] ?? def
  if (typeof v !== 'string' || !allowed.includes(v as T)) fail(400, `ערך לא תקין: ${k}`)
  return v as T
}

/** מספר שלם (אגורות, דקות). מחזיר null אם ריק */
export function int(o: Obj, k: string, opts: { required?: boolean; min?: number; max?: number } = {}): number | null {
  const v = o[k]
  if (v == null || v === '') {
    if (opts.required) fail(400, `חסר שדה: ${k}`)
    return null
  }
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n)) fail(400, `מספר לא תקין: ${k}`)
  if (opts.min != null && n < opts.min) fail(400, `מספר קטן מדי: ${k}`)
  if (opts.max != null && n > opts.max) fail(400, `מספר גדול מדי: ${k}`)
  return n
}

export function num(o: Obj, k: string): number | null {
  const v = o[k]
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) fail(400, `מספר לא תקין: ${k}`)
  return n
}

export function bool(o: Obj, k: string): boolean {
  return o[k] === true || o[k] === 1 || o[k] === 'true'
}

/** תאריך/שעה ISO. מוחזר מנורמל ל-UTC */
export function iso(o: Obj, k: string, opts: { required?: boolean } = {}): string | null {
  const v = o[k]
  if (v == null || v === '') {
    if (opts.required) fail(400, `חסר תאריך: ${k}`)
    return null
  }
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  if (Number.isNaN(t)) fail(400, `תאריך לא תקין: ${k}`)
  return new Date(t).toISOString()
}

export function color(o: Obj, k: string): string | null {
  const v = str(o, k, { max: 9 })
  if (v && !/^#[0-9a-fA-F]{6}$/.test(v)) fail(400, `צבע לא תקין: ${k}`)
  return v
}
