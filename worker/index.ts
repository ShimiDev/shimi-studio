// נקודת הכניסה של ה-Worker. כל מה שמתחת ל-/api עובר בדיקת כניסה,
// וכל השאר (האתר עצמו) מוגש מקבצים סטטיים על ידי Cloudflare.
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './env'
import { requireAccess } from './lib/auth'
import { clients, projects } from './routes/clients'
import { clock, time } from './routes/clock'
import { charges, payments, expenses } from './routes/money'
import { appointments, reminders } from './routes/calendar'
import { settings } from './routes/settings'
import { overview } from './routes/overview'
import { demo } from './routes/demo'

const app = new Hono<AppEnv>().basePath('/api')

app.use('*', requireAccess)
// הנתונים פרטיים: לא שומרים אותם בשום מטמון בדרך
app.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store') })

app.get('/health', c => c.json({ ok: true }))
app.route('/clients', clients)
app.route('/projects', projects)
app.route('/clock', clock)
app.route('/time', time)
app.route('/charges', charges)
app.route('/payments', payments)
app.route('/expenses', expenses)
app.route('/appointments', appointments)
app.route('/reminders', reminders)
app.route('/settings', settings)
app.route('/demo', demo)
app.route('/', overview)

app.notFound(c => c.json({ error: 'לא נמצא' }, 404))
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'משהו השתבש בשרת. נסו שוב' }, 500)
})

export default app
