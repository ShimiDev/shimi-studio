// נתוני הדגמה: נטענים ונמחקים בלחיצה מההגדרות.
// כל שורה מקבלת מזהה שמתחיל ב-demo-, כך שהמחיקה נוגעת רק בהם ולא בנתונים אמיתיים.
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { first, fail } from '../lib/db'
import { israelDate, israelMidnightUtc, addDays } from '../../shared/time'

const P = 'demo-'

type Row = Record<string, string | number | null>

/** מחולל פסאודו-אקראי קבוע, כדי שההדגמה תיראה אותו דבר בכל טעינה */
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
}

function build(now = new Date()) {
  const today = israelDate(now)
  const at = (day: number, hour: number, min = 0) =>
    new Date(israelMidnightUtc(addDays(today, day)).getTime() + (hour * 60 + min) * 60000).toISOString()
  const dow = (day: number) => new Date(addDays(today, day) + 'T12:00:00Z').getUTCDay() // 5 שישי, 6 שבת
  const rand = rng(20261126)
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]

  const clients: Row[] = [
    { id: 'noa', name: 'נועה לוי', kind: 'artist', is_group: 0, phone: '050-1234567', email: 'noa.demo@example.com', color_a: '#ff8ac0', color_b: '#7b5cff', notes: 'זמרת-יוצרת. אוהבת להקליט בבוקר. אלבום בכורה, 9 שירים.', days: 120 },
    { id: 'hatzer', name: 'להקת החצר', kind: 'band', is_group: 1, phone: '052-2223344', email: null, color_a: '#ffb84d', color_b: '#ff5d7a', notes: 'רוק אלטרנטיבי, 4 חברים. איש קשר: גיל (גיטרה).', days: 100 },
    { id: 'erev', name: 'פודקאסט שיחות ערב', kind: 'podcast', is_group: 0, phone: '054-9876543', email: 'erev.demo@example.com', color_a: '#4df2c3', color_b: '#2b6cff', notes: 'פרק שבועי, שעה וחצי כולל עריכה.', days: 150 },
    { id: 'omer', name: 'עומר בן דוד', kind: 'artist', is_group: 0, phone: '053-5550001', email: null, color_a: '#8bd3ff', color_b: '#8b7bff', notes: 'לקוח חדש. מתלבט בין סינגל לאי.פי.', days: 4 },
    { id: 'dana', name: 'דנה כהן', kind: 'artist', is_group: 0, phone: '058-4440123', email: null, color_a: '#c6ff4d', color_b: '#1e9e7a', notes: 'שירי ילדים. מגיעה עם הגיטריסט שלה.', days: 70 },
    { id: 'choir', name: 'מקהלת הגליל', kind: 'choir', is_group: 1, phone: '04-6001234', email: 'choir.demo@example.com', color_a: '#ffd166', color_b: '#06b88a', notes: '24 זמרים. הקלטות בקבוצות של 6.', days: 45 },
    { id: 'yuval', name: 'יובל אזולאי', kind: 'artist', is_group: 0, phone: '050-7778899', email: null, color_a: '#ff6b5b', color_b: '#3a3a8c', notes: 'ראפ. מביא ביטים מוכנים, צריך מיקס ומאסטר.', days: 60 },
    { id: 'mirpeset', name: 'להקת מרפסת', kind: 'band', is_group: 1, phone: '052-6665432', email: null, color_a: '#b58cff', color_b: '#ff9f43', notes: 'פולק. סיימו אלבום בקיץ.', days: 200, archived: 1 },
  ]

  const projects: Row[] = [
    { id: 'noa-album', client_id: 'noa', title: 'אלבום בכורה', billing_mode: 'fixed', unit_price: 1800000, quote_amount: 1800000, quoted_hours: 80, status: 'active' },
    { id: 'hatzer-ep', client_id: 'hatzer', title: 'מיקס EP', billing_mode: 'per_song', unit_price: 90000, quote_amount: 450000, quoted_hours: null, status: 'active' },
    { id: 'erev-weekly', client_id: 'erev', title: 'הקלטה ועריכה שבועית', billing_mode: 'hourly', unit_price: 18000, quote_amount: null, quoted_hours: null, status: 'active' },
    { id: 'dana-kids', client_id: 'dana', title: 'שירי ילדים', billing_mode: 'hourly', unit_price: null, quote_amount: null, quoted_hours: 20, status: 'active' },
    { id: 'choir-hanuka', client_id: 'choir', title: 'אלבום חנוכה', billing_mode: 'fixed', unit_price: 950000, quote_amount: 950000, quoted_hours: 45, status: 'active' },
    { id: 'yuval-single', client_id: 'yuval', title: 'סינגל "לילה בעיר"', billing_mode: 'per_song', unit_price: 120000, quote_amount: 120000, quoted_hours: null, status: 'active' },
    { id: 'mirpeset-album', client_id: 'mirpeset', title: 'אלבום "בין השורות"', billing_mode: 'fixed', unit_price: 1400000, quote_amount: 1400000, quoted_hours: 70, status: 'done' },
  ]

  // ---- שעות עבודה ב-90 הימים האחרונים ----
  const plan: { client: string; project: string; kinds: string[]; from: number }[] = [
    { client: 'noa', project: 'noa-album', kinds: ['recording', 'recording', 'production', 'edit', 'mix'], from: -110 },
    { client: 'hatzer', project: 'hatzer-ep', kinds: ['recording', 'mix', 'mix', 'edit'], from: -95 },
    { client: 'erev', project: 'erev-weekly', kinds: ['recording', 'edit'], from: -90 },
    { client: 'dana', project: 'dana-kids', kinds: ['recording', 'recording', 'edit'], from: -65 },
    { client: 'choir', project: 'choir-hanuka', kinds: ['recording', 'recording', 'edit', 'mix'], from: -40 },
    { client: 'yuval', project: 'yuval-single', kinds: ['mix', 'master', 'edit'], from: -55 },
  ]
  const time: Row[] = []
  let n = 0
  for (let d = -90; d <= -1; d++) {
    if (dow(d) === 6) continue
    const friday = dow(d) === 5
    const sessions = friday ? (rand() < .3 ? 1 : 0) : rand() < .15 ? 0 : rand() < .55 ? 1 : 2
    let hour = friday ? 9 : pick([10, 11, 12])
    for (let s = 0; s < sessions; s++) {
      const opts = plan.filter(p => d >= p.from)
      const p = opts.length ? pick(opts) : null
      const private_ = !p || rand() < .08
      const kind = private_ ? 'production' : pick(p!.kinds)
      const mins = kind === 'recording' ? pick([120, 150, 180, 240]) : kind === 'master' ? pick([60, 90]) : pick([90, 120, 180])
      const start = at(d, hour, pick([0, 0, 15, 30]))
      const pause = mins >= 150 && rand() < .5 ? pick([10, 15, 20]) * 60 : 0
      time.push({
        id: `t${++n}`, client_id: private_ ? null : p!.client, project_id: private_ ? null : p!.project, kind,
        is_client_present: !private_ && kind === 'recording' ? 1 : 0,
        started_at: start, ended_at: new Date(Date.parse(start) + mins * 60000 + pause * 1000).toISOString(),
        paused_seconds: pause, source: rand() < .1 ? 'manual' : 'clock', charge_id: null,
        notes: private_ ? 'סשן פרטי: ביטים לספרייה' : null,
      })
      hour += Math.ceil(mins / 60) + 1
      if (hour > 19) break
    }
  }
  // עומר הגיע לפגישת היכרות
  time.push({ id: `t${++n}`, client_id: 'omer', project_id: null, kind: 'recording', is_client_present: 1, started_at: at(-3, 17), ended_at: at(-3, 18, 30), paused_seconds: 0, source: 'clock', charge_id: null, notes: 'דמו ראשון, קול וגיטרה' })
  // מרפסת: פרויקט שהסתיים לפני ההיסטוריה המוצגת
  for (let i = 0; i < 6; i++) {
    const s = at(-170 + i * 9, 11)
    time.push({ id: `t${++n}`, client_id: 'mirpeset', project_id: 'mirpeset-album', kind: ['recording', 'recording', 'mix', 'mix', 'master', 'edit'][i], is_client_present: i < 2 ? 1 : 0, started_at: s, ended_at: new Date(Date.parse(s) + 4 * 3600000).toISOString(), paused_seconds: 0, source: 'clock', charge_id: null, notes: null })
  }

  // ---- חיובים ותשלומים ----
  const charges: Row[] = []
  const payments: Row[] = []
  let cn = 0, pn = 0
  const charge = (client_id: string, project_id: string | null, description: string, amount: number, day: number) => {
    const id = `ch${++cn}`
    charges.push({ id, client_id, project_id, description, amount, charged_at: at(day, 20) })
    return id
  }
  const pay = (client_id: string, project_id: string | null, amount: number, method: string, day: number, notes: string | null = null) =>
    payments.push({ id: `pay${++pn}`, client_id, project_id, amount, method, paid_at: at(day, 14), notes })

  // פודקאסט: חיוב חודשי לפי שעות בפועל, השעות מסומנות כמחויבות
  for (const [from, to, payDay] of [[-90, -60, -55], [-60, -30, -24], [-30, -8, null]] as const) {
    const rows = time.filter(t => t.project_id === 'erev-weekly' && Date.parse(t.started_at as string) >= Date.parse(at(from, 0)) && Date.parse(t.started_at as string) < Date.parse(at(to, 0)))
    const secs = rows.reduce((s, t) => s + (Date.parse(t.ended_at as string) - Date.parse(t.started_at as string)) / 1000 - (t.paused_seconds as number), 0)
    if (!secs) continue
    const amount = Math.round(secs / 3600 * 18000 / 100) * 100
    const id = charge('erev', 'erev-weekly', `הקלטה ועריכה, ${(secs / 3600).toFixed(1)} שעות`, amount, to)
    rows.forEach(t => { t.charge_id = id })
    if (payDay != null) pay('erev', 'erev-weekly', amount, 'transfer', payDay)
  }
  // נועה: מחיר קבוע בשלבים
  charge('noa', 'noa-album', 'מקדמה לאלבום (30%)', 540000, -105); pay('noa', 'noa-album', 540000, 'transfer', -104)
  charge('noa', 'noa-album', 'שלב שני: סיום הקלטות (30%)', 540000, -35); pay('noa', 'noa-album', 300000, 'bit', -30, 'שאר הסכום בהמשך החודש'); pay('noa', 'noa-album', 120000, 'bit', -5)
  // להקת החצר: לפי שיר
  charge('hatzer', 'hatzer-ep', 'מיקס 2 שירים', 180000, -60); pay('hatzer', 'hatzer-ep', 180000, 'cash', -58)
  charge('hatzer', 'hatzer-ep', 'מיקס 2 שירים', 180000, -14); pay('hatzer', 'hatzer-ep', 90000, 'bit', -10)
  // דנה: לפי שעה, תעריף ברירת המחדל
  charge('dana', 'dana-kids', 'הקלטות, 8 שעות', 120000, -40); pay('dana', 'dana-kids', 120000, 'credit', -38)
  charge('dana', 'dana-kids', 'הקלטות ועריכה, 6 שעות', 90000, -9)
  // מקהלה: מקדמה
  charge('choir', 'choir-hanuka', 'מקדמה לאלבום חנוכה', 300000, -38); pay('choir', 'choir-hanuka', 300000, 'check', -36, "צ'ק מס' 1043")
  charge('choir', 'choir-hanuka', 'שלב שני: הקלטות', 250000, -12); pay('choir', 'choir-hanuka', 250000, 'transfer', -11)
  // יובל: סינגל שולם במלואו
  charge('yuval', 'yuval-single', 'מיקס ומאסטר לסינגל', 120000, -20); pay('yuval', 'yuval-single', 120000, 'bit', -20)
  // מרפסת: פרויקט סגור ומשולם
  charge('mirpeset', 'mirpeset-album', 'אלבום מלא', 1400000, -125); pay('mirpeset', 'mirpeset-album', 700000, 'transfer', -160); pay('mirpeset', 'mirpeset-album', 700000, 'transfer', -122)

  // ---- הוצאות ----
  const expenses: Row[] = []
  let en = 0
  const exp = (category: string, vendor: string, amount: number, day: number, notes: string | null = null) =>
    expenses.push({ id: `e${++en}`, category, vendor, amount, vat_amount: null, spent_at: at(day, 12), notes })
  for (const m of [-88, -58, -28]) {
    exp('rent', 'שכירות האולפן', 350000, m)
    exp('utilities', 'חשמל וארנונה', 62000 + Math.round(rand() * 20000 / 100) * 100, m + 3)
    exp('software', 'Avid Pro Tools', 15900, m + 5)
    exp('software', 'Splice', 4500, m + 7)
  }
  exp('equipment', 'מיקרופון Neumann TLM 103', 489000, -70, 'לחדר ההקלטות')
  exp('equipment', 'כבלי XLR ומעמדים', 38000, -33)
  exp('other', 'כיבוד ללקוחות', 12000, -12)
  exp('equipment', 'אוזניות מוניטור', 69000, -6)

  // ---- תורים ----
  const appts: Row[] = []
  let an = 0
  const appt = (client_id: string | null, project_id: string | null, title: string | null, kind: string, day: number, h: number, m: number, mins: number, status = 'scheduled', notes: string | null = null) => {
    if (day > 0 && dow(day) === 6) day += 1 // לא קובעים בשבת
    appts.push({ id: `a${++an}`, client_id, project_id, title, kind, starts_at: at(day, h, m), ends_at: new Date(Date.parse(at(day, h, m)) + mins * 60000).toISOString(), status, notes })
  }
  const nowH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(now))
  // היום: תור אחד אחרי השעה הנוכחית ועוד אחד בערב
  appt('noa', 'noa-album', 'הקלטת שירה: שיר 7', 'recording', 0, Math.min(Math.max(nowH + 1, 10), 20), 0, 180)
  appt('erev', 'erev-weekly', 'פרק 52', 'recording', 0, Math.min(Math.max(nowH + 4, 18), 22), 0, 90)
  appt('hatzer', 'hatzer-ep', 'מיקס שיר 5', 'mix', 1, 11, 0, 240)
  appt('omer', null, 'פגישה על הסינגל', 'recording', 2, 17, 30, 90, 'scheduled', 'להביא דוגמאות של אמנים שהוא אוהב')
  appt('choir', 'choir-hanuka', 'קבוצה ג׳: סופרן', 'recording', 3, 10, 0, 180)
  appt('dana', 'dana-kids', 'הקלטת גיטרות', 'recording', 6, 12, 0, 150)
  appt('erev', 'erev-weekly', 'פרק 53', 'recording', 7, 18, 0, 90)
  appt('yuval', null, 'סינגל שני: היכרות עם הביט', 'mix', 9, 14, 0, 120)
  appt('noa', 'noa-album', 'מיקס שירים 1-3', 'mix', 10, 10, 0, 300)
  appt('choir', 'choir-hanuka', 'קבוצה ד׳: בסים', 'recording', 12, 10, 0, 180)
  appt('hatzer', 'hatzer-ep', 'האזנה משותפת לכל ה-EP', 'master', 14, 16, 0, 120)
  appt('dana', 'dana-kids', 'נדחה לבקשת דנה', 'recording', 4, 12, 0, 120, 'cancelled')
  appt('noa', 'noa-album', 'הקלטת שירה: שיר 6', 'recording', -2, 10, 0, 180, 'done')

  const reminders: Row[] = [
    { id: 'r1', client_id: 'noa', text: 'לשלוח לנועה את הסקיצה של שיר 6', due_at: at(1, 9), done_at: null },
    { id: 'r2', client_id: 'hatzer', text: 'לגבות מהחצר את יתרת השירים', due_at: at(2, 10), done_at: null },
    { id: 'r3', client_id: 'dana', text: 'לשלוח לדנה חשבון על 6 השעות', due_at: at(0, 18), done_at: null },
    { id: 'r4', client_id: null, text: 'להזמין כבל XLR חדש לחדר', due_at: null, done_at: null },
    { id: 'r5', client_id: 'omer', text: 'להכין לעומר הצעת מחיר לסינגל', due_at: at(2, 12), done_at: null },
    { id: 'r6', client_id: 'erev', text: 'לגבות את חודש שעבר מהפודקאסט', due_at: null, done_at: at(-20, 12) },
  ]

  return { clients, projects, time, charges, payments, expenses, appts, reminders, at }
}

