// הדשבורד של חדר הבקרה והדוח החודשי
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { all, first, nowIso, fail } from '../lib/db'
import { SECONDS_SQL } from './clients'
import { israelDayRange, israelMonthRange, israelDate } from '../../shared/time'
import type { Appointment, Dashboard, MonthReport, Reminder } from '../../shared/types'

const APPT_SQL = `SELECT a.*, c.name AS client_name, c.color_a FROM appointments a LEFT JOIN clients c ON c.id = a.client_id`

export const overview = new Hono<AppEnv>()

overview.get('/dashboard', async c => {
  const db = c.env.DB
  const [d0, d1] = israelDayRange()
  const [m0, m1] = israelMonthRange()
  const [today, reminders, income, expenses, hours, open, next] = await Promise.all([
    all<Appointment>(db, `${APPT_SQL} WHERE a.starts_at >= ? AND a.starts_at < ? AND a.status != 'cancelled' ORDER BY a.starts_at`, d0, d1),
    all<Reminder>(db, `SELECT r.*, c.name AS client_name FROM reminders r LEFT JOIN clients c ON c.id = r.client_id
                       WHERE r.done_at IS NULL ORDER BY r.due_at IS NULL, r.due_at, r.created_at LIMIT 8`),
    first<{ v: number }>(db, `SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE paid_at >= ? AND paid_at < ?`, m0, m1),
    first<{ v: number }>(db, `SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE spent_at >= ? AND spent_at < ?`, m0, m1),
    first<{ v: number }>(db, `SELECT COALESCE(SUM(${SECONDS_SQL}),0) AS v FROM time_entries WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at < ?`, m0, m1),
    // סך היתרות הפתוחות של כל הלקוחות שחייבים (לא מקזזים יתרות זכות)
    first<{ v: number }>(db, `SELECT COALESCE(SUM(b),0) AS v FROM (
        SELECT (SELECT COALESCE(SUM(amount),0) FROM charges WHERE client_id = c.id)
             - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id = c.id) AS b
        FROM clients c) WHERE b > 0`),
    first<Appointment>(db, `${APPT_SQL} WHERE a.starts_at >= ? AND a.status = 'scheduled' ORDER BY a.starts_at LIMIT 1`, nowIso()),
  ])
  const body: Dashboard = {
    today, reminders,
    month: { income: income?.v ?? 0, expenses: expenses?.v ?? 0, open_balance: open?.v ?? 0, seconds: hours?.v ?? 0 },
    next_up: next,
  }
  return c.json(body)
})

overview.get('/reports/month', async c => {
  const month = c.req.query('m') ?? israelDate().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) fail(400, 'חודש לא תקין')
  const [m0, m1] = israelMonthRange(month)
  const db = c.env.DB
  const [byMethod, byKind, byClient, byCat] = await Promise.all([
    all<{ method: string; amount: number }>(db, `SELECT method, SUM(amount) AS amount FROM payments WHERE paid_at >= ? AND paid_at < ? GROUP BY method ORDER BY amount DESC`, m0, m1),
    all<{ kind: string; seconds: number }>(db, `SELECT kind, SUM(${SECONDS_SQL}) AS seconds FROM time_entries WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at < ? GROUP BY kind ORDER BY seconds DESC`, m0, m1),
    all<{ client_id: string; name: string; income: number; seconds: number }>(db, `
      SELECT c.id AS client_id, c.name,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id = c.id AND paid_at >= ?1 AND paid_at < ?2) AS income,
        (SELECT COALESCE(SUM(${SECONDS_SQL}),0) FROM time_entries WHERE client_id = c.id AND ended_at IS NOT NULL AND started_at >= ?1 AND started_at < ?2) AS seconds
      FROM clients c WHERE income > 0 OR seconds > 0 ORDER BY income DESC, seconds DESC`, m0, m1),
    all<{ category: string; amount: number }>(db, `SELECT category, SUM(amount) AS amount FROM expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY category ORDER BY amount DESC`, m0, m1),
  ])
  const income = byMethod.reduce((s, r) => s + r.amount, 0)
  const expenses = byCat.reduce((s, r) => s + r.amount, 0)
  return c.json({
    month, income, expenses, profit: income - expenses,
    by_method: byMethod, by_kind: byKind, by_client: byClient, by_category: byCat,
  } as MonthReport)
})
