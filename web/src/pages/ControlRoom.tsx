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
import { money, hours, clock as fmtClock, time, when, date, dayLong, spoken } from '../format'
import { entrySeconds } from '../../../shared/time'
import { WorkMenu } from '../components/WorkMenu'
import { QuickNote } from '../components/QuickNote'
import { PaymentForm, ChargeForm, AppointmentForm, ManualTimeForm, ClientForm, ProjectForm, ReminderForm } from '../components/Forms'
import {
  CLIENT_KINDS, workKind,
  type ClientSummary, type Dashboard, type Note, type Project, type TimeEntry, type Charge, type Payment, type Appointment, type Client,
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
  // הלקוח שבחדר: זה שנבחר בניווט, ואם אין, מי שכבר בחדר
  const clientId = routeClient ?? S.inRoom ?? clock?.client_id ?? undefined
  const detail = useData<Detail>(!privacy && clientId ? `/clients/${clientId}` : null)
  const dash = useData<Dashboard>(!privacy ? '/dashboard' : null)
  // הערות מסשנים פרטיים: אין להן כרטיס לקוח, אז מציגים אותן כאן כשאין לקוח בחדר
  const privNotes = useData<(Note & { started_at: string | null })[]>(!privacy && !clientId ? '/notes?private=1' : null)
  const privSessions = useData<TimeEntry[]>(!privacy && !clientId ? '/time?private=1' : null)
  // לאיזה פרויקט ייכנס הסשן. בוחרים רק כשיש ללקוח יותר מפרויקט פעיל אחד
  const activeProjects = detail.data && detail.data.client.id === clientId ? detail.data.projects.filter(p => p.status === 'active') : []
  const [pickedProject, setPickedProject] = useState<string>('')
  const projectId = activeProjects.some(p => p.id === pickedProject) ? pickedProject : activeProjects[0]?.id ?? ''
  const c = detail.data?.client.id === clientId ? detail.data?.client : undefined
  const [dialog, setDialog] = useState<Dialog>(null)
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const [noteEl, setNoteEl] = useState<HTMLElement | null>(null)

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
  // נכנס עכשיו = הולך מהדלת. כבר היה בחדר (חוזרים למסך) = כבר במקום
  useEffect(() => {
    if (!roomClient) { room.current?.setClient(null); return }
    room.current?.setClient(roomClient, { instant: !!clientId && !S.takeFreshEntry(clientId), rec: isRec, work: working })
  }, [roomKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { room.current?.setWork(working, roomClient) }, [working, roomKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { room.current?.setRec(isRec) }, [isRec])

  // סיום סשן: הדמויות יוצאות מהדלת, ואז חוזרים לרשת הלקוחות
  const [leaving, setLeaving] = useState(false)
  const endSession = () => {
    if (!clientId || leaving) return
    if (isRec && !confirm('ההקלטה עדיין רצה. לעצור אותה ולסיים את הסשן?')) return
    setLeaving(true)
    const finish = () => { S.endSession(clientId).finally(() => setLeaving(false)) }
    if (room.current) room.current.leave(finish); else finish()
  }

  // ---------- פעולות ----------
  const rec = () => isRec ? S.stopClock() : S.startClock('recording', clientId ?? null, { present: !!clientId, projectId: clientId ? projectId || null : null })
  const workBtn = (el: HTMLElement) => {
    if (working) { S.stopClock(); return }
    if (!clientId) { S.toast('בחרו קודם לקוח, ואז הפעילו שעון עבודה'); return }
    setMenuEl(el)
  }
  const name = c?.name ?? (clock?.client_id === clientId ? clock?.client_name : null)
  // הערה מהסשן: נשמרת על הלקוח שבחדר, ועל השעון אם הוא רץ עליו (או על סשן פרטי)
  const noteEntry = clock && (clock.client_id === (clientId ?? null) || (!clientId && isSolo)) ? clock.id : null
  const canNote = !!clientId || !!noteEntry

  // מה כתוב על השולחן
  let deskTitle = name ?? 'אין לקוח בחדר'
  const pTitle = activeProjects.find(p => p.id === projectId)?.title
  let deskSub = clientId ? `${pTitle ?? ''}${pTitle ? ' · ' : ''}מוכן להקלטה` : 'בחרו לקוח, או לחצו REC לסשן פרטי'
  let deskTime = 0
  if (isRec) { deskTitle = isSolo ? 'סשן פרטי' : (clock!.client_name ?? ''); deskSub = `${clock!.project_title ? clock!.project_title + ' · ' : ''}${clock!.paused_at ? 'מושהה' : 'מקליטים'}`; deskTime = seconds }
  else if (working) { deskTitle = `${workKind(clock!.kind).label} · ${name}`; deskSub = `${clock!.project_title ? clock!.project_title + ' · ' : ''}${clock!.paused_at ? 'מושהה' : 'שעון עבודה רץ · הלקוח לא בחדר'}`; deskTime = seconds }
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
              {!!privSessions.data?.length && <>
                <h4 style={{ marginTop: 14 }}>סשנים פרטיים אחרונים</h4>
                {privSessions.data.slice(0, 5).map(t => <div key={t.id} className="rem" style={{ gridTemplateColumns: '1fr auto' }}>
                  <span>{workKind(t.kind).label} · {spoken(entrySeconds(t))}<small>{date(t.started_at)} {time(t.started_at)}</small></span>
                  <button className="btn small ghost" type="button" onClick={async () => { if (!confirm('למחוק את הסשן הפרטי?')) return; try { await api.del(`/time/${t.id}`); privSessions.reload(); S.bump() } catch (e) { S.fail(e) } }}>מחיקה</button></div>)}
              </>}
              {!!privNotes.data?.length && <>
                <h4 style={{ marginTop: 14 }}>הערות מסשנים פרטיים</h4>
                {privNotes.data.slice(0, 5).map(n => <div key={n.id} className="rem" style={{ gridTemplateColumns: "1fr auto" }}><span>{n.text}<small>{date(n.created_at)}</small></span>
                  <button className="btn small ghost" type="button" onClick={async () => { if (!confirm('למחוק את ההערה?')) return; try { await api.del(`/notes/${n.id}`); privNotes.reload() } catch (e) { S.fail(e) } }}>מחיקה</button></div>)}
              </>}
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
            <div className="recinfo"><b>{deskTitle}</b><small>{deskSub}</small>
              {!isRec && !working && activeProjects.length > 1 && (
                <select className="cp-proj-pick desk-proj" aria-label="לאיזה פרויקט נכנס הסשן" value={projectId} onChange={e => setPickedProject(e.target.value)}>
                  {activeProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              )}</div>
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
            {canNote && (
              <button className="btn small notebtn" type="button" aria-haspopup="dialog" aria-expanded={!!noteEl}
                onClick={e => setNoteEl(noteEl ? null : e.currentTarget)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>הערה
              </button>
            )}
            {isRec && !isSolo && (
              <button className="reveal" type="button" onClick={() => S.setRevealed(!revealed)}>{revealed ? 'הסתר נתונים' : 'הצג נתונים'}</button>
            )}
            {clientId && (
              <button className="btn small endsess" type="button" disabled={leaving} onClick={endSession}
                title="עוצר את השעון אם רץ, והלקוח יוצא מהחדר וחוזר לכרטיס שלו">{leaving ? 'יוצאים…' : 'סיום סשן'}</button>
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

      {noteEl && canNote && <QuickNote anchor={noteEl} clientId={clientId ?? null} entryId={noteEntry}
        title={isRec ? (isSolo ? 'הערה לסשן הפרטי' : `הערה מההקלטה של ${clock?.client_name ?? ''}`) : `הערה על ${name ?? 'הלקוח'}`}
        onClose={() => setNoteEl(null)} />}
      {menuEl && clientId && <WorkMenu anchor={menuEl} title={`שעון עבודה ל${name ?? ''}`} onClose={() => setMenuEl(null)} onPick={k => S.startClock(k, clientId, { projectId: projectId || null })} />}
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
  const { bump, fail, toast } = useStore()
  if (!items.length) return <div className="mute">אין תזכורות פתוחות.</div>
  // אפשר לבטל: התזכורת נעלמת מהרשימה, אז נותנים כמה שניות להחזיר אותה
  const done = async (id: string) => {
    try {
      await api.patch(`/reminders/${id}`, { done: true }); bump()
      toast('סומן כבוצע', false, { label: 'ביטול', run: () => { api.patch(`/reminders/${id}`, { done: false }).then(bump).catch(fail) } })
    } catch (e) { fail(e) }
  }
  return <>{items.map(r => (
    <label key={r.id} className="rem">
      <input type="checkbox" onChange={() => done(r.id)} />
      <span>{r.text}{(r.client_name || r.due_at) && <small>{[r.client_name, r.due_at ? `עד ${when(r.due_at)}` : null].filter(Boolean).join(' · ')}</small>}</span>
      <span />
    </label>
  ))}</>
}
