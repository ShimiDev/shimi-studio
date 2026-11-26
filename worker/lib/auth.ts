// שכבת האבטחה השנייה: גם אם מישהו עוקף את Cloudflare Access ופונה ישר ל-Worker,
// בלי חתימה תקפה של Access הוא לא יקבל אף נתון.
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../env'

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let jwksTeam = ''

export const requireAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  const env = c.env
  // מעקף לפיתוח: רק אם הוגדר ב-.dev.vars וגם הבקשה מגיעה מהמחשב המקומי
  const host = new URL(c.req.url).hostname
  if (env.DEV_BYPASS_AUTH === 'true' && (host === 'localhost' || host === '127.0.0.1')) return next()

  const team = env.ACCESS_TEAM_DOMAIN
  const aud = env.ACCESS_AUD
  // אם ההגדרות חסרות, נועלים הכל. עדיף מערכת סגורה ממערכת פתוחה בטעות.
  if (!team || !aud) return c.json({ error: 'המערכת עדיין לא הוגדרה לכניסה מאובטחת' }, 503)

  const token = c.req.header('Cf-Access-Jwt-Assertion')
  if (!token) return c.json({ error: 'נדרשת כניסה' }, 401)

  if (!jwks || jwksTeam !== team) {
    jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`))
    jwksTeam = team
  }
  try {
    await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud })
  } catch {
    return c.json({ error: 'הכניסה פגה. רעננו את הדף' }, 401)
  }
  return next()
}
