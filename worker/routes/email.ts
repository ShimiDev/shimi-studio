import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { fail } from '../lib/db'
import { sendMail, smtpConfigured, fromAddress } from '../lib/smtp'
import { studioInfo } from '../lib/apptmail'

export const email = new Hono<AppEnv>()

email.get('/', c => c.json({ configured: smtpConfigured(c.env), from: smtpConfigured(c.env) ? fromAddress(c.env) : null }))

/** מייל בדיקה לתיבה של שימי עצמו */
email.post('/test', async c => {
  const studio = await studioInfo(c.env)
  try {
    await sendMail(c.env, {
      to: fromAddress(c.env), subject: `בדיקה מ${studio.name}`,
      text: 'אם המייל הזה הגיע, שליחת זימונים ותזכורות מהמערכת עובדת.',
      html: '<div dir="rtl" style="font-family:Arial">אם המייל הזה הגיע, שליחת זימונים ותזכורות מהמערכת עובדת.</div>',
    }, studio.name)
  } catch (e) { fail(400, e instanceof Error ? e.message : 'השליחה נכשלה') }
  return c.json({ ok: true, to: fromAddress(c.env) })
})
