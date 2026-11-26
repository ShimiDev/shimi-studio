// הערות סשן. משימות נשמרות כתזכורות (reminders), כדי שיופיעו גם ברשימת התזכורות בחדר הבקרה.
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { all, first, run, uid, must, fail } from '../lib/db'
import { body, str } from '../lib/validate'
import type { Note } from '../../shared/types'

export const notes = new Hono<AppEnv>()

notes.get('/', async c => {
  const client = c.req.query('client_id')
  if (!client) fail(400, 'חסר לקוח')
  return c.json(await all<Note>(c.env.DB, `SELECT * FROM notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 200`, client))
})

/** הוספה מהירה: { kind: 'note' | 'task', text, client_id?, time_entry_id? } */
notes.post('/', async c => {
  const b = await body(c.req.raw)
  const text = str(b, 'text', { required: true, max: 2000 })!
  const kind = b.kind === 'task' ? 'task' : 'note'
  const client_id = str(b, 'client_id')
  const entry = str(b, 'time_entry_id')
  if (client_id) must(await first(c.env.DB, `SELECT id FROM clients WHERE id = ?`, client_id), 'הלקוח לא נמצא')
  if (entry) must(await first(c.env.DB, `SELECT id FROM time_entries WHERE id = ?`, entry), 'הסשן לא נמצא')
  if (!client_id && !entry) fail(400, 'הערה צריכה לקוח או סשן')
  const id = uid()
  if (kind === 'task') {
    if (text.length > 500) fail(400, 'משימה יכולה להיות עד 500 תווים')
    await run(c.env.DB, `INSERT INTO reminders (id, client_id, text, time_entry_id) VALUES (?,?,?,?)`, id, client_id, text, entry)
  } else {
    await run(c.env.DB, `INSERT INTO notes (id, client_id, time_entry_id, text) VALUES (?,?,?,?)`, id, client_id, entry, text)
  }
  return c.json({ id, kind, text }, 201)
})

notes.delete('/:id', async c => {
  await run(c.env.DB, `DELETE FROM notes WHERE id = ?`, c.req.param('id'))
  return c.json({ ok: true })
})
