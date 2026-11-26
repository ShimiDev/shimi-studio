// יומן שבועי. בשלב 2 יסתנכרן דו-כיוונית עם יומן גוגל.
import { useState } from 'react'
import { useStore, useData } from '../store'
import { time, weekday, day } from '../format'
import { AppointmentForm } from '../components/Forms'
import { israelDate, addDays, israelMidnightUtc } from '../../../shared/time'
import { workKind, type Appointment } from '../../../shared/types'

/** יום ראשון של השבוע (בישראל השבוע מתחיל בראשון) */
function weekStart(ymd: string) {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay()
  return addDays(ymd, -dow)
}

export function CalendarPage() {
  const { go } = useStore()
  const today = israelDate()
  const [start, setStart] = useState(() => weekStart(today))
  const [edit, setEdit] = useState<{ appt?: Appointment; start?: Date } | null>(null)
  const from = israelMidnightUtc(start).toISOString(), to = israelMidnightUtc(addDays(start, 7)).toISOString()
  const { data } = useData<Appointment[]>(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const byDay = (ymd: string) => (data ?? []).filter(a => israelDate(new Date(a.starts_at)) === ymd)

  return (
    <>
      <div className="ctools">
        <h1 className="page" style={{ margin: 0 }}>יומן</h1>
        <div className="row">
          <button className="btn small" type="button" onClick={() => setStart(addDays(start, -7))} aria-label="שבוע קודם">→</button>
          <button className="btn small" type="button" onClick={() => setStart(weekStart(today))}>השבוע</button>
          <button className="btn small" type="button" onClick={() => setStart(addDays(start, 7))} aria-label="שבוע הבא">←</button>
          <span className="mute num">{day(from)}–{day(new Date(Date.parse(to) - 1).toISOString())}</span>
        </div>
        <span className="spacer" />
        <span className="pill">סנכרון ליומן גוגל: בשלב הבא</span>
        <button className="btn primary" type="button" onClick={() => setEdit({})}>+ תור חדש</button>
      </div>
      <div className="week">
        {days.map(d => {
          const noon = new Date(`${d}T12:00:00Z`)
          return (
            <div key={d} className={`day${d === today ? ' is-today' : ''}`}>
              <h5><span><b>{weekday(noon)}</b> {day(noon.toISOString())}</span>
                <button className="btn small ghost" type="button" aria-label={`תור חדש ב-${day(noon.toISOString())}`}
                  onClick={() => { const s = israelMidnightUtc(d); s.setTime(s.getTime() + 10 * 3600e3); setEdit({ start: s }) }}>+</button>
              </h5>
              {byDay(d).map(a => (
                <button key={a.id} type="button" className={`appt${a.status === 'cancelled' ? ' cancelled' : ''}`} style={{ ['--c' as string]: a.color_a ?? 'var(--gold)' }}
                  onClick={() => setEdit({ appt: a })}>
                  <time>{time(a.starts_at)}–{time(a.ends_at)}</time>
                  {a.client_name ?? a.title ?? 'תור'}
                  <span className="mute" style={{ display: 'block', fontSize: 12 }}>{[a.client_name ? a.title : null, workKind(a.kind as never)?.label].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
      {edit && <AppointmentForm appt={edit.appt} start={edit.start} onClose={() => setEdit(null)} />}
      {edit?.appt?.client_id && (
        <div style={{ position: 'fixed', bottom: 20, insetInlineEnd: 20, zIndex: 55 }}>
          <button className="btn primary" type="button" onClick={() => { const id = edit.appt!.client_id!; setEdit(null); go({ page: 'control', clientId: id }) }}>לחדר עם {edit.appt.client_name} ←</button>
        </div>
      )}
    </>
  )
}
