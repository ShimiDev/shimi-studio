// שליחת זימון / עדכון / ביטול / תזכורת על תור, ורישום שנשלח
import type { Env } from '../env'
import { first, run, nowIso } from './db'
import { sendMail, fromAddress, validEmail } from './smtp'
import { buildIcs, buildMail, type InviteAppt, type MailKind, type StudioInfo } from './invite'
import { getSettings } from '../routes/settings'

type Row = InviteAppt & { client_email: string | null; invite_email: string | null; status: string }

export async function studioInfo(env: Env): Promise<StudioInfo> {
  const s = await getSettings(env.DB)
  return { name: s.studio_name || 'האולפן של שימי', address: s.studio_address, phone: s.studio_phone, signature: s.email_signature, from: fromAddress(env) }
}

export async function sendApptMail(env: Env, id: string, kind: MailKind, opts: { email?: string | null; note?: string | null } = {}) {
  const a = await first<Row>(env.DB,
    `SELECT a.*, c.name AS client_name, c.email AS client_email FROM appointments a LEFT JOIN clients c ON c.id = a.client_id WHERE a.id = ?`, id)
  if (!a) throw new Error('התור לא נמצא')
  const to = (opts.email || (kind === 'invite' ? null : a.invite_email) || a.client_email || '').trim()
  if (!to) throw new Error('ללקוח אין כתובת מייל. אפשר להוסיף אותה בכרטיס הלקוח')
  if (!validEmail(to)) throw new Error('כתובת המייל לא תקינה')
  const studio = await studioInfo(env)
  // עדכון ביומן של הלקוח עובד רק אם ה-SEQUENCE גדל
  const seq = kind === 'invite' && !a.invite_email ? a.invite_seq : a.invite_seq + (kind === 'reminder' ? 0 : 1)
  const appt = { ...a, invite_seq: seq }
  const mail = buildMail(kind, appt, studio, opts.note)
  const method = kind === 'cancel' ? 'CANCEL' : 'REQUEST'
  await sendMail(env, {
    to, toName: a.client_name, ...mail,
    ics: kind === 'reminder' && !a.invite_email ? undefined : { method, body: buildIcs(appt, studio, { email: to, name: a.client_name }, method) },
  }, studio.name)
  if (kind === 'reminder') await run(env.DB, `UPDATE appointments SET reminder_sent_at = ? WHERE id = ?`, nowIso(), id)
  else await run(env.DB, `UPDATE appointments SET invite_sent_at = ?, invite_email = ?, invite_seq = ? WHERE id = ?`, nowIso(), to, seq, id)
  return { to }
}

/** רץ כל רבע שעה (cron): שולח תזכורת לתורים שמתקרבים */
export async function runReminders(env: Env) {
  const s = await getSettings(env.DB)
  if (!s.reminders_enabled) return { sent: 0 }
  const now = Date.now()
  const until = new Date(now + s.reminder_hours * 3600e3).toISOString()
  const due = await env.DB.prepare(
    `SELECT a.id FROM appointments a JOIN clients c ON c.id = a.client_id
     WHERE a.status = 'scheduled' AND a.reminder_sent_at IS NULL AND a.starts_at > ? AND a.starts_at <= ?
       AND COALESCE(a.invite_email, c.email) IS NOT NULL AND COALESCE(a.invite_email, c.email) != ''
     ORDER BY a.starts_at LIMIT 20`).bind(new Date(now).toISOString(), until).all<{ id: string }>()
  let sent = 0
  for (const r of due.results) {
    try { await sendApptMail(env, r.id, 'reminder'); sent++ } catch (e) { console.error('reminder failed', r.id, String(e)) }
  }
  return { sent }
}
