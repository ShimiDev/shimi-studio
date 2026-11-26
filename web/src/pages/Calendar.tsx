// יומן: יום / שבוע / חודש, עם לוח עברי וחגים.
// גוררים על שטח ריק כדי לקבוע תור, גוררים תור כדי להזיז, ומושכים את התחתית כדי לשנות משך.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { api } from '../api'
import { useStore, useData } from '../store'
import { time } from '../format'
import { AppointmentForm } from '../components/Forms'
import { israelDate, addDays, israelMidnightUtc } from '../../../shared/time'
import { hebDay, hebRange, gematria, type Holiday } from '../../../shared/hebrew'
import { workKind, type Appointment } from '../../../shared/types'

type View = 'day' | 'week' | 'month'
const HOUR = 48            // גובה שעה בפיקסלים
const SNAP = 15            // הצמדה לרבעי שעה
const DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const dowOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
const weekStart = (ymd: string) => addDays(ymd, -dowOf(ymd))
const monthStart = (ymd: string) => ymd.slice(0, 8) + '01'
const gDay = (ymd: string) => Number(ymd.slice(8))
const fMonth = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fMonthShort = new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' })
const noon = (ymd: string) => new Date(`${ymd}T12:00:00Z`)
/** דקות מחצות (שעון ישראל) של היום ymd */
const minOf = (iso: string, ymd: string) => (Date.parse(iso) - israelMidnightUtc(ymd).getTime()) / 60000
const isoAt = (ymd: string, min: number) => new Date(israelMidnightUtc(ymd).getTime() + min * 60000).toISOString()
const snap = (m: number) => Math.round(m / SNAP) * SNAP
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function readView(): View {
  try { const v = localStorage.getItem('cal-view'); if (v === 'day' || v === 'week' || v === 'month') return v } catch { /* */ }
  return window.innerWidth < 720 ? 'day' : 'week'
}

