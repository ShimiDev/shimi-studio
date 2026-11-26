// תורים. בשלב 2 כל שינוי כאן יסונכרן גם ליומן גוגל
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { all, first, run, uid, must, fail, nowIso } from '../lib/db'
import { body, str, iso, oneOf } from '../lib/validate'
import type { Appointment, Reminder } from '../../shared/types'
import { sendApptMail } from '../lib/apptmail'

const APPT_SQL = `SELECT a.*, c.name AS client_name, c.color_a, c.email AS client_email FROM appointments a LEFT JOIN clients c ON c.id = a.client_id`

export const appointments = new Hono<AppEnv>()

appointments.get('/', async c => {
  const from = c.req.query('from'); const to = c.req.query('to')
  if (!from || !to) fail(400, 'חסר טווח תאריכים')
  return c.json(await all<Appointment>(c.env.DB,
    `${APPT_SQL} WHERE a.starts_at >= ? AND a.starts_at < ? ORDER BY a.starts_at`, from, to))
})

appointments.post('/', async c => {
  const b = await body(c.req.raw)
  const starts = iso(b, 'starts_at', { required: true })!
  const ends = iso(b, 'ends_at', { required: true })!
  if (ends <= starts) fail(400, 'שעת הסיום חייבת להיות אחרי שעת ההתחלה')
  const client_id = str(b, 'client_id')
  if (client_id) must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, client_id), 'הלקוח לא נמצא')
  // מזהירים על חפיפה, אבל לא חוסמים: לפעמים זה בכוונה
  const overlap = await first<{ n: number }>(c.env.DB,
    `SELECT COUNT(*) AS n FROM appointments WHERE status = 'scheduled' AND starts_at < ? AND ends_at > ?`, ends, starts)
  const id = uid()
  await run(c.env.DB,
    `INSERT INTO appointments (id, client_id, project_id, title, kind, starts_at, ends_at, notes) VALUES (?,?,?,?,?,?,?,?)`,
    id, client_id, str(b, 'project_id'), str(b, 'title', { max: 160 }), str(b, 'kind', { max: 40 }) ?? 'recording',
    starts, ends, str(b, 'notes', { max: 2000 }))
  const appt = await first<Appointment>(c.env.DB, `${APPT_SQL} WHERE a.id = ?`, id)
  return c.json({ ...appt, overlap: (overlap?.n ?? 0) > 0 }, 201)
})

appointments.patch('/:id', async c => {
  const id = c.req.param('id')
  const cur = must(await first<Appointment>(c.env.DB, `SELECT * FROM appointments WHERE id = ?`, id))
  const b = await body(c.req.raw)
  const starts = iso(b, 'starts_at') ?? cur.starts_at
  const ends = iso(b, 'ends_at') ?? cur.ends_at
  if (ends <= starts) fail(400, 'שעת הסיום חייבת להיות אחרי שעת ההתחלה')
  const newClient = 'client_id' in b ? str(b, 'client_id') : cur.client_id
  if (newClient && newClient !== cur.client_id) must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, newClient), 'הלקוח לא נמצא')
  // הלקוח התחלף: הזימון הקודם שייך ללקוח אחר, אז מתחילים מחדש (עדכון לא יישלח לכתובת הישנה)
  if (newClient !== cur.client_id) await run(c.env.DB, `UPDATE appointments SET invite_email = NULL, invite_sent_at = NULL, reminder_sent_at = NULL, invite_seq = invite_seq + 1 WHERE id = ?`, id)
  await run(c.env.DB,
    `UPDATE appointments SET client_id = ?, title = ?, kind = ?, starts_at = ?, ends_at = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`,
    'client_id' in b ? str(b, 'client_id') : cur.client_id,
    'title' in b ? str(b, 'title', { max: 160 }) : cur.title,
    'kind' in b ? (str(b, 'kind', { max: 40 }) ?? 'recording') : cur.kind,
    starts, ends,
    'status' in b ? oneOf(b, 'status', ['scheduled', 'done', 'cancelled'] as const) : cur.status,
    'notes' in b ? str(b, 'notes', { max: 2000 }) : cur.notes,
    nowIso(), id)
  return c.json(await first<Appointment>(c.env.DB, `${APPT_SQL} WHERE a.id = ?`, id))
})

/** זימון / עדכון / ביטול במייל ללקוח */
appointments.post('/:id/send', async c => {
  const b = await body(c.req.raw)
  const kind = oneOf(b, 'kind', ['invite', 'update', 'cancel', 'reminder'] as const)
  try {
    const r = await sendApptMail(c.env, c.req.param('id'), kind, { email: str(b, 'email', { max: 200 }), note: str(b, 'note', { max: 1000 }) })
    return c.json({ ok: true, ...r, appt: await first<Appointment>(c.env.DB, `${APPT_SQL} WHERE a.id = ?`, c.req.param('id')) })
  } catch (e) {
    fail(400, e instanceof Error ? e.message : 'השליחה נכשלה')
  }
})

appointments.delete('/:id', async c => {
  const r = await run(c.env.DB, `DELETE FROM appointments WHERE id = ?`, c.req.param('id'))
  if (!r.meta.changes) fail(404, 'לא נמצא')
  return c.json({ ok: true })
})

// ---------- תזכורות ----------
export const reminders = new Hono<AppEnv>()

reminders.get('/', async c => c.json(await all<Reminder>(c.env.DB,
  `SELECT r.*, c.name AS client_name FROM reminders r LEFT JOIN clients c ON c.id = r.client_id
   WHERE r.done_at IS NULL OR r.done_at > datetime('now','-1 day') ORDER BY r.done_at IS NOT NULL, r.due_at IS NULL, r.due_at, r.created_at`)))

reminders.post('/', async c => {
  const b = await body(c.req.raw)
  const id = uid()
  await run(c.env.DB, `INSERT INTO reminders (id, client_id, text, due_at) VALUES (?,?,?,?)`,
    id, str(b, 'client_id'), str(b, 'text', { required: true, max: 500 }), iso(b, 'due_at'))
  return c.json(await first<Reminder>(c.env.DB, `SELECT * FROM reminders WHERE id = ?`, id), 201)
})

reminders.patch('/:id', async c => {
  const b = await body(c.req.raw)
  const r = await run(c.env.DB, `UPDATE reminders SET done_at = ? WHERE id = ?`, b.done === true ? nowIso() : null, c.req.param('id'))
  if (!r.meta.changes) fail(404, 'לא נמצא')
  return c.json({ ok: true })
})

reminders.delete('/:id', async c => {
  await run(c.env.DB, `DELETE FROM reminders WHERE id = ?`, c.req.param('id'))
  return c.json({ ok: true })
})
