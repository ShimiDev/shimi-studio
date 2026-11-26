import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { all, first, run, uid, must, nowIso, fail } from '../lib/db'
import { body, str, oneOf, int, color, bool, num } from '../lib/validate'
import { israelDayRange } from '../../shared/time'
import { getSettings } from './settings'
import type { Appointment, Charge, Client, ClientSummary, Payment, Project, TimeEntry, Note, Reminder } from '../../shared/types'

const KINDS = ['artist', 'band', 'choir', 'podcast', 'other'] as const
const BILLING = ['hourly', 'per_song', 'fixed'] as const

// שניות נטו של סשנים שהסתיימו, מחושב ב-SQL
export const SECONDS_SQL = `CAST(ROUND((julianday(ended_at) - julianday(started_at)) * 86400) AS INTEGER) - paused_seconds`

/** צבעים יציבים מתוך השם, כדי שלכל לקוח חדש תהיה דמות משלו בלי לבחור */
function colorsFromName(name: string): [string, string] {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  const hue = h % 360
  const hsl = (H: number, s: number, l: number) => {
    s /= 100; l /= 100
    const k = (n: number) => (n + H / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
    return '#' + [f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('')
  }
  return [hsl(hue, 85, 68), hsl((hue + 70) % 360, 70, 52)]
}

const SUMMARY_SQL = `
SELECT c.*,
  (SELECT COALESCE(SUM(amount),0) FROM charges  WHERE client_id = c.id)
- (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id = c.id)                AS balance,
  (SELECT COALESCE(SUM(${SECONDS_SQL}),0) FROM time_entries
     WHERE client_id = c.id AND ended_at IS NOT NULL)                                  AS seconds,
  (SELECT MAX(started_at) FROM time_entries WHERE client_id = c.id)                     AS last_session,
  (SELECT MIN(starts_at) FROM appointments
     WHERE client_id = c.id AND status = 'scheduled' AND starts_at >= ?1)               AS next_appt,
  EXISTS(SELECT 1 FROM appointments WHERE client_id = c.id AND status != 'cancelled'
     AND starts_at >= ?2 AND starts_at < ?3)                                           AS today,
  (SELECT title FROM projects WHERE client_id = c.id AND status = 'active'
     ORDER BY created_at DESC LIMIT 1)                                                 AS project_title
FROM clients c`

export const clients = new Hono<AppEnv>()

clients.get('/', async c => {
  const [d0, d1] = israelDayRange()
  const archived = c.req.query('archived') === '1'
  const rows = await all<ClientSummary>(c.env.DB,
    `${SUMMARY_SQL} WHERE c.archived_at IS ${archived ? 'NOT' : ''} NULL ORDER BY c.name COLLATE NOCASE`,
    nowIso(), d0, d1)
  return c.json(rows)
})

clients.get('/:id', async c => {
  const id = c.req.param('id')
  const [d0, d1] = israelDayRange()
  const client = must(await first<ClientSummary>(c.env.DB, `${SUMMARY_SQL} WHERE c.id = ?4`, nowIso(), d0, d1, id), 'הלקוח לא נמצא')
  const [projects, time, charges, payments, appts, allAppts, totals, notes, tasks] = await Promise.all([
    all<Project & { seconds: number; charged: number }>(c.env.DB,
      `SELECT p.*,
         (SELECT COALESCE(SUM(${SECONDS_SQL}),0) FROM time_entries WHERE project_id = p.id AND ended_at IS NOT NULL) AS seconds,
         (SELECT COALESCE(SUM(amount),0) FROM charges WHERE project_id = p.id) AS charged
       FROM projects p WHERE client_id = ? ORDER BY status, created_at DESC`, id),
    all<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE client_id = ? ORDER BY started_at DESC LIMIT 100`, id),
    all<Charge>(c.env.DB, `SELECT * FROM charges WHERE client_id = ? ORDER BY charged_at DESC LIMIT 100`, id),
    all<Payment>(c.env.DB, `SELECT * FROM payments WHERE client_id = ? ORDER BY paid_at DESC LIMIT 100`, id),
    all<Appointment>(c.env.DB, `SELECT * FROM appointments WHERE client_id = ? AND starts_at >= ? AND status = 'scheduled' ORDER BY starts_at LIMIT 10`, id, d0),
    all<Appointment>(c.env.DB, `SELECT * FROM appointments WHERE client_id = ? ORDER BY starts_at DESC LIMIT 200`, id),
    first<{ charged: number; paid: number; sessions: number }>(c.env.DB,
      `SELECT (SELECT COALESCE(SUM(amount),0) FROM charges WHERE client_id = ?1) AS charged,
              (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id = ?1) AS paid,
              (SELECT COUNT(*) FROM time_entries WHERE client_id = ?1) AS sessions`, id),
    all<Note>(c.env.DB, `SELECT * FROM notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 200`, id),
    all<Reminder>(c.env.DB, `SELECT * FROM reminders WHERE client_id = ? ORDER BY done_at IS NOT NULL, created_at DESC LIMIT 200`, id),
  ])
  return c.json({ client, projects, time, charges, payments, appointments: appts, all_appointments: allAppts, totals, notes, tasks })
})

function clientFields(b: Record<string, unknown>, partial: boolean) {
  const name = str(b, 'name', { required: !partial, max: 120 })
  const kind = b.kind != null || !partial ? oneOf(b, 'kind', KINDS, 'artist') : undefined
  return {
    name,
    kind,
    is_group: b.is_group != null ? (bool(b, 'is_group') ? 1 : 0) : undefined,
    phone: str(b, 'phone', { max: 40 }),
    email: str(b, 'email', { max: 200 }),
    color_a: color(b, 'color_a'),
    color_b: color(b, 'color_b'),
    hourly_rate: int(b, 'hourly_rate', { min: 0, max: 10_000_000 }),
    notes: str(b, 'notes', { max: 5000 }),
  }
}

clients.post('/', async c => {
  const b = await body(c.req.raw)
  const f = clientFields(b, false)
  const [ca, cb] = colorsFromName(f.name!)
  const groupDefault = f.kind === 'band' || f.kind === 'choir' ? 1 : 0
  const id = uid()
  await run(c.env.DB,
    `INSERT INTO clients (id, name, kind, is_group, phone, email, color_a, color_b, hourly_rate, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, f.name, f.kind, f.is_group ?? groupDefault, f.phone, f.email, f.color_a ?? ca, f.color_b ?? cb, f.hourly_rate, f.notes)
  // אפשר לפתוח פרויקט ראשון יחד עם הלקוח
  const projectTitle = str(b, 'project_title', { max: 160 })
  if (projectTitle) {
    await run(c.env.DB, `INSERT INTO projects (id, client_id, title) VALUES (?,?,?)`, uid(), id, projectTitle)
  }
  return c.json(await first<Client>(c.env.DB, `SELECT * FROM clients WHERE id = ?`, id), 201)
})

clients.patch('/:id', async c => {
  const id = c.req.param('id')
  must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, id), 'הלקוח לא נמצא')
  const b = await body(c.req.raw)
  const f = clientFields(b, true)
  // מעדכנים רק שדות שנשלחו. "שדה ריק" נשלח כ-null ומנקה את הערך
  const sets: string[] = []
  const vals: unknown[] = []
  for (const [k, v] of Object.entries(f)) {
    if (!(k in b)) continue
    if ((k === 'name' || k === 'color_a' || k === 'color_b' || k === 'kind') && v == null) continue
    sets.push(`${k} = ?`); vals.push(v)
  }
  if ('archived' in b) { sets.push('archived_at = ?'); vals.push(bool(b, 'archived') ? nowIso() : null) }
  if (!sets.length) fail(400, 'אין מה לעדכן')
  await run(c.env.DB, `UPDATE clients SET ${sets.join(', ')} WHERE id = ?`, ...vals, id)
  return c.json(await first<Client>(c.env.DB, `SELECT * FROM clients WHERE id = ?`, id))
})

// ---------- פרויקטים ----------
export const projects = new Hono<AppEnv>()

/** סיכום פרויקט: כל הסשנים, שעות לפי סוג עבודה, שווי לפי שיטת התמחור, חיובים ותשלומים */
projects.get('/:id', async c => {
  const db = c.env.DB
  const project = must(await first<Project>(db, `SELECT * FROM projects WHERE id = ?`, c.req.param('id')), 'הפרויקט לא נמצא')
  const [client, settings, sessions, charges, payments, unassigned, notes] = await Promise.all([
    first<Client>(db, `SELECT * FROM clients WHERE id = ?`, project.client_id),
    getSettings(db),
    all<TimeEntry & { seconds: number }>(db,
      `SELECT *, CASE WHEN ended_at IS NULL THEN NULL ELSE ${SECONDS_SQL} END AS seconds FROM time_entries WHERE project_id = ? ORDER BY started_at`, project.id),
    all<Charge>(db, `SELECT * FROM charges WHERE project_id = ? ORDER BY charged_at`, project.id),
    all<Payment>(db, `SELECT * FROM payments WHERE project_id = ? ORDER BY paid_at`, project.id),
    first<{ n: number; seconds: number }>(db,
      `SELECT COUNT(*) AS n, COALESCE(SUM(${SECONDS_SQL}),0) AS seconds FROM time_entries
       WHERE client_id = ? AND project_id IS NULL AND charge_id IS NULL AND ended_at IS NOT NULL`, project.client_id),
    all<Note>(db, `SELECT n.* FROM notes n JOIN time_entries t ON t.id = n.time_entry_id WHERE t.project_id = ? ORDER BY n.created_at`, project.id),
  ])
  const mode = project.billing_mode ?? settings.billing_mode
  const rate = mode === 'hourly' ? project.unit_price ?? client?.hourly_rate ?? settings.default_rate
    : mode === 'per_song' ? project.unit_price ?? settings.default_rate
    : project.quote_amount ?? project.unit_price ?? 0
  const done = sessions.filter(t => t.ended_at)
  const sum = (xs: { seconds: number }[]) => xs.reduce((a, t) => a + Math.max(0, t.seconds), 0)
  const seconds = sum(done)
  const open_seconds = sum(done.filter(t => !t.charge_id))
  const byKind = new Map<string, { kind: string; sessions: number; seconds: number; open_seconds: number }>()
  for (const t of done) {
    const k = byKind.get(t.kind) ?? { kind: t.kind, sessions: 0, seconds: 0, open_seconds: 0 }
    k.sessions++; k.seconds += Math.max(0, t.seconds); if (!t.charge_id) k.open_seconds += Math.max(0, t.seconds)
    byKind.set(t.kind, k)
  }
  const charged = charges.reduce((a, x) => a + x.amount, 0)
  const paid = payments.reduce((a, x) => a + x.amount, 0)
  const value = mode === 'hourly' ? Math.round(seconds / 3600 * rate) : mode === 'fixed' ? rate : null
  const open_value = mode === 'hourly' ? Math.round(open_seconds / 3600 * rate) : mode === 'fixed' ? Math.max(0, rate - charged) : null
  return c.json({
    project, client, mode, rate, sessions, charges, payments, notes,
    by_kind: [...byKind.values()].sort((a, b) => b.seconds - a.seconds),
    unassigned: unassigned ?? { n: 0, seconds: 0 },
    running: sessions.some(t => !t.ended_at),
    totals: { sessions: done.length, seconds, open_seconds, value, open_value, charged, paid, balance: charged - paid },
  })
})

projects.post('/', async c => {
  const b = await body(c.req.raw)
  const client_id = str(b, 'client_id', { required: true })!
  must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, client_id), 'הלקוח לא נמצא')
  const id = uid()
  await run(c.env.DB,
    `INSERT INTO projects (id, client_id, title, billing_mode, unit_price, quote_amount, quoted_hours) VALUES (?,?,?,?,?,?,?)`,
    id, client_id, str(b, 'title', { required: true, max: 160 }),
    b.billing_mode ? oneOf(b, 'billing_mode', BILLING) : null,
    int(b, 'unit_price', { min: 0 }), int(b, 'quote_amount', { min: 0 }), num(b, 'quoted_hours'))
  return c.json(await first<Project>(c.env.DB, `SELECT * FROM projects WHERE id = ?`, id), 201)
})

projects.patch('/:id', async c => {
  const id = c.req.param('id')
  must(await first(c.env.DB, `SELECT id FROM projects WHERE id = ?`, id), 'הפרויקט לא נמצא')
  const b = await body(c.req.raw)
  const sets: string[] = []; const vals: unknown[] = []
  const put = (k: string, v: unknown) => { if (k in b) { sets.push(`${k} = ?`); vals.push(v) } }
  put('title', str(b, 'title', { max: 160 }))
  put('billing_mode', b.billing_mode ? oneOf(b, 'billing_mode', BILLING) : null)
  put('unit_price', int(b, 'unit_price', { min: 0 }))
  put('quote_amount', int(b, 'quote_amount', { min: 0 }))
  put('quoted_hours', num(b, 'quoted_hours'))
  if ('status' in b) { sets.push('status = ?'); vals.push(oneOf(b, 'status', ['active', 'done'] as const)) }
  if (!sets.length) fail(400, 'אין מה לעדכן')
  await run(c.env.DB, `UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, ...vals, id)
  return c.json(await first<Project>(c.env.DB, `SELECT * FROM projects WHERE id = ?`, id))
})