/** מוסיף את הקידומת לכל מזהה ולכל הפניה למזהה */
function prefixed(row: Row, keys: string[]): Row {
  const out: Row = { ...row }
  for (const k of keys) if (out[k] != null) out[k] = P + out[k]
  return out
}

function insert(db: D1Database, table: string, row: Row) {
  const cols = Object.keys(row)
  return db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map(c => row[c]))
}

// סדר המחיקה: קודם מה שמפנה לאחרים
const TABLES = ['time_entries', 'appointments', 'reminders', 'payments', 'charges', 'expenses', 'projects', 'clients'] as const

export const demo = new Hono<AppEnv>()

demo.get('/', async c => {
  const row = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM clients WHERE id LIKE '${P}%'`)
  return c.json({ loaded: (row?.n ?? 0) > 0 })
})

demo.post('/', async c => {
  const db = c.env.DB
  if ((await first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM clients WHERE id LIKE '${P}%'`))!.n) fail(409, 'נתוני ההדגמה כבר טעונים')
  const d = build()
  const stmts: D1PreparedStatement[] = []
  for (const cl of d.clients) {
    const { days, archived, ...r } = cl
    stmts.push(insert(db, 'clients', prefixed({ ...r, created_at: d.at(-(days as number), 12), archived_at: archived ? d.at(-110, 12) : null }, ['id'])))
  }
  for (const r of d.projects) stmts.push(insert(db, 'projects', prefixed({ ...r, created_at: d.at(-100, 12) }, ['id', 'client_id'])))
  for (const r of d.charges) stmts.push(insert(db, 'charges', prefixed(r, ['id', 'client_id', 'project_id'])))
  for (const r of d.time) stmts.push(insert(db, 'time_entries', prefixed(r, ['id', 'client_id', 'project_id', 'charge_id'])))
  for (const r of d.payments) stmts.push(insert(db, 'payments', prefixed(r, ['id', 'client_id', 'project_id'])))
  for (const r of d.expenses) stmts.push(insert(db, 'expenses', prefixed(r, ['id'])))
  for (const r of d.appts) stmts.push(insert(db, 'appointments', prefixed(r, ['id', 'client_id', 'project_id'])))
  for (const r of d.reminders) stmts.push(insert(db, 'reminders', prefixed(r, ['id', 'client_id'])))
  await db.batch(stmts)
  return c.json({ loaded: true, clients: d.clients.length, sessions: d.time.length })
})

demo.delete('/', async c => {
  const db = c.env.DB
  await db.batch(TABLES.map(t => db.prepare(`DELETE FROM ${t} WHERE id LIKE '${P}%'`)))
  return c.json({ loaded: false })
})

