// שעון העבודה. כל הפעולות מחשבות זמן בשרת (לא בדפדפן),
// כך שגם אם הלשונית נסגרה או המחשב נרדם, הזמן נשמר נכון.
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { all, first, run, uid, nowIso, fail, must } from '../lib/db'
import { body, str, oneOf, bool, iso, int } from '../lib/validate'
import type { RunningClock, TimeEntry, WorkKind } from '../../shared/types'
import { entrySeconds } from '../../shared/time'

const KINDS = ['recording', 'mix', 'master', 'edit', 'production'] as const

const RUNNING_SQL = `
SELECT t.*, c.name AS client_name, c.color_a, c.color_b, c.is_group
FROM time_entries t LEFT JOIN clients c ON c.id = t.client_id
WHERE t.ended_at IS NULL LIMIT 1`

// סוגר השהיה פתוחה וסוגר את השעון. ?1 = עכשיו
const CLOSE_PAUSE_SQL = `UPDATE time_entries
  SET paused_seconds = paused_seconds + CAST(ROUND((julianday(?1) - julianday(paused_at)) * 86400) AS INTEGER),
      paused_at = NULL
  WHERE ended_at IS NULL AND paused_at IS NOT NULL`
const STOP_SQL = `UPDATE time_entries SET ended_at = ?1 WHERE ended_at IS NULL`

/** לאיזה פרויקט לשייך סשן כשלא נבחר פרויקט: הפרויקט הפעיל שעבדו עליו אחרון,
 *  ואם עוד לא עבדו על אף אחד, הפעיל החדש ביותר. בלי פרויקט פעיל = נשאר לא משויך */
export async function defaultProject(db: D1Database, clientId: string | null): Promise<string | null> {
  if (!clientId) return null
  const r = await first<{ id: string }>(db,
    `SELECT p.id FROM projects p WHERE p.client_id = ? AND p.status = 'active'
     ORDER BY (SELECT MAX(started_at) FROM time_entries t WHERE t.project_id = p.id) DESC NULLS LAST, p.created_at DESC LIMIT 1`, clientId)
  return r?.id ?? null
}
async function checkProject(db: D1Database, projectId: string | null, clientId: string | null) {
  if (!projectId) return
  must(await first(db, `SELECT id FROM projects WHERE id = ? AND client_id IS ?`, projectId, clientId), 'הפרויקט לא שייך ללקוח הזה')
}

export const clock = new Hono<AppEnv>()

clock.get('/', async c => c.json(await first<RunningClock>(c.env.DB, RUNNING_SQL)))

/**
 * מתחיל שעון. אם שעון אחר רץ, הוא נשמר ונסגר באותה פעולה (batch = טרנזקציה).
 * recording + is_client_present = REC (הנתונים מוסתרים). recording בלי לקוח = סשן פרטי.
 */
clock.post('/start', async c => {
  const b = await body(c.req.raw)
  const kind = oneOf(b, 'kind', KINDS) as WorkKind
  const client_id = str(b, 'client_id')
  const present = kind === 'recording' && !!client_id && bool(b, 'is_client_present')
  if (kind !== 'recording' && !client_id) fail(400, 'שעון עבודה צריך לקוח')
  if (client_id) must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, client_id), 'הלקוח לא נמצא')
  const project_id = str(b, 'project_id') ?? await defaultProject(c.env.DB, client_id)
  await checkProject(c.env.DB, project_id, client_id)

  const now = nowIso()
  const prev = await first<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE ended_at IS NULL`)
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(CLOSE_PAUSE_SQL).bind(now),
      c.env.DB.prepare(STOP_SQL).bind(now),
      c.env.DB.prepare(
        `INSERT INTO time_entries (id, client_id, project_id, kind, is_client_present, started_at) VALUES (?,?,?,?,?,?)`,
      ).bind(uid(), client_id, project_id, kind, present ? 1 : 0, now),
    ])
  } catch (e) {
    // האינדקס הייחודי עצר שעון כפול (למשל לחיצה כפולה משני מכשירים)
    if (String(e).includes('UNIQUE')) fail(409, 'כבר רץ שעון. רעננו ונסו שוב')
    throw e
  }
  const stopped = prev ? await first<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE id = ?`, prev.id) : null
  return c.json({
    running: await first<RunningClock>(c.env.DB, RUNNING_SQL),
    stopped: stopped ? { ...stopped, seconds: entrySeconds(stopped) } : null,
  })
})

clock.post('/pause', async c => {
  await run(c.env.DB, `UPDATE time_entries SET paused_at = ? WHERE ended_at IS NULL AND paused_at IS NULL`, nowIso())
  return c.json(await first<RunningClock>(c.env.DB, RUNNING_SQL))
})

