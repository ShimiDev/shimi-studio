// זימונים ותזכורות: טקסט המייל בעברית + קובץ יומן (ics) שנפתח בגוגל, אפל ואאוטלוק.
import { TZ, israelDate } from '../../shared/time'
import { hebDay } from '../../shared/hebrew'
import { WORK_KINDS } from '../../shared/types'

export type MailKind = 'invite' | 'update' | 'cancel' | 'reminder'

export interface InviteAppt {
  id: string; title: string | null; kind: string; starts_at: string; ends_at: string; notes: string | null
  client_name: string | null; invite_seq: number
}
export interface StudioInfo { name: string; address: string; phone: string; from: string; signature: string }

const fDay = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const fTime = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

export function apptWhen(a: { starts_at: string; ends_at: string }) {
  const s = new Date(a.starts_at), e = new Date(a.ends_at)
  return { day: fDay.format(s), heb: hebDay(israelDate(s)).full, time: `${fTime.format(s)}–${fTime.format(e)}` }
}
/** "האולפן של שימי" → "באולפן של שימי" */
const inPlace = (name: string) => name.startsWith('ה') ? 'ב' + name.slice(1) : 'ב' + name
const what = (a: InviteAppt) => a.title || WORK_KINDS.find(k => k.id === a.kind)?.label || 'סשן באולפן'

// ---------- ics ----------
const icsDate = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
/** קיפול שורות ל-75 בתים, בלי לחתוך אות עברית באמצע */
function fold(line: string) {
  const enc = new TextEncoder()
  const out: string[] = []; let cur = '', len = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (len + n > 74) { out.push(cur); cur = ' '; len = 1 }
    cur += ch; len += n
  }
  out.push(cur)
  return out.join('\r\n')
}

export function buildIcs(a: InviteAppt, studio: StudioInfo, attendee: { email: string; name: string | null }, method: 'REQUEST' | 'CANCEL') {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shimi Studio//HE', 'CALSCALE:GREGORIAN', `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${a.id}@shimi-studio`,
    `SEQUENCE:${a.invite_seq}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(new Date(a.starts_at).toISOString())}`,
    `DTEND:${icsDate(new Date(a.ends_at).toISOString())}`,
    `SUMMARY:${esc(`${what(a)} · ${studio.name}`)}`,
    studio.address ? `LOCATION:${esc(studio.address)}` : '',
    `DESCRIPTION:${esc([studio.phone ? `טלפון לאולפן: ${studio.phone}` : '', a.notes ?? ''].filter(Boolean).join('\n'))}`,
    `ORGANIZER;CN=${esc(studio.name)}:mailto:${studio.from}`,
    `ATTENDEE;CN=${esc(attendee.name || attendee.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:תזכורת', 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean)
  return lines.map(fold).join('\r\n') + '\r\n'
}

// ---------- טקסט המייל ----------
const h = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildMail(kind: MailKind, a: InviteAppt, studio: StudioInfo, note?: string | null) {
  const w = apptWhen(a)
  const first = (a.client_name ?? '').split(' ')[0]
  const hi = first ? `היי ${first},` : 'היי,'
  const subj = {
    invite: `זימון: ${what(a)}, ${w.day} ${w.time}`,
    update: `עדכון מועד: ${what(a)}, ${w.day} ${w.time}`,
    cancel: `בוטל: ${what(a)}, ${w.day}`,
    reminder: `תזכורת: ${what(a)}, ${w.day} ${w.time}`,
  }[kind]
  const lead = {
    invite: `נקבע לך תור ${inPlace(studio.name)}.`,
    update: 'המועד של התור שלך השתנה. זה המועד החדש:',
    cancel: 'התור הבא בוטל:',
    reminder: 'רק מזכירים שנתראה בקרוב:',
  }[kind]
  const tail = kind === 'cancel' ? 'נשמח לקבוע מועד אחר.' : kind === 'reminder' ? 'אם משהו השתנה, נשמח לדעת מראש.' : 'הזימון מצורף, ואפשר להוסיף אותו ליומן בלחיצה.'
  const sig = studio.signature || studio.name

  const rows: [string, string][] = [['מה', what(a)], ['מתי', `${w.day} · ${w.time}`], ['', w.heb]]
  if (studio.address) rows.push(['איפה', studio.address])
  if (studio.phone) rows.push(['טלפון', studio.phone])

  const text = [hi, '', lead, '', ...rows.map(([k, v]) => k ? `${k}: ${v}` : v), note ? `\n${note}` : '', '', tail, '', sig].join('\n')
  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1b181c">
<div style="max-width:520px;margin:0 auto;padding:24px 16px" dir="rtl">
 <div style="background:#0b0a0c;color:#e4c78f;border-radius:14px 14px 0 0;padding:16px 20px;font-size:18px;font-weight:bold">${h(studio.name)}</div>
 <div style="background:#fff;border-radius:0 0 14px 14px;padding:20px;line-height:1.6;text-align:right">
  <p style="margin:0 0 8px">${h(hi)}</p>
  <p style="margin:0 0 14px">${h(lead)}</p>
  <table style="width:100%;border-collapse:collapse;background:${kind === 'cancel' ? '#f6eeee' : '#faf6ee'};border-radius:10px" dir="rtl">
   ${rows.map(([k, v]) => `<tr><td style="padding:6px 12px;color:#7d767d;width:70px;vertical-align:top">${h(k)}</td><td style="padding:6px 12px;${k === 'מתי' ? 'font-weight:bold;' : ''}${kind === 'cancel' ? 'text-decoration:line-through;' : ''}">${h(v)}</td></tr>`).join('')}
  </table>
  ${note ? `<p style="margin:14px 0 0;white-space:pre-line">${h(note)}</p>` : ''}
  <p style="margin:14px 0 0">${h(tail)}</p>
  <p style="margin:18px 0 0;color:#7d767d;white-space:pre-line">${h(sig)}</p>
 </div>
</div></body></html>`
  return { subject: subj, text, html }
}
