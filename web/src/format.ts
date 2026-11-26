import { TZ, tzOffsetMinutes } from '../../shared/time'

/** אגורות → "₪1,250" (בלי אגורות אם עגול) */
export function money(agorot: number | null | undefined): string {
  const v = (agorot ?? 0) / 100
  return '₪' + v.toLocaleString('he-IL', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })
}
/** קלט של שקלים (טקסט) → אגורות. null אם ריק */
export function toAgorot(s: string): number | null {
  const t = s.replace(/[₪,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}
export const fromAgorot = (a: number | null | undefined) => (a == null ? '' : String(a / 100))

export function clock(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return [h, m, x].map(n => String(n).padStart(2, '0')).join(':')
}
/** 5400 → "1.5 ש׳" */
export function hours(s: number): string {
  const h = s / 3600
  return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10).toLocaleString('he-IL') + ' ש׳'
}
export function spoken(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  if (!h && !m) return `${s} שניות`
  return [h ? `${h} שעות` : '', m ? `${m} דק׳` : ''].filter(Boolean).join(' ו־')
}

const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, ...o })
const fTime = f({ hour: '2-digit', minute: '2-digit', hour12: false })
const fDay = f({ day: 'numeric', month: 'numeric' })
const fDayLong = f({ weekday: 'long', day: 'numeric', month: 'long' })
const fWeekday = f({ weekday: 'short' })
const fFull = f({ day: 'numeric', month: 'numeric', year: '2-digit' })

export const time = (iso: string) => fTime.format(new Date(iso))
export const day = (iso: string) => fDay.format(new Date(iso))
export const dayLong = (d: Date | string) => fDayLong.format(new Date(d))
export const weekday = (d: Date | string) => fWeekday.format(new Date(d))
export const date = (iso: string) => fFull.format(new Date(iso))

/** "היום 16:00" / "מחר 10:00" / "שלישי 12:00" / "3.12 18:00" */
export function when(iso: string | null): string {
  if (!iso) return 'אין תור'
  const d = new Date(iso)
  const ymd = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(x)
  const today = ymd(new Date()), tomorrow = ymd(new Date(Date.now() + 864e5)), dd = ymd(d)
  if (dd === today) return `היום ${time(iso)}`
  if (dd === tomorrow) return `מחר ${time(iso)}`
  if (d.getTime() - Date.now() < 6 * 864e5) return `${f({ weekday: 'long' }).format(d)} ${time(iso)}`
  return `${day(iso)} ${time(iso)}`
}

/** ערך ל-<input type="datetime-local"> בשעון ישראל */
export function toLocalInput(iso: string | Date): string {
  const d = new Date(iso)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}
/** ערך מ-<input type="datetime-local"> (שעון ישראל) → ISO ב-UTC */
export function fromLocalInput(v: string): string {
  const [d, t] = v.split('T')
  const [y, m, dd] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, dd, hh, mm)
  // מחשבים את ההפרש של ישראל באותו רגע (פעמיים, בגלל מעבר שעון)
  const o1 = tzOffsetMinutes(new Date(guess - 120 * 60000))
  const o2 = tzOffsetMinutes(new Date(guess - o1 * 60000))
  return new Date(guess - o2 * 60000).toISOString()
}
