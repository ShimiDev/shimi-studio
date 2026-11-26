// חדר הבקרה = הדשבורד. במרכז חלון תלת־ממדי לחדר ההקלטה, ומסביבו כרטיס הלקוח,
// תזכורות, הלו"ז של היום והכנסות החודש.
//
// פרטיות: ב-REC עם לקוח בחדר, הפאנלים לא רק מוסתרים ויזואלית. הנתונים בכלל לא נטענים
// מהשרת עד שלוחצים "הצג נתונים", כך שאין מה לראות גם בכלי המפתחים.
import { useEffect, useRef, useState } from 'react'
import { useStore, useData } from '../store'
import { api } from '../api'
import { createLiveRoom, type LiveRoom } from '../three/liveRoom'
import { hasWebGL } from '../three/character'
import { avatar } from '../three/overlay'
import { money, hours, clock as fmtClock, time, when, date, dayLong } from '../format'
import { WorkMenu } from '../components/WorkMenu'
import { PaymentForm, ChargeForm, AppointmentForm, ManualTimeForm, ClientForm, ProjectForm, ReminderForm } from '../components/Forms'
import {
  CLIENT_KINDS, workKind,
  type ClientSummary, type Dashboard, type Project, type TimeEntry, type Charge, type Payment, type Appointment, type Client,
} from '../../../shared/types'

interface Detail {
  client: ClientSummary
  projects: (Project & { seconds: number; charged: number })[]
  time: TimeEntry[]
  charges: Charge[]
  payments: Payment[]
  appointments: Appointment[]
}
type Dialog = null | 'pay' | 'charge' | 'appt' | 'time' | 'edit' | 'project' | 'sheet' | 'reminder'

