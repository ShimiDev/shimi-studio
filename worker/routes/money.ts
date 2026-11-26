// כסף: חיובים (מה הלקוח חייב), תשלומים (מה נכנס), הוצאות.
// יתרה פתוחה = חיובים פחות תשלומים.
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { all, first, run, uid, must, fail, nowIso } from '../lib/db'
import { body, str, int, num, oneOf, iso } from '../lib/validate'
import { getSettings } from './settings'
import { SECONDS_SQL } from './clients'
import type { BillingMode, ChargePreview, Charge, Client, Expense, Payment, Project } from '../../shared/types'
import { BILLING_MODES } from '../../shared/types'

const METHODS = ['cash', 'bit', 'transfer', 'credit', 'check', 'other'] as const
const CATEGORIES = ['equipment', 'software', 'rent', 'utilities', 'other'] as const

/** מחשב חיוב מתוך שעות שעוד לא חויבו, לפי שיטת התמחור.
 *  בלי פרויקט = רק שעות שלא שויכו לפרויקט, כדי שכל פרויקט יחויב לפי התעריף שלו */
async function preview(db: D1Database, clientId: string, projectId: string | null, songs: number | null): Promise<ChargePreview> {
  const client = must(await first<Client>(db, `SELECT * FROM clients WHERE id = ?`, clientId), 'הלקוח לא נמצא')
  const project = projectId ? must(await first<Project>(db, `SELECT * FROM projects WHERE id = ? AND client_id = ?`, projectId, clientId), 'הפרויקט לא נמצא') : null
  const settings = await getSettings(db)
  const mode: BillingMode = project?.billing_mode ?? settings.billing_mode

  const entries = await all<{ id: string; seconds: number }>(db,
    `SELECT id, ${SECONDS_SQL} AS seconds FROM time_entries
     WHERE client_id = ? AND ended_at IS NOT NULL AND charge_id IS NULL AND ${projectId ? 'project_id = ?' : 'project_id IS NULL'}`,
    ...(projectId ? [clientId, projectId] : [clientId]))
  const seconds = entries.reduce((s, e) => s + Math.max(0, e.seconds), 0)

  let rate: number
  let amount: number
  if (mode === 'hourly') {
    rate = project?.unit_price ?? client.hourly_rate ?? settings.default_rate
    amount = Math.round((seconds / 3600) * rate)
  } else if (mode === 'per_song') {
    // מחיר לשיר: מהפרויקט, ואם אין, מההגדרות. לא נופלים לתעריף השעתי
    rate = project?.unit_price ?? settings.default_song_price ?? 0
    amount = rate * (songs ?? 0)
  } else {
    // מחיר כולל: מחייבים רק את מה שעוד לא חויב בפרויקט (למשל אחרי מקדמה)
    rate = project?.unit_price ?? project?.quote_amount ?? 0
    const already = project ? (await first<{ v: number }>(db, `SELECT COALESCE(SUM(amount),0) AS v FROM charges WHERE project_id = ?`, project.id))?.v ?? 0 : 0
    amount = Math.max(0, rate - already)
  }
  const hours = (seconds / 3600).toFixed(1)
  const description = mode === 'hourly' ? `${hours} שעות עבודה${project ? ` · ${project.title}` : ''}`
    : mode === 'per_song' ? `${songs ?? 0} שירים${project ? ` · ${project.title}` : ''}`
    : `${project ? project.title : 'פרויקט'} (${BILLING_MODES.fixed}, יתרה)`
  return { mode, seconds, rate, songs, amount, entry_ids: entries.map(e => e.id), description }
}

export const charges = new Hono<AppEnv>()

charges.get('/', async c => {
  const where: string[] = []; const vals: unknown[] = []
  if (c.req.query('client_id')) { where.push('ch.client_id = ?'); vals.push(c.req.query('client_id')) }
  if (c.req.query('from') && c.req.query('to')) { where.push('ch.charged_at >= ? AND ch.charged_at < ?'); vals.push(c.req.query('from'), c.req.query('to')) }
  const sql = `SELECT ch.*, cl.name AS client_name FROM charges ch JOIN clients cl ON cl.id = ch.client_id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY charged_at DESC LIMIT 300`
  return c.json(await all<Charge>(c.env.DB, sql, ...vals))
})

/** תיקון חיוב: תיאור, סכום, תאריך, פרויקט. השעות שחויבו בו נשארות מחויבות */
charges.patch('/:id', async c => {
  const cur = must(await first<Charge>(c.env.DB, `SELECT * FROM charges WHERE id = ?`, c.req.param('id')))
  const b = await body(c.req.raw)
  if ('project_id' in b) await projectOf(c.env.DB, str(b, 'project_id'), cur.client_id)
  await run(c.env.DB, `UPDATE charges SET description = ?, amount = ?, charged_at = ?, project_id = ? WHERE id = ?`,
    'description' in b ? str(b, 'description', { required: true, max: 300 }) : cur.description,
    'amount' in b ? int(b, 'amount', { required: true, min: 0, max: 100_000_000 }) : cur.amount,
    iso(b, 'charged_at') ?? cur.charged_at,
    'project_id' in b ? str(b, 'project_id') : cur.project_id, cur.id)
  return c.json(await first<Charge>(c.env.DB, `SELECT * FROM charges WHERE id = ?`, cur.id))
})