export function CalendarPage() {
  const { go, toast, fail, bump, inRoom } = useStore()
  const today = israelDate()
  const [view, setView] = useState<View>(readView)
  const [anchor, setAnchor] = useState(today)
  const [edit, setEdit] = useState<{ appt?: Appointment; start?: Date; end?: Date } | null>(null)

  useEffect(() => { try { localStorage.setItem('cal-view', view) } catch { /* */ } }, [view])

  // הטווח המוצג
  const [first, count] = useMemo((): [string, number] => {
    if (view === 'day') return [anchor, 1]
    if (view === 'week') return [weekStart(anchor), 7]
    return [weekStart(monthStart(anchor)), 42]
  }, [view, anchor])
  const days = useMemo(() => Array.from({ length: count }, (_, i) => addDays(first, i)), [first, count])
  const from = israelMidnightUtc(first).toISOString(), to = israelMidnightUtc(addDays(first, count)).toISOString()
  const { data, setData, reload } = useData<Appointment[]>(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  const items = data ?? []

  const step = (dir: 1 | -1) => {
    if (view === 'day') setAnchor(addDays(anchor, dir))
    else if (view === 'week') setAnchor(addDays(anchor, 7 * dir))
    else { const [y, m] = anchor.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); setAnchor(d.toISOString().slice(0, 10)) }
  }
  const openDay = (ymd: string) => { setAnchor(ymd); setView('day') }

  // קיצורי מקלדת, כמו ביומן גוגל
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (edit || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      const k = e.key.toLowerCase()
      if (k === 'd' || k === 'י') setView('day')
      else if (k === 'w' || k === '\'') setView('week')
      else if (k === 'm' || k === 'צ') setView('month')
      else if (k === 't' || k === 'א') setAnchor(today)
      else if (k === 'n' || k === 'מ') setEdit({})
      else if (e.key === 'ArrowLeft') step(1)
      else if (e.key === 'ArrowRight') step(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** הזזה/שינוי משך: מעדכנים מיד על המסך, ושומרים ברקע */
  const move = async (a: Appointment, starts_at: string, ends_at: string) => {
    if (starts_at === a.starts_at && ends_at === a.ends_at) return
    setData(items.map(x => x.id === a.id ? { ...x, starts_at, ends_at } : x))
    try {
      await api.patch(`/appointments/${a.id}`, { starts_at, ends_at })
      let sent = ''
      // ללקוח כבר נשלח זימון? שואלים אם לעדכן אותו, כמו ביומן גוגל
      if (a.invite_sent_at && a.status === 'scheduled' && confirm(`לשלוח ל${a.client_name ?? 'לקוח'} עדכון במייל על המועד החדש?`)) {
        try { const r = await api.post<{ to: string }>(`/appointments/${a.id}/send`, { kind: 'update' }); sent = ` ונשלח עדכון ל-${r.to}` }
        catch (e) { fail(e) }
      }
      toast(`${a.client_name ?? a.title ?? 'התור'} הועבר ל${DOW[dowOf(israelDate(new Date(starts_at)))]} ${time(starts_at)}${sent}`)
      bump()
    } catch (e) { fail(e); reload() }
  }

  // כותרת: חודש לועזי + חודש עברי
  const last = days[days.length - 1]
  const midMonth = view === 'month' ? monthStart(anchor) : first
  const gTitle = view === 'month' ? fMonth.format(noon(midMonth))
    : first.slice(0, 7) === last.slice(0, 7) ? fMonth.format(noon(first))
      : `${fMonthShort.format(noon(first))}–${fMonth.format(noon(last))}`
  const hTitle = view === 'month' ? hebRange(monthStart(anchor), addDays(monthStart(addDays(monthStart(anchor), 32)), -1)) : hebRange(first, last)
  const isNow = view === 'month' ? monthStart(anchor) === monthStart(today) : days.includes(today)

  return (
    <div className="cal">
      <div className="cal-bar">
        <div className="cal-title">
          <h1>{view === 'day' ? `${DOW[dowOf(anchor)]}, ${gDay(anchor)} ${fMonth.format(noon(anchor))}` : gTitle}</h1>
          <span className="heb">{view === 'day' ? hebDay(anchor).full : hTitle}</span>
        </div>
        <div className="row">
          <button className="btn small" type="button" disabled={isNow} onClick={() => setAnchor(today)} title="קיצור: T">היום</button>
          <div className="cal-nav">
            <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="הקודם">›</button>
            <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="הבא">‹</button>
          </div>
        </div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="תצוגה">
          {([['day', 'יום', 'D'], ['week', 'שבוע', 'W'], ['month', 'חודש', 'M']] as const).map(([v, l, k]) =>
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} title={`קיצור: ${k}`}>{l}</button>)}
        </div>
        <button className="btn primary" type="button" onClick={() => setEdit({})}>+ תור חדש</button>
      </div>

      {view === 'month'
        ? <MonthGrid days={days} month={anchor.slice(0, 7)} today={today} items={items}
            onOpen={a => setEdit({ appt: a })} onDay={openDay}
            onCreate={ymd => setEdit({ start: new Date(isoAt(ymd, 10 * 60)), end: new Date(isoAt(ymd, 12 * 60)) })}
            onMove={(a, ymd) => { const dm = minOf(a.starts_at, israelDate(new Date(a.starts_at))); const len = Date.parse(a.ends_at) - Date.parse(a.starts_at); const s = isoAt(ymd, dm); move(a, s, new Date(Date.parse(s) + len).toISOString()) }} />
        : <TimeGrid days={days} today={today} items={items} onDay={openDay} single={view === 'day'}
            onOpen={a => setEdit({ appt: a })}
            onCreate={(s, e) => setEdit({ start: new Date(s), end: new Date(e) })}
            onMove={move} />}

      {edit && <AppointmentForm appt={edit.appt} start={edit.start} end={edit.end} onClose={() => setEdit(null)} />}
      {edit?.appt?.client_id && (
        <div style={{ position: 'fixed', bottom: 20, insetInlineEnd: 20, zIndex: 55 }}>
          <div className="row">
            <button className="btn" style={{ background: 'var(--panel)' }} type="button" onClick={() => { const id = edit.appt!.client_id!; setEdit(null); go({ page: 'client', clientId: id }) }}>כרטיס {edit.appt.client_name}</button>
            {inRoom && inRoom !== edit.appt.client_id
              ? <button className="btn primary" type="button" disabled title="יש כבר לקוח בחדר. קודם מסיימים את הסשן שלו">החדר תפוס</button>
              : <button className="btn primary" type="button" onClick={() => { const id = edit.appt!.client_id!; setEdit(null); go({ page: 'control', clientId: id }) }}>לחדר עם {edit.appt.client_name} ←</button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------- חגים ----------------
function HolidayChips({ list, max = 3 }: { list: Holiday[]; max?: number }) {
  if (!list.length) return null
  return <>{list.slice(0, max).map(h => <span key={h.name} className={`hol hol-${h.kind}`} title={h.name}>{h.name}</span>)}</>
}
const closedDay = (ymd: string) => dowOf(ymd) === 6 || hebDay(ymd).holidays.some(h => h.kind === 'yomtov')

// ---------------- יום / שבוע ----------------
type Drag =
  | { mode: 'create'; col: number; a: number; b: number; moved: boolean }
  | { mode: 'move' | 'resize'; appt: Appointment; col: number; start: number; end: number; grab: number; x0: number; y0: number; moved: boolean }

interface GridProps {
  days: string[]; today: string; items: Appointment[]; single: boolean
  onOpen(a: Appointment): void; onCreate(s: string, e: string): void; onMove(a: Appointment, s: string, e: string): void; onDay(ymd: string): void
}

function TimeGrid({ days, today, items, single, onOpen, onCreate, onMove, onDay }: GridProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const cols = useRef<(HTMLDivElement | null)[]>([])
  const [drag, setDrag] = useState<Drag | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  // פותחים את היום ב-8 בבוקר (או שעה לפני התור הראשון)
  useEffect(() => {
    const el = scroller.current; if (!el) return
    const firstMin = Math.min(8 * 60, ...items.filter(a => days.includes(israelDate(new Date(a.starts_at)))).map(a => minOf(a.starts_at, israelDate(new Date(a.starts_at))) - 60))
    el.scrollTop = Math.max(0, firstMin) / 60 * HOUR
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], days.length])

  const at = (x: number, y: number) => {
    let col = cols.current.findIndex(c => { if (!c) return false; const r = c.getBoundingClientRect(); return x >= r.left && x < r.right })
    if (col < 0) col = drag?.col ?? 0
    const r = cols.current[col]!.getBoundingClientRect()
    return { col, min: clamp((y - r.top) / HOUR * 60, 0, 24 * 60) }
  }

  const down = (e: RPointerEvent, appt?: Appointment, resize = false) => {
    if (e.button !== 0) return
    const p = at(e.clientX, e.clientY)
    if (appt) {
      e.stopPropagation()
      const ymd = israelDate(new Date(appt.starts_at))
      const s = minOf(appt.starts_at, ymd), en = minOf(appt.ends_at, ymd)
      setDrag({ mode: resize ? 'resize' : 'move', appt, col: days.indexOf(ymd), start: s, end: en, grab: p.min - s, x0: e.clientX, y0: e.clientY, moved: false })
    } else {
      const m = Math.floor(p.min / SNAP) * SNAP
      setDrag({ mode: 'create', col: p.col, a: m, b: m + SNAP, moved: false })
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const moveP = (e: RPointerEvent) => {
    if (!drag) return
    const p = at(e.clientX, e.clientY)
    if (drag.mode === 'create') {
      const m = snap(p.min)
      setDrag({ ...drag, b: m <= drag.a ? drag.a + SNAP : m, moved: drag.moved || m > drag.a + SNAP })
    } else {
      const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5
      if (!moved) return
      const len = drag.end - drag.start
      if (drag.mode === 'resize') {
        const e2 = Math.max(drag.start + SNAP, snap(p.min))
        setDrag({ ...drag, end: e2, moved })
      } else {
        const s = clamp(snap(p.min - drag.grab), 0, 24 * 60 - SNAP)
        setDrag({ ...drag, col: p.col, start: s, end: s + len, moved })
      }
    }
  }
  const up = () => {
    if (!drag) return
    const d = drag; setDrag(null)
    if (d.mode === 'create') {
      const ymd = days[d.col]
      const b = d.moved ? d.b : d.a + 60
      onCreate(isoAt(ymd, d.a), isoAt(ymd, b))
    } else if (!d.moved) onOpen(d.appt)
    else onMove(d.appt, isoAt(days[d.col], d.start), isoAt(days[d.col], d.end))
  }

  const hours = Array.from({ length: 24 }, (_, h) => h)
  const nowMin = minOf(new Date(now).toISOString(), today)

  return (
    <div className={`tg${single ? ' single' : ''}`} style={{ ['--n' as string]: days.length, ['--hour' as string]: `${HOUR}px` }}>
      <div className="tg-head">
        <div className="tg-gutter" />
        {days.map(ymd => {
          const h = hebDay(ymd)
          return (
            <div key={ymd} className={`tg-dh${ymd === today ? ' is-today' : ''}${closedDay(ymd) ? ' closed' : ''}`}>
              <button type="button" className="tg-date" onClick={() => onDay(ymd)} aria-label={`פתיחת יום ${gDay(ymd)}`}>
                <span className="dow">{DOW[dowOf(ymd)]}</span>
                <b className="num">{gDay(ymd)}</b>
                <span className="hd">{h.label}</span>
              </button>
              <div className="tg-allday"><HolidayChips list={h.holidays} max={single ? 6 : 2} /></div>
            </div>
          )
        })}
      </div>
      <div className="tg-body" ref={scroller} onPointerMove={moveP} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
        <div className="tg-gutter">
          {hours.map(h => <div key={h} className="tg-hour"><span>{h ? `${String(h).padStart(2, '0')}:00` : ''}</span></div>)}
        </div>
        {days.map((ymd, i) => {
          const list = layout(items.filter(a => israelDate(new Date(a.starts_at)) === ymd), ymd)
          return (
            <div key={ymd} ref={el => { cols.current[i] = el }} className={`tg-col${closedDay(ymd) ? ' closed' : ''}`} onPointerDown={e => down(e)}>
              {hours.map(h => <div key={h} className="tg-line" />)}
              {ymd === today && <div className="tg-now" style={{ top: nowMin / 60 * HOUR }} />}
              {list.map(({ a, s, e, c, n }) => {
                const dragging = drag && drag.mode !== 'create' && drag.appt.id === a.id && drag.moved
                return (
                  <div key={a.id} role="button" tabIndex={0}
                    className={`ev${a.status === 'cancelled' ? ' cancelled' : ''}${a.status === 'done' ? ' done' : ''}${dragging ? ' ghosted' : ''}`}
                    style={{ ['--c' as string]: a.color_a ?? 'var(--gold)', top: s / 60 * HOUR, height: Math.max(18, (e - s) / 60 * HOUR - 2), insetInlineStart: `calc(${c / n * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
                    onPointerDown={ev => down(ev, a)}
                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(a) } }}>
                    <EvBody a={a} s={a.starts_at} e={a.ends_at} short={(e - s) < 50} />
                    {a.status !== 'cancelled' && <span className="ev-resize" onPointerDown={ev => down(ev, a, true)} aria-hidden="true" />}
                  </div>
                )
              })}
              {drag && drag.col === i && drag.mode === 'create' && (
                <div className="ev ghost" style={{ top: drag.a / 60 * HOUR, height: (drag.b - drag.a) / 60 * HOUR - 2, insetInlineStart: 2, width: 'calc(100% - 4px)' }}>
                  <time>{fmtMin(drag.a)}–{fmtMin(drag.moved ? drag.b : drag.a + 60)}</time> תור חדש
                </div>
              )}
              {drag && drag.col === i && drag.mode !== 'create' && drag.moved && (
                <div className="ev dragging" style={{ ['--c' as string]: drag.appt.color_a ?? 'var(--gold)', top: drag.start / 60 * HOUR, height: (drag.end - drag.start) / 60 * HOUR - 2, insetInlineStart: 2, width: 'calc(100% - 4px)' }}>
                  <EvBody a={drag.appt} s={isoAt(ymd, drag.start)} e={isoAt(ymd, drag.end)} short={drag.end - drag.start < 50} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const fmtMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function EvBody({ a, s, e, short }: { a: Appointment; s: string; e: string; short: boolean }) {
  const who = a.client_name ?? a.title ?? 'תור'
  const sub = [a.client_name ? a.title : null, workKind(a.kind as never)?.label].filter(Boolean).join(' · ')
  return short
    ? <span className="ev-line"><b>{who}</b> <time>{time(s)}</time></span>
    : <><b>{who}</b><time>{time(s)}–{time(e)}</time>{sub && <span className="ev-sub">{sub}</span>}</>
}

/** פריסת תורים חופפים בעמודות, כמו ביומן גוגל */
function layout(list: Appointment[], ymd: string) {
  const ev = list.map(a => ({ a, s: clamp(minOf(a.starts_at, ymd), 0, 24 * 60), e: clamp(minOf(a.ends_at, ymd), 0, 24 * 60), c: 0, n: 1 }))
    .sort((x, y) => x.s - y.s || y.e - x.e)
  let group: typeof ev = [], groupEnd = -1
  const flush = () => { const n = Math.max(1, ...group.map(g => g.c + 1)); group.forEach(g => { g.n = n }); group = [] }
  for (const x of ev) {
    if (x.s >= groupEnd) { flush(); groupEnd = -1 }
    const used = new Set(group.filter(g => g.e > x.s).map(g => g.c))
    let c = 0; while (used.has(c)) c++
    x.c = c; group.push(x); groupEnd = Math.max(groupEnd, x.e)
  }
  flush()
  return ev
}

// ---------------- חודש ----------------
function MonthGrid({ days, month, today, items, onOpen, onDay, onCreate, onMove }: {
  days: string[]; month: string; today: string; items: Appointment[]
  onOpen(a: Appointment): void; onDay(ymd: string): void; onCreate(ymd: string): void; onMove(a: Appointment, ymd: string): void
}) {
  const [drag, setDrag] = useState<{ a: Appointment; over: string | null; x0: number; y0: number; moved: boolean } | null>(null)
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>()
    for (const a of items) { const k = israelDate(new Date(a.starts_at)); m.set(k, [...(m.get(k) ?? []), a]) }
    return m
  }, [items])
  const cellAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-ymd]') as HTMLElement | null)?.dataset.ymd ?? null
  // שורה אחרונה ריקה מהחודש? מסתירים אותה
  const rows = days.slice(35).every(d => d.slice(0, 7) !== month) ? 5 : 6

  return (
    <div className="mg" onPointerMove={e => { if (!drag) return; const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5; setDrag({ ...drag, moved, over: moved ? cellAt(e.clientX, e.clientY) : null }) }}
      onPointerUp={() => { if (!drag) return; const d = drag; setDrag(null); if (!d.moved) onOpen(d.a); else if (d.over) onMove(d.a, d.over) }}
      onPointerCancel={() => setDrag(null)}>
      <div className="mg-head">{DOW.map(d => <div key={d}>{d}</div>)}</div>
      <div className="mg-grid" style={{ gridTemplateRows: `repeat(${rows}, minmax(112px, 1fr))` }}>
        {days.slice(0, rows * 7).map(ymd => {
          const h = hebDay(ymd), list = (byDay.get(ymd) ?? []).sort((x, y) => x.starts_at.localeCompare(y.starts_at))
          const out = ymd.slice(0, 7) !== month
          return (
            <div key={ymd} data-ymd={ymd} className={`mg-cell${out ? ' out' : ''}${ymd === today ? ' is-today' : ''}${closedDay(ymd) ? ' closed' : ''}${drag?.over === ymd ? ' drop' : ''}`}
              onClick={e => { if (e.target === e.currentTarget) onCreate(ymd) }}>
              <div className="mg-top">
                <button type="button" className="mg-num num" onClick={() => onDay(ymd)} aria-label={`פתיחת יום ${gDay(ymd)}`}>{gDay(ymd)}</button>
                <span className="hd">{gematria(h.day)}{h.day === 1 ? ` ${h.month}` : ''}</span>
              </div>
              <HolidayChips list={h.holidays} max={2} />
              {list.slice(0, 3).map(a => (
                <div key={a.id} role="button" tabIndex={0} className={`mg-ev${a.status === 'cancelled' ? ' cancelled' : ''}${drag?.a.id === a.id && drag.moved ? ' ghosted' : ''}`}
                  style={{ ['--c' as string]: a.color_a ?? 'var(--gold)' }}
                  onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); (e.currentTarget.closest('.mg') as HTMLElement).setPointerCapture?.(e.pointerId); setDrag({ a, over: null, x0: e.clientX, y0: e.clientY, moved: false }) }}
                  onKeyDown={e => { if (e.key === 'Enter') onOpen(a) }}>
                  <time>{time(a.starts_at)}</time> {a.client_name ?? a.title ?? 'תור'}
                </div>
              ))}
              {list.length > 3 && <button type="button" className="mg-more" onClick={() => onDay(ymd)}>+{list.length - 3} נוספים</button>}
            </div>
          )
        })}
      </div>
      <p className="mute cal-hint">גוררים תור ליום אחר כדי להעביר אותו. לחיצה על שטח ריק קובעת תור חדש.</p>
    </div>
  )
}