export function ControlRoom({ clientId: routeClient }: { clientId?: string }) {
  const S = useStore()
  const { clock, seconds, privacy, isRec, isSolo, revealed } = S
  // הלקוח שבחדר: זה שנבחר בניווט, ואם אין, זה שהשעון רץ עליו
  const clientId = routeClient ?? clock?.client_id ?? undefined
  const detail = useData<Detail>(!privacy && clientId ? `/clients/${clientId}` : null)
  const dash = useData<Dashboard>(!privacy ? '/dashboard' : null)
  const c = detail.data?.client.id === clientId ? detail.data?.client : undefined
  const [dialog, setDialog] = useState<Dialog>(null)
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)

  // הדמות בחלון צריכה רק צבעים. בזמן REC לוקחים אותם מהשעון ולא מהנתונים המוסתרים
  const fresh = clock && clock.client_id === clientId && clock.color_a
    ? { color_a: clock.color_a, color_b: clock.color_b!, is_group: clock.is_group }
    : c ? { color_a: c.color_a, color_b: c.color_b, is_group: c.is_group } : null
  // כשעוצרים REC הנתונים נטענים מחדש לרגע. שומרים את הדמות שכבר בחדר,
  // אחרת היא נעלמת ונכנסת שוב מהדלת
  const lastRoom = useRef<{ id: string; rc: NonNullable<typeof fresh> } | null>(null)
  if (fresh && clientId) lastRoom.current = { id: clientId, rc: fresh }
  const roomClient = fresh ?? (lastRoom.current && lastRoom.current.id === clientId ? lastRoom.current.rc : null)
  const roomKey = roomClient ? `${roomClient.color_a}${roomClient.color_b}${roomClient.is_group}` : ''
  const working = !!clock && clock.kind !== 'recording' && clock.client_id === clientId
  const otherWork = !!clock && clock.kind !== 'recording' && clock.client_id !== clientId

  // ---------- החלון התלת־ממדי ----------
  const canvas = useRef<HTMLCanvasElement>(null)
  const room = useRef<LiveRoom | null>(null)
  const [gl] = useState(hasWebGL)
  useEffect(() => {
    if (!gl || !canvas.current) return
    try { room.current = createLiveRoom(canvas.current) } catch { room.current = null }
    return () => { room.current?.dispose(); room.current = null }
  }, [gl])
  useEffect(() => { room.current?.setClient(roomClient) }, [roomKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { room.current?.setWork(working, roomClient) }, [working, roomKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { room.current?.setRec(isRec) }, [isRec])

  // ---------- פעולות ----------
  const rec = () => isRec ? S.stopClock() : S.startClock('recording', clientId ?? null, { present: !!clientId })
  const workBtn = (el: HTMLElement) => {
    if (working) { S.stopClock(); return }
    if (!clientId) { S.toast('בחרו קודם לקוח, ואז הפעילו שעון עבודה'); return }
    setMenuEl(el)
  }
  const name = c?.name ?? (clock?.client_id === clientId ? clock?.client_name : null)

  // מה כתוב על השולחן
  let deskTitle = name ?? 'אין לקוח בחדר'
  let deskSub = clientId ? `${c?.project_title ?? ''}${c?.project_title ? ' · ' : ''}מוכן להקלטה` : 'בחרו לקוח, או לחצו REC לסשן פרטי'
  let deskTime = 0
  if (isRec) { deskTitle = isSolo ? 'סשן פרטי' : (clock!.client_name ?? ''); deskSub = clock!.paused_at ? 'מושהה' : 'מקליטים'; deskTime = seconds }
  else if (working) { deskTitle = `${workKind(clock!.kind).label} · ${name}`; deskSub = clock!.paused_at ? 'מושהה' : 'שעון עבודה רץ · הלקוח לא בחדר'; deskTime = seconds }
  else if (otherWork) { deskSub = `רץ שעון ${workKind(clock!.kind).label} ל${clock!.client_name}` }

  const wlabel = isRec && !isSolo ? 'חדר ההקלטה' : working ? `חדר ההקלטה · ${workKind(clock!.kind).label} · ${name}` : name ? `חדר ההקלטה · ${name}` : 'חדר ההקלטה'
  const hidden = privacy // פאנלים ריקים במקום נתונים

  return (
    <>
      <div className="croom">
        <div className="col">
          {hidden ? <div className="hidden-panel" /> : c ? (
            <ClientPanel d={detail.data!} onAction={a => a === 'sheet' ? S.go({ page: 'client', clientId: clientId! }) : setDialog(a)} />
          ) : (
            <div className="panel">
              <h4>בחדר עכשיו</h4>
              <div className="mute">אין לקוח בחדר.</div>
              {dash.data?.next_up && <div style={{ marginTop: 8 }}>הבא בתור: <b>{dash.data.next_up.client_name ?? dash.data.next_up.title}</b> {when(dash.data.next_up.starts_at)}</div>}
              <div className="acts">
                <button className="btn small" type="button" onClick={() => S.go({ page: 'clients' })}>בחירת לקוח</button>
                {dash.data?.next_up?.client_id && <button className="btn small" type="button" onClick={() => S.go({ page: 'control', clientId: dash.data!.next_up!.client_id! })}>להכניס את {dash.data.next_up.client_name}</button>}
              </div>
            </div>
          )}
          {hidden ? <div className="hidden-panel" /> : (
            <div className="panel">
              <h4>תזכורות <button className="btn small ghost" type="button" onClick={() => setDialog('reminder')}>+ חדשה</button></h4>
              <Reminders items={dash.data?.reminders ?? []} />
            </div>
          )}
        </div>

        <div className="center">
          <div className="onair">ON AIR</div>
          <div className="windowframe">
            <div className="window">
              {gl ? <canvas ref={canvas} aria-label="חדר ההקלטה מבעד לחלון" /> : <div className="nogl">הדפדפן הזה לא מציג תלת־ממד. כאן אמור להופיע חדר ההקלטה.</div>}
              <div className="glass" />
              <div className="wlabel">{wlabel}</div>
            </div>
          </div>
          <div className="desk" style={working ? { ['--wc' as string]: workKind(clock!.kind).color } : undefined}>
            <div className="recinfo"><b>{deskTitle}</b><small>{deskSub}</small></div>
            <div className="rectime">{fmtClock(deskTime)}</div>
            {!isRec && (
              <button className="workbtn" type="button" onClick={e => workBtn(e.currentTarget)}>
                <span className="wdot" />{working ? `עצור ${workKind(clock!.kind).label}` : 'שעון עבודה'}
              </button>
            )}
            {(isRec || working) && (
              <button className="btn small ghost" type="button" onClick={clock!.paused_at ? S.resumeClock : S.pauseClock}>{clock!.paused_at ? '▶ המשך' : '❚❚ השהיה'}</button>
            )}
            <button className="recbtn" type="button" onClick={rec} aria-label={isRec ? 'עצירת הקלטה' : clientId ? `התחלת הקלטה עם ${name ?? 'הלקוח'}` : 'התחלת סשן פרטי'}>{isRec ? '■' : 'REC'}</button>
            {isRec && !isSolo && (
              <button className="reveal" type="button" onClick={() => S.setRevealed(!revealed)}>{revealed ? 'הסתר נתונים' : 'הצג נתונים'}</button>
            )}
          </div>
        </div>

        <div className="col">
          {hidden ? <><div className="hidden-panel" /><div className="hidden-panel" /></> : <>
            <div className="panel">
              <h4>היום <span style={{ fontWeight: 400 }}>{dayLong(new Date())}</span></h4>
              {dash.data?.today.length ? dash.data.today.map(a => (
                <div key={a.id} className={`slot${a.client_id && a.client_id === clientId ? ' now' : ''}`}>
                  <time>{time(a.starts_at)}</time>
                  <div className="bar" style={{ ['--c' as string]: a.color_a ?? 'var(--gold)' }}>
                    {a.client_name ?? a.title ?? 'תור'}<small>{[a.title && a.client_name ? a.title : null, workKind(a.kind as never)?.label].filter(Boolean).join(' · ')}{a.status === 'cancelled' ? ' · בוטל' : ''}</small>
                  </div>
                </div>
              )) : <div className="mute">אין תורים היום.</div>}
              <div className="acts"><button className="btn small" type="button" onClick={() => S.go({ page: 'calendar' })}>ליומן</button></div>
            </div>
            <div className="panel money">
              <h4>{new Intl.DateTimeFormat('he-IL', { month: 'long', timeZone: 'Asia/Jerusalem' }).format(new Date())}</h4>
              <b className="big">{money(dash.data?.month.income)}</b>
              <div className="sub"><span>פתוח לגבייה</span><span style={{ color: 'var(--amber)' }}>{money(dash.data?.month.open_balance)}</span></div>
              <div className="sub"><span>הוצאות החודש</span><span>{money(dash.data?.month.expenses)}</span></div>
              <div className="sub"><span>שעות החודש</span><span>{hours(dash.data?.month.seconds ?? 0)}</span></div>
            </div>
          </>}
        </div>
      </div>

      {menuEl && clientId && <WorkMenu anchor={menuEl} title={`שעון עבודה ל${name ?? ''}`} onClose={() => setMenuEl(null)} onPick={k => S.startClock(k, clientId)} />}
      {dialog === 'pay' && <PaymentForm clientId={clientId} onClose={() => setDialog(null)} />}
      {dialog === 'charge' && clientId && <ChargeForm clientId={clientId} onClose={() => setDialog(null)} />}
      {dialog === 'appt' && <AppointmentForm clientId={clientId} onClose={() => setDialog(null)} />}
      {dialog === 'time' && clientId && <ManualTimeForm clientId={clientId} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && c && <ClientForm client={c as Client} onClose={() => setDialog(null)} />}
      {dialog === 'project' && clientId && <ProjectForm clientId={clientId} onClose={() => setDialog(null)} />}
      {dialog === 'reminder' && <ReminderForm clientId={clientId} onClose={() => setDialog(null)} />}
    </>
  )
}

function ClientPanel({ d, onAction }: { d: Detail; onAction(a: Dialog): void }) {
  const c = d.client
  const img = avatar(c)
  const active = d.projects.filter(p => p.status === 'active')
  return (
    <div className="panel">
      <h4>בחדר עכשיו <button className="btn small ghost" type="button" onClick={() => onAction('edit')}>עריכה</button></h4>
      <div className="client-top">
        {img && <img src={img} alt="" style={{ background: `linear-gradient(160deg, ${c.color_a}33, ${c.color_b}44)` }} />}
        <div><h3>{c.name}</h3><div className="mute" style={{ fontSize: 13 }}>{[c.project_title, CLIENT_KINDS[c.kind]].filter(Boolean).join(' · ')}</div></div>
      </div>
      <div className="kv">
        <div>שעות שנרשמו<b>{hours(c.seconds)}</b></div>
        <div>סשן אחרון<b>{c.last_session ? date(c.last_session) : '—'}</b></div>
        <div className={c.balance > 0 ? 'due' : ''}>יתרה<b>{money(Math.max(0, c.balance))}</b></div>
        <div>תור הבא<b className="txt">{when(c.next_appt)}</b></div>
      </div>
      {active.map(p => {
        const quote = p.quote_amount ? { now: p.charged, of: p.quote_amount, money: true } : p.quoted_hours ? { now: p.seconds / 3600, of: p.quoted_hours, money: false } : null
        return (
          <div key={p.id} style={{ marginTop: 10, fontSize: 13 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>{p.title}</span>
              <span className="mute">{quote ? (quote.money ? `${money(quote.now)} מתוך ${money(quote.of)}` : `${quote.now.toFixed(1)} מתוך ${quote.of} ש׳`) : hours(p.seconds)}</span>
            </div>
            {quote && <div className="progress"><i style={{ width: `${Math.min(100, (quote.now / quote.of) * 100)}%` }} /></div>}
          </div>
        )
      })}
      <div className="acts">
        <button className="btn small" type="button" onClick={() => onAction('pay')}>רישום תשלום</button>
        <button className="btn small" type="button" onClick={() => onAction('charge')}>חיוב</button>
        <button className="btn small" type="button" onClick={() => onAction('appt')}>קביעת תור</button>
        <button className="btn small" type="button" onClick={() => onAction('time')}>הוספת שעות</button>
        <button className="btn small" type="button" onClick={() => onAction('project')}>פרויקט חדש</button>
        <button className="btn small" type="button" onClick={() => onAction('sheet')}>כרטיס לקוח מלא</button>
      </div>
    </div>
  )
}

function Reminders({ items }: { items: Dashboard['reminders'] }) {
  const { bump, fail } = useStore()
  if (!items.length) return <div className="mute">אין תזכורות פתוחות.</div>
  const done = async (id: string) => { try { await api.patch(`/reminders/${id}`, { done: true }); bump() } catch (e) { fail(e) } }
  return <>{items.map(r => (
    <label key={r.id} className="rem">
      <input type="checkbox" onChange={() => done(r.id)} />
      <span>{r.text}{(r.client_name || r.due_at) && <small>{[r.client_name, r.due_at ? `עד ${when(r.due_at)}` : null].filter(Boolean).join(' · ')}</small>}</span>
      <span />
    </label>
  ))}</>
}
