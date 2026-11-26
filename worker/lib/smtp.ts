// שליחת מייל דרך תיבת הדואר של שימי (SMTP), בלי שירות חיצוני.
// Workers פותחים חיבור TCP דרך cloudflare:sockets. פורט 465 = TLS מההתחלה, 587 = STARTTLS.
import { connect } from 'cloudflare:sockets'
import type { Env } from '../env'

export interface Mail {
  to: string
  toName?: string | null
  subject: string
  text: string
  html: string
  /** הזמנה ליומן (VCALENDAR). method = REQUEST / CANCEL */
  ics?: { body: string; method: 'REQUEST' | 'CANCEL' }
}

export function smtpConfigured(env: Env) {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
}
export const fromAddress = (env: Env) => env.SMTP_FROM || env.SMTP_USER || ''

const enc = new TextEncoder(), dec = new TextDecoder()
const b64 = (s: string) => { let bin = ''; for (const b of enc.encode(s)) bin += String.fromCharCode(b); return btoa(bin) }
const wrap = (s: string) => s.replace(/.{1,76}/g, '$&\r\n')
/** כותרת בעברית: =?UTF-8?B?...?= */
const word = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`
const addr = (email: string, name?: string | null) => name ? `${word(name.replace(/["\\]/g, ''))} <${email}>` : `<${email}>`
export const validEmail = (s: string) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(s)

function buildMime(env: Env, m: Mail, fromName: string) {
  const from = fromAddress(env)
  const boundary = 'b_' + crypto.randomUUID().replace(/-/g, '')
  const domain = from.split('@')[1] || 'localhost'
  const part = (type: string, body: string) =>
    `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(body))}`
  const parts = [part('text/plain', m.text), part('text/html', m.html)]
  if (m.ics) parts.push(part(`text/calendar; method=${m.ics.method}`, m.ics.body))
  const head = [
    `From: ${addr(from, fromName)}`,
    `To: ${addr(m.to, m.toName)}`,
    `Subject: ${word(m.subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  return head.join('\r\n') + '\r\n\r\n' + parts.join('\r\n') + `\r\n--${boundary}--\r\n`
}

/** שולח מייל אחד. זורק שגיאה בעברית אם משהו נכשל */
export async function sendMail(env: Env, m: Mail, fromName = 'האולפן של שימי') {
  if (!smtpConfigured(env)) throw new Error('שליחת מיילים עוד לא הוגדרה (חסרים פרטי SMTP)')
  if (!validEmail(m.to)) throw new Error('כתובת המייל של הנמען לא תקינה')
  const port = Number(env.SMTP_PORT || 465)
  // SMTP_TLS=off רק לבדיקות מול שרת מקומי
  const plain = env.SMTP_TLS === 'off'
  const starttls = !plain && (port === 587 || port === 25 || port === 2525)
  let socket = connect({ hostname: env.SMTP_HOST!, port }, { secureTransport: plain ? 'off' : starttls ? 'starttls' : 'on', allowHalfOpen: false })
  let reader = socket.readable.getReader(), writer = socket.writable.getWriter()
  let buf = ''

  const read = async (): Promise<{ code: number; text: string }> => {
    const lines: string[] = []
    for (;;) {
      const nl = buf.indexOf('\r\n')
      if (nl >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2); lines.push(line)
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join('\n') }
        continue
      }
      const { value, done } = await reader.read()
      if (done) throw new Error('שרת המייל סגר את החיבור')
      buf += dec.decode(value, { stream: true })
    }
  }
  const cmd = async (line: string | null, expect: number[], what: string) => {
    if (line != null) await writer.write(enc.encode(line + '\r\n'))
    const r = await read()
    if (!expect.includes(r.code)) {
      if (r.code === 535 || r.code === 534) throw new Error('שרת המייל דחה את הסיסמה. בג׳ימייל צריך "סיסמת אפליקציה", לא את הסיסמה הרגילה')
      throw new Error(`שרת המייל החזיר שגיאה ב${what} (${r.code})`)
    }
    return r
  }

  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('שרת המייל לא ענה בזמן')), 20000))
  const run = async () => {
    await cmd(null, [220], 'פתיחת החיבור')
    await cmd('EHLO shimi-studio', [250], 'EHLO')
    if (starttls) {
      await cmd('STARTTLS', [220], 'STARTTLS')
      reader.releaseLock(); writer.releaseLock()
      socket = socket.startTls()
      reader = socket.readable.getReader(); writer = socket.writable.getWriter(); buf = ''
      await cmd('EHLO shimi-studio', [250], 'EHLO')
    }
    await cmd(`AUTH PLAIN ${b64(`\0${env.SMTP_USER}\0${env.SMTP_PASS}`)}`, [235], 'ההתחברות')
    await cmd(`MAIL FROM:<${fromAddress(env)}>`, [250], 'השולח')
    await cmd(`RCPT TO:<${m.to}>`, [250, 251], 'הנמען')
    await cmd('DATA', [354], 'DATA')
    // נקודה בתחילת שורה מוכפלת לפי התקן
    const data = buildMime(env, m, fromName).replace(/\r\n\./g, '\r\n..')
    await cmd(data + '\r\n.', [250], 'שליחת ההודעה')
    await writer.write(enc.encode('QUIT\r\n')).catch(() => {})
  }
  try { await Promise.race([run(), timeout]) }
  finally { try { await socket.close() } catch { /* */ } }
}
