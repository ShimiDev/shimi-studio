import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { all, fail } from '../lib/db'
import { body, oneOf, int, num } from '../lib/validate'
import type { Settings } from '../../shared/types'

const DEFAULTS: Settings = { billing_mode: 'hourly', default_rate: 15000, vat_status: 'exempt', vat_rate: 0.18 }

export async function getSettings(db: D1Database): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>(db, `SELECT key, value FROM settings`)
  const s: Record<string, unknown> = { ...DEFAULTS }
  for (const r of rows) { try { s[r.key] = JSON.parse(r.value) } catch { /* מתעלמים מערך פגום */ } }
  return s as unknown as Settings
}

export const settings = new Hono<AppEnv>()

settings.get('/', async c => c.json(await getSettings(c.env.DB)))

settings.put('/', async c => {
  const b = await body(c.req.raw)
  const updates: [string, unknown][] = []
  if ('billing_mode' in b) updates.push(['billing_mode', oneOf(b, 'billing_mode', ['hourly', 'per_song', 'fixed'] as const)])
  if ('default_rate' in b) updates.push(['default_rate', int(b, 'default_rate', { required: true, min: 0, max: 10_000_000 })])
  if ('vat_status' in b) updates.push(['vat_status', oneOf(b, 'vat_status', ['exempt', 'licensed'] as const)])
  if ('vat_rate' in b) {
    const r = num(b, 'vat_rate')
    if (r == null || r < 0 || r > 1) fail(400, 'שיעור מע"מ לא תקין')
    updates.push(['vat_rate', r])
  }
  if (!updates.length) fail(400, 'אין מה לעדכן')
  await c.env.DB.batch(updates.map(([k, v]) =>
    c.env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(k, JSON.stringify(v))))
  return c.json(await getSettings(c.env.DB))
})