/** פרויקט חייב להיות של אותו לקוח */
async function projectOf(db: D1Database, projectId: string | null, clientId: string | null) {
  if (!projectId) return
  must(await first(db, `SELECT id FROM projects WHERE id = ? AND client_id IS ?`, projectId, clientId), 'הפרויקט לא שייך ללקוח הזה')
}

charges.get('/preview', async c => {
  const clientId = c.req.query('client_id') ?? fail(400, 'חסר לקוח')
  const songs = c.req.query('songs') ? Number(c.req.query('songs')) : null
  return c.json(await preview(c.env.DB, clientId, c.req.query('project_id') || null, songs))
})

/** חיוב ידני, או מתוך שעות (from_time: true). אפשר לדרוס את הסכום המחושב */
charges.post('/', async c => {
  const b = await body(c.req.raw)
  const client_id = str(b, 'client_id', { required: true })!
  const project_id = str(b, 'project_id')
  const id = uid()
  const stmts: D1PreparedStatement[] = []
  let amount = int(b, 'amount', { min: 0 })
  let description = str(b, 'description', { max: 300 })

  if (b.from_time === true) {
    const p = await preview(c.env.DB, client_id, project_id, int(b, 'songs', { min: 0, max: 1000 }))
    // הטופס שולח את רשימת הסשנים שהוא הציג. מסמנים רק אותם, כדי שסשן שנסגר אחרי
    // שהטופס נפתח (ולכן לא נכלל בסכום) לא יסומן כמחויב ויאבד מהחשבון
    let ids = p.entry_ids
    if (Array.isArray(b.entry_ids)) {
      const shown = new Set(b.entry_ids.filter((x): x is string => typeof x === 'string'))
      ids = ids.filter(id => shown.has(id))
      if (ids.length !== shown.size) fail(409, 'השעות השתנו מאז שהטופס נפתח. סגרו ופתחו אותו שוב')
    }
    if (!ids.length && p.mode === 'hourly') fail(400, 'אין שעות פתוחות לחיוב')
    amount ??= p.amount
    description ??= p.description
    // מסמנים את השעות כמחויבות, כדי שלא יחויבו פעמיים
    for (const eid of ids) {
      stmts.push(c.env.DB.prepare(`UPDATE time_entries SET charge_id = ? WHERE id = ? AND charge_id IS NULL`).bind(id, eid))
    }
  } else {
    must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, client_id), 'הלקוח לא נמצא')
  }
  // חיוב מפריט במחירון: כמות × מחיר ליחידה
  const product_id = str(b, 'product_id')
  let quantity: number | null = null, unit_price: number | null = null
  if (product_id) {
    const p = must(await first<{ name: string; price: number }>(c.env.DB, `SELECT name, price FROM products WHERE id = ?`, product_id), 'הפריט לא נמצא במחירון')
    const q = num(b, 'quantity') ?? 1
    if (!(q > 0) || q > 10000) fail(400, 'כמות לא תקינה')
    quantity = q
    const up = int(b, 'unit_price', { min: 0 }) ?? p.price
    unit_price = up
    amount ??= Math.round(q * up)
    description ??= q === 1 ? p.name : `${p.name} × ${q}`
  }
  if (amount == null) fail(400, 'חסר סכום')
  if (!description) fail(400, 'חסר תיאור')
  stmts.unshift(c.env.DB.prepare(
    `INSERT INTO charges (id, client_id, project_id, description, amount, charged_at, product_id, quantity, unit_price) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(id, client_id, project_id, description, amount, iso(b, 'charged_at') ?? nowIso(), product_id, quantity, unit_price))
  await c.env.DB.batch(stmts)
  return c.json(await first<Charge>(c.env.DB, `SELECT * FROM charges WHERE id = ?`, id), 201)
})

charges.delete('/:id', async c => {
  const id = c.req.param('id')
  must(await first(c.env.DB, `SELECT id FROM charges WHERE id = ?`, id))
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE time_entries SET charge_id = NULL WHERE charge_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM charges WHERE id = ?`).bind(id),
  ])
  return c.json({ ok: true })
})

// ---------- תשלומים ----------
export const payments = new Hono<AppEnv>()

payments.get('/', async c => {
  const month = c.req.query('from')
  const to = c.req.query('to')
  const where: string[] = []; const vals: unknown[] = []
  if (c.req.query('client_id')) { where.push('p.client_id = ?'); vals.push(c.req.query('client_id')) }
  if (month && to) { where.push('p.paid_at >= ? AND p.paid_at < ?'); vals.push(month, to) }
  return c.json(await all<Payment>(c.env.DB,
    `SELECT p.*, cl.name AS client_name FROM payments p LEFT JOIN clients cl ON cl.id = p.client_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY paid_at DESC LIMIT 500`, ...vals))
})

