// לוח עברי וחגי ישראל, בלי ספריות: התאריך העברי מגיע מ-Intl (מובנה בכל דפדפן),
// והחגים מחושבים לפי הכללים של לוח ארץ ישראל, כולל דחיות של צומות וימי זיכרון.

export type HolidayKind = 'yomtov' | 'erev' | 'chol' | 'fast' | 'minor' | 'modern' | 'rc'
export interface Holiday { name: string; kind: HolidayKind }
export interface HebDay { day: number; month: string; year: number; label: string; full: string; holidays: Holiday[] }

const MONTHS: Record<string, string> = {
  Tishri: 'תשרי', Heshvan: 'חשוון', Kislev: 'כסלו', Tevet: 'טבת', Shevat: 'שבט', Adar: 'אדר', 'Adar I': 'אדר א׳', 'Adar II': 'אדר ב׳',
  Nisan: 'ניסן', Iyar: 'אייר', Sivan: 'סיוון', Tamuz: 'תמוז', Av: 'אב', Elul: 'אלול',
}

/** מספר → אותיות: 16 → ט״ז, 5787 → תשפ״ז */
export function gematria(n: number): string {
  n = n % 1000
  const H = ['', 'ק', 'ר', 'ש', 'ת'], T = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], U = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
  let s = ''
  let h = Math.floor(n / 100)
  while (h > 4) { s += 'ת'; h -= 4 }
  s += H[h]
  const r = n % 100
  if (r === 15) s += 'טו'
  else if (r === 16) s += 'טז'
  else s += T[Math.floor(r / 10)] + U[r % 10]
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1)
}

const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const at = (ymd: string) => new Date(`${ymd}T12:00:00Z`)
const shift = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

function raw(ymd: string) {
  const p = Object.fromEntries(fmt.formatToParts(at(ymd)).map(x => [x.type, x.value]))
  return { day: Number(p.day), month: String(p.month), year: Number(p.year), dow: at(ymd).getUTCDay() }
}

/** החגים של יום אחד. dow: 0 ראשון ... 6 שבת */
function holidaysOf(ymd: string): Holiday[] {
  const { day: d, month: m, dow } = raw(ymd)
  const out: Holiday[] = []
  const add = (name: string, kind: HolidayKind) => out.push({ name, kind })
  const adar = m === 'Adar' || m === 'Adar II'

  if (m === 'Tishri') {
    if (d === 1 || d === 2) add(`ראש השנה${d === 2 ? ' (יום ב׳)' : ''}`, 'yomtov')
    if ((d === 3 && dow !== 6) || (d === 4 && dow === 0)) add('צום גדליה', 'fast')
    if (d === 9) add('ערב יום כיפור', 'erev')
    if (d === 10) add('יום כיפור', 'yomtov')
    if (d === 14) add('ערב סוכות', 'erev')
    if (d === 15) add('סוכות', 'yomtov')
    if (d >= 16 && d <= 20) add('חול המועד סוכות', 'chol')
    if (d === 21) add('הושענא רבה', 'chol')
    if (d === 22) add('שמחת תורה', 'yomtov')
  }
  if (m === 'Heshvan' && d === 12) add('יום הזיכרון ליצחק רבין', 'modern')
  if (m === 'Kislev' && d === 24) add('ערב חנוכה: נר ראשון', 'minor')
  if (m === 'Tevet' && d === 10) add('צום עשרה בטבת', 'fast')
  if (m === 'Shevat' && d === 15) add('ט״ו בשבט', 'minor')
  if (m === 'Adar I' && d === 14) add('פורים קטן', 'minor')
  if (adar) {
    if ((d === 13 && dow !== 6) || (d === 11 && dow === 4)) add('תענית אסתר', 'fast')
    if (d === 14) add('פורים', 'minor')
    if (d === 15) add('שושן פורים', 'minor')
  }
  if (m === 'Nisan') {
    if (d === 14) add('ערב פסח', 'erev')
    if (d === 15) add('פסח', 'yomtov')
    if (d >= 16 && d <= 20) add('חול המועד פסח', 'chol')
    if (d === 21) add('שביעי של פסח', 'yomtov')
    if ((d === 27 && dow !== 5 && dow !== 0) || (d === 26 && dow === 4) || (d === 28 && dow === 1)) add('יום השואה', 'modern')
  }
  if (m === 'Iyar') {
    if (isAtzmaut(d, dow)) add('יום העצמאות', 'modern')
    else {
      const next = raw(shift(ymd, 1))
      if (next.month === 'Iyar' && isAtzmaut(next.day, next.dow)) add('יום הזיכרון', 'modern')
    }
    if (d === 18) add('ל״ג בעומר', 'minor')
    if (d === 28) add('יום ירושלים', 'modern')
  }
  if (m === 'Sivan') {
    if (d === 5) add('ערב שבועות', 'erev')
    if (d === 6) add('שבועות', 'yomtov')
  }
  if (m === 'Tamuz' && ((d === 17 && dow !== 6) || (d === 18 && dow === 0))) add('צום י״ז בתמוז', 'fast')
  if (m === 'Av') {
    if ((d === 9 && dow !== 6) || (d === 10 && dow === 0)) add('תשעה באב', 'fast')
    if (d === 15) add('ט״ו באב', 'minor')
  }
  if (m === 'Elul' && d === 29) add('ערב ראש השנה', 'erev')

  // חנוכה: שמונה ימים מכ״ה בכסלו (חוצה לטבת, ואורך כסלו משתנה)
  for (let k = 0; k < 8; k++) {
    const b = raw(shift(ymd, -k))
    if (b.month === 'Kislev' && b.day === 25) { add(`חנוכה ${gematria(k + 1)}`, 'minor'); break }
  }
  // ראש חודש: א׳ בחודש (חוץ מתשרי), ול׳ בחודש הקודם
  if (d === 1 && m !== 'Tishri') add(`ראש חודש ${MONTHS[m] ?? m}`, 'rc')
  if (d === 30) { const n = raw(shift(ymd, 1)); add(`ראש חודש ${MONTHS[n.month] ?? n.month}`, 'rc') }
  return out
}

/** יום העצמאות: ה׳ באייר, מוקדם לחמישי אם נופל בשישי/שבת, נדחה לשלישי אם נופל בשני */
function isAtzmaut(d: number, dow: number) {
  return (d === 5 && dow === 3) || ((d === 3 || d === 4) && dow === 4) || (d === 6 && dow === 2)
}

const cache = new Map<string, HebDay>()
/** הכול על יום אחד בלוח העברי. ymd = YYYY-MM-DD */
export function hebDay(ymd: string): HebDay {
  const hit = cache.get(ymd)
  if (hit) return hit
  const r = raw(ymd)
  const month = MONTHS[r.month] ?? r.month
  const v: HebDay = {
    day: r.day, month, year: r.year,
    label: `${gematria(r.day)} ${month}`,
    full: `${gematria(r.day)} ב${month} ${gematria(r.year)}`,
    holidays: holidaysOf(ymd),
  }
  cache.set(ymd, v)
  return v
}

/** "כסלו–טבת תשפ״ז" לכותרת של טווח ימים */
export function hebRange(fromYmd: string, toYmd: string): string {
  const a = hebDay(fromYmd), b = hebDay(toYmd)
  if (a.month === b.month && a.year === b.year) return `${a.month} ${gematria(a.year)}`
  if (a.year === b.year) return `${a.month}–${b.month} ${gematria(a.year)}`
  return `${a.month} ${gematria(a.year)}–${b.month} ${gematria(b.year)}`
}
