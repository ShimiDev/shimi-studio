// כל הזמנים נשמרים ב-UTC. כאן מחשבים "היום" ו"החודש" לפי שעון ישראל,
// כולל מעבר שעון קיץ/חורף, בלי ספריות.
export const TZ = 'Asia/Jerusalem'

/** ההפרש בדקות בין שעון ישראל ל-UTC ברגע נתון (120 או 180) */
export function tzOffsetMinutes(at: Date): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+02:00'
  const m = s.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  if (!m) return 120
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

/** התאריך בישראל כ-YYYY-MM-DD */
export function israelDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at)
}

/** רגע ה-UTC של חצות בישראל בתאריך נתון */
export function israelMidnightUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const guess = new Date(Date.UTC(y, m - 1, d))
  // מחשבים את ההפרש פעמיים כי חצות יכולה ליפול בצד השני של מעבר שעון
  const off1 = tzOffsetMinutes(new Date(guess.getTime() - 120 * 60000))
  const t = guess.getTime() - off1 * 60000
  const off2 = tzOffsetMinutes(new Date(t))
  return new Date(guess.getTime() - off2 * 60000)
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** טווח UTC של יום בישראל: [התחלה, סוף) */
export function israelDayRange(ymd: string = israelDate()): [string, string] {
  return [israelMidnightUtc(ymd).toISOString(), israelMidnightUtc(addDays(ymd, 1)).toISOString()]
}

/** טווח UTC של חודש בישראל. month = YYYY-MM */
export function israelMonthRange(month: string = israelDate().slice(0, 7)): [string, string] {
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return [israelMidnightUtc(`${month}-01`).toISOString(), israelMidnightUtc(`${next}-01`).toISOString()]
}

/** שניות עבודה נטו של סשן (בלי השהיות). עובד גם על שעון שרץ עכשיו */
export function entrySeconds(e: { started_at: string; ended_at: string | null; paused_at: string | null; paused_seconds: number }, now = Date.now()): number {
  const end = e.ended_at ? Date.parse(e.ended_at) : now
  const pausedNow = e.paused_at && !e.ended_at ? (now - Date.parse(e.paused_at)) / 1000 : 0
  return Math.max(0, Math.floor((end - Date.parse(e.started_at)) / 1000 - e.paused_seconds - pausedNow))
}