payments.post('/', async c => {
  const b = await body(c.req.raw)
  const client_id = str(b, 'client_id')
  if (client_id) must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, client_id), 'הלקוח לא נמצא')
  await projectOf(c.env.DB, str(b, 'project_id'), client_id)
  const id = uid()
  await run(c.env.DB,
    `INSERT INTO payments (id, client_id, project_id, amount, method, paid_at, notes) VALUES (?,?,?,?,?,?,?)`,
    id, client_id, str(b, 'project_id'), int(b, 'amount', { required: true, min: 1, max: 100_000_000 }),
    oneOf(b, 'method', METHODS, 'transfer'), iso(b, 'paid_at') ?? nowIso(), str(b, 'notes', { max: 1000 }))
  return c.json(await first<Payment>(c.env.DB, `SELECT * FROM payments WHERE id = ?`, id), 201)
})

payments.patch('/:id', async c => {
  const cur = must(await first<Payment>(c.env.DB, `SELECT * FROM payments WHERE id = ?`, c.req.param('id')))
  if (cur.invoice_ref) fail(409, 'כבר הופקה קבלה על התשלום הזה')
  const b = await body(c.req.raw)
  const client_id = 'client_id' in b ? str(b, 'client_id') : cur.client_id
  if (client_id) must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, client_id), 'הלקוח לא נמצא')
  const project_id = 'project_id' in b ? str(b, 'project_id') : client_id === cur.client_id ? cur.project_id : null
  await projectOf(c.env.DB, project_id, client_id)
  await run(c.env.DB, `UPDATE payments SET client_id = ?, project_id = ?, amount = ?, method = ?, paid_at = ?, notes = ? WHERE id = ?`,
    client_id, project_id,
    'amount' in b ? int(b, 'amount', { required: true, min: 1, max: 100_000_000 }) : cur.amount,
    'method' in b ? oneOf(b, 'method', METHODS) : cur.method,
    iso(b, 'paid_at') ?? cur.paid_at,
    'notes' in b ? str(b, 'notes', { max: 1000 }) : cur.notes, cur.id)
  return c.json(await first<Payment>(c.env.DB, `SELECT * FROM payments WHERE id = ?`, cur.id))
})

payments.delete('/:id', async c => {
  const r = await run(c.env.DB, `DELETE FROM payments WHERE id = ? AND invoice_ref IS NULL`, c.req.param('id'))
  if (!r.meta.changes) fail(404, 'לא נמצא, או שכבר הופקה עליו קבלה')
  return c.json({ ok: true })
})

// ---------- הוצאות ----------
export const expenses = new Hono<AppEnv>()

expenses.get('/', async c => {
  const from = c.req.query('from'); const to = c.req.query('to')
  return c.json(from && to
    ? await all<Expense>(c.env.DB, `SELECT * FROM expenses WHERE spent_at >= ? AND spent_at < ? ORDER BY spent_at DESC`, from, to)
    : await all<Expense>(c.env.DB, `SELECT * FROM expenses ORDER BY spent_at DESC LIMIT 300`))
})

expenses.post('/', async c => {
  const b = await body(c.req.raw)
  const id = uid()
  await run(c.env.DB,
    `INSERT INTO expenses (id, category, vendor, amount, vat_amount, spent_at, notes) VALUES (?,?,?,?,?,?,?)`,
    id, oneOf(b, 'category', CATEGORIES, 'other'), str(b, 'vendor', { max: 160 }),
    int(b, 'amount', { required: true, min: 1, max: 100_000_000 }), int(b, 'vat_amount', { min: 0 }),
    iso(b, 'spent_at') ?? nowIso(), str(b, 'notes', { max: 1000 }))
  return c.json(await first<Expense>(c.env.DB, `SELECT * FROM expenses WHERE id = ?`, id), 201)
})

expenses.patch('/:id', async c => {
  const cur = must(await first<Expense>(c.env.DB, `SELECT * FROM expenses WHERE id = ?`, c.req.param('id')))
  const b = await body(c.req.raw)
  await run(c.env.DB, `UPDATE expenses SET category = ?, vendor = ?, amount = ?, vat_amount = ?, spent_at = ?, notes = ? WHERE id = ?`,
    'category' in b ? oneOf(b, 'category', CATEGORIES) : cur.category,
    'vendor' in b ? str(b, 'vendor', { max: 160 }) : cur.vendor,
    'amount' in b ? int(b, 'amount', { required: true, min: 1, max: 100_000_000 }) : cur.amount,
    'vat_amount' in b ? int(b, 'vat_amount', { min: 0 }) : cur.vat_amount,
    iso(b, 'spent_at') ?? cur.spent_at,
    'notes' in b ? str(b, 'notes', { max: 1000 }) : cur.notes, cur.id)
  return c.json(await first<Expense>(c.env.DB, `SELECT * FROM expenses WHERE id = ?`, cur.id))
})

expenses.delete('/:id', async c => {
  const r = await run(c.env.DB, `DELETE FROM expenses WHERE id = ?`, c.req.param('id'))
  if (!r.meta.changes) fail(404, 'לא נמצא')
  return c.json({ ok: true })
})