clock.post('/resume', async c => {
  await run(c.env.DB, CLOSE_PAUSE_SQL, nowIso())
  return c.json(await first<RunningClock>(c.env.DB, RUNNING_SQL))
})

clock.post('/stop', async c => {
  const cur = await first<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE ended_at IS NULL`)
  if (!cur) return c.json({ stopped: null })
  const now = nowIso()
  await c.env.DB.batch([
    c.env.DB.prepare(CLOSE_PAUSE_SQL).bind(now),
    c.env.DB.prepare(`UPDATE time_entries SET ended_at = ?1 WHERE id = ?2`).bind(now, cur.id),
  ])
  const done = must(await first<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE id = ?`, cur.id))
  return c.json({ stopped: { ...done, seconds: entrySeconds(done) } })
})

// ---------- רישום שעות (רשימה, הוספה ידנית, מחיקה) ----------
export const time = new Hono<AppEnv>()

time.get('/', async c => {
  const client = c.req.query('client_id')
  const rows = client
    ? await all<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE client_id = ? ORDER BY started_at DESC LIMIT 200`, client)
    : await all<TimeEntry>(c.env.DB, `SELECT * FROM time_entries ORDER BY started_at DESC LIMIT 200`)
  return c.json(rows)
})

/** הוספה ידנית: "שכחתי להפעיל שעון" */
time.post('/', async c => {
  const b = await body(c.req.raw)
  const started = iso(b, 'started_at', { required: true })!
  const minutes = int(b, 'minutes', { required: true, min: 1, max: 24 * 60 })!
  const client_id = str(b, 'client_id', { required: true })!
  must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, client_id), 'הלקוח לא נמצא')
  // project_id: null שנשלח במפורש = "בלי פרויקט". שדה חסר = הפרויקט הפעיל
  const project_id = 'project_id' in b ? str(b, 'project_id') : await defaultProject(c.env.DB, client_id)
  await checkProject(c.env.DB, project_id, client_id)
  const id = uid()
  await run(c.env.DB,
    `INSERT INTO time_entries (id, client_id, project_id, kind, started_at, ended_at, source, notes) VALUES (?,?,?,?,?,?, 'manual', ?)`,
    id, client_id, project_id, oneOf(b, 'kind', KINDS), started,
    new Date(Date.parse(started) + minutes * 60000).toISOString(), str(b, 'notes', { max: 1000 }))
  return c.json(await first<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE id = ?`, id), 201)
})

/** שיוך סשן לפרויקט (או ביטול שיוך). שעות שכבר חויבו נשארות איפה שהן */
time.patch('/:id', async c => {
  const e = must(await first<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE id = ?`, c.req.param('id')))
  const b = await body(c.req.raw)
  if (!('project_id' in b)) fail(400, 'אין מה לעדכן')
  if (e.charge_id) fail(409, 'השעות האלה כבר חויבו. כדי להעביר אותן, מחקו קודם את החיוב')
  const project_id = str(b, 'project_id')
  await checkProject(c.env.DB, project_id, e.client_id)
  await run(c.env.DB, `UPDATE time_entries SET project_id = ? WHERE id = ?`, project_id, e.id)
  return c.json(await first<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE id = ?`, e.id))
})

/** שיוך כל הסשנים הפתוחים (לא משויכים ולא מחויבים) של הלקוח לפרויקט אחד */
time.post('/assign', async c => {
  const b = await body(c.req.raw)
  const project_id = str(b, 'project_id', { required: true })!
  const p = must(await first<{ client_id: string }>(c.env.DB, `SELECT client_id FROM projects WHERE id = ?`, project_id), 'הפרויקט לא נמצא')
  const r = await run(c.env.DB, `UPDATE time_entries SET project_id = ? WHERE client_id = ? AND project_id IS NULL AND charge_id IS NULL AND ended_at IS NOT NULL`, project_id, p.client_id)
  return c.json({ assigned: r.meta.changes })
})

time.delete('/:id', async c => {
  const e = must(await first<TimeEntry>(c.env.DB, `SELECT * FROM time_entries WHERE id = ?`, c.req.param('id')))
  if (!e.ended_at) fail(409, 'אי אפשר למחוק שעון שרץ. עצרו אותו קודם')
  if (e.charge_id) fail(409, 'השעות האלה כבר חויבו. מחקו קודם את החיוב')
  await run(c.env.DB, `DELETE FROM time_entries WHERE id = ?`, e.id)
  return c.json({ ok: true })
})
