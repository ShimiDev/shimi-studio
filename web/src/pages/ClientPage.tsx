// כרטיס לקוח: הפרטים והפעולות היומיומיות למעלה, וההיסטוריה (תורים, סשנים, חשבון) למטה.
import { useMemo, useState } from 'react'
import { api } from '../api'
import { useStore, useData } from '../store'
import { avatar } from '../three/overlay'
import { money, hours, time, date, when, spoken } from '../format'
import { WorkMenu, ActionMenu } from '../components/WorkMenu'
import { QuickNote } from '../components/QuickNote'
import { PaymentForm, ChargeForm, AppointmentForm, ManualTimeForm, ClientForm, ProjectForm, ReminderForm } from '../components/Forms'
import { entrySeconds } from '../../../shared/time'
import {
  CLIENT_KINDS, PAY_METHODS, BILLING_MODES, workKind,
  type ClientSummary, type Note, type Reminder, type Project, type TimeEntry, type Charge, type Payment, type Appointment, type Client,
} from '../../../shared/types'

export interface ClientDetail {
  client: ClientSummary
  projects: (Project & { seconds: number; charged: number })[]
  time: TimeEntry[]
  charges: Charge[]
  payments: Payment[]
  appointments: Appointment[]
  all_appointments: Appointment[]
  totals: { charged: number; paid: number; sessions: number }
  notes: Note[]
  tasks: Reminder[]
}
type Tab = 'notes' | 'appts' | 'time' | 'ledger'
type Dialog = null | 'pay' | 'charge' | 'appt' | 'time' | 'edit' | 'project' | 'reminder'

/** מספר ישראלי → קישור וואטסאפ */
const waLink = (phone: string) => { const d = phone.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('0') ? '972' + d.slice(1) : d}` }
const STATUS = { scheduled: 'מתוכנן', done: 'התקיים', cancelled: 'בוטל' } as const

const Ico = {
  phone: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
  wa: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2z" /></svg>,
  mail: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  more: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>,
}

export function ClientPage({ clientId }: { clientId: string }) {
  const S = useStore()
  const { data: d } = useData<ClientDetail>(`/clients/${clientId}`)
  const [tab, setTab] = useState<Tab>('notes')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const [moreEl, setMoreEl] = useState<HTMLElement | null>(null)
  const [noteEl, setNoteEl] = useState<HTMLElement | null>(null)

  const del = async (path: string, msg: string) => {
    if (!confirm(msg)) return
    try { await api.del(path); S.bump(); S.toast('נמחק') } catch (e) { S.fail(e) }
  }
  const toggleTask = async (t: Reminder) => {
    try { await api.patch(`/reminders/${t.id}`, { done: !t.done_at }); S.bump() } catch (e) { S.fail(e) }
  }

  // חשבון: חיובים ותשלומים לפי סדר, עם יתרה מצטברת
  const ledger = useMemo(() => {
    if (!d) return []
    const rows = [
      ...d.charges.map(x => ({ id: x.id, at: x.charged_at, what: x.description, debit: x.amount, credit: 0, path: `/charges/${x.id}`, msg: 'למחוק את החיוב? שעות שחויבו בו יחזרו להיות פתוחות.' })),
      ...d.payments.map(x => ({ id: x.id, at: x.paid_at, what: `תשלום · ${PAY_METHODS[x.method]}${x.notes ? ` · ${x.notes}` : ''}`, debit: 0, credit: x.amount, path: `/payments/${x.id}`, msg: 'למחוק את התשלום?' })),
    ].sort((a, b) => a.at.localeCompare(b.at))
    let bal = 0
    return rows.map(r => ({ ...r, bal: (bal += r.debit - r.credit) })).reverse()
  }, [d])

  if (!d) return <div className="empty">טוען…</div>
  const c = d.client
  const img = avatar(c)
  const now = new Date().toISOString()
  const upcoming = d.all_appointments.filter(a => a.starts_at >= now && a.status === 'scheduled').sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const active = d.projects.filter(p => p.status === 'active')
  const working = S.clock && S.clock.client_id === c.id
  const owes = c.balance > 0

  const more: [string, () => void][] = [
    ['חיוב חדש', () => setDialog('charge')],
    ...(owes ? [] : [['רישום תשלום', () => setDialog('pay')] as [string, () => void]]),
    ['פרויקט חדש', () => setDialog('project')],
    ['הוספת שעות ידנית', () => setDialog('time')],
    ['תזכורת על הלקוח', () => setDialog('reminder')],
    ['עריכת פרטים', () => setDialog('edit')],
  ]
  const openTasks = d.tasks.filter(t => !t.done_at)
  const doneTasks = d.tasks.filter(t => t.done_at)
  const tabs: [Tab, string, number][] = [['notes', 'הערות ומשימות', d.notes.length + openTasks.length], ['appts', 'תורים', d.all_appointments.length], ['time', 'סשנים', d.time.length], ['ledger', 'חשבון', ledger.length]]

  return (
    <div className="cp">
      <button className="btn small ghost cp-back" type="button" onClick={() => S.go({ page: 'clients' })}>→ כל הלקוחות</button>

      <header className="cp-head panel">
        {S.inRoom === c.id
          ? <div className="cp-ava ava-empty" style={{ background: `linear-gradient(160deg, ${c.color_a}22, ${c.color_b}22)` }}><span className="ava-out">בחדר</span></div>
          : img && <img className="cp-ava" src={img} alt="" style={{ background: `linear-gradient(160deg, ${c.color_a}33, ${c.color_b}44)` }} />}
        <div className="cp-id">
          <h1>{c.name}{c.archived_at && <span className="pill" style={{ marginInlineStart: 8 }}>בארכיון</span>}</h1>
          <div className="mute">{[CLIENT_KINDS[c.kind], c.project_title].filter(Boolean).join(' · ')}</div>
          <div className="cp-contact">
            {c.phone && <a className="icon-btn" href={`tel:${c.phone}`} aria-label={`חיוג ל-${c.phone}`} title={c.phone}>{Ico.phone}</a>}
            {c.phone && <a className="icon-btn" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer" aria-label="וואטסאפ" title="וואטסאפ">{Ico.wa}</a>}
            {c.email && <a className="icon-btn" href={`mailto:${c.email}`} aria-label={`מייל ל-${c.email}`} title={c.email}>{Ico.mail}</a>}
            {c.phone && <span className="mute num" dir="ltr">{c.phone}</span>}
          </div>
        </div>
        <div className="cp-actions">
          {S.inRoom && S.inRoom !== c.id
            ? <button className="btn primary" type="button" disabled title="יש כבר לקוח בחדר. קודם מסיימים את הסשן שלו">החדר תפוס</button>
            : <button className="btn primary" type="button" onClick={() => S.go({ page: 'control', clientId: c.id })}>לחדר ←</button>}
          <button className="btn" type="button" onClick={() => setDialog('appt')}>קביעת תור</button>
          <button className={`btn ${working ? 'rec-on' : ''}`} type="button" onClick={e => working ? S.stopClock() : setMenuEl(e.currentTarget)}>{working ? `עצירת ${workKind(S.clock!.kind).label}` : 'שעון עבודה'}</button>
          <button className="icon-btn" type="button" aria-label="עוד פעולות" aria-haspopup="menu" aria-expanded={!!moreEl} onClick={e => setMoreEl(moreEl ? null : e.currentTarget)}>{Ico.more}</button>
        </div>
      </header>

      {S.inRoom && S.inRoom !== c.id && (
        <div className="room-busy" role="status">
          <span>יש כבר לקוח בחדר. כדי להכניס את {c.name}, קודם מסיימים את הסשן הנוכחי.</span>
          <button className="btn small" type="button" onClick={() => S.go({ page: 'control' })}>לחדר הבקרה</button>
        </div>
      )}

      <div className="cp-sum panel">
        <div className={owes ? 'due' : c.balance < 0 ? 'ok' : ''}>
          <span>{c.balance < 0 ? 'זכות' : 'יתרה לגבייה'}</span>
          <b className="num">{money(Math.abs(c.balance))}</b>
          {owes && <button className="btn small" type="button" onClick={() => setDialog('pay')}>רישום תשלום</button>}
        </div>
        <div><span>תור הבא</span><b className="txt">{upcoming[0] ? when(upcoming[0].starts_at) : '—'}</b>
          {upcoming[0] && <small className="num">{time(upcoming[0].starts_at)}–{time(upcoming[0].ends_at)}</small>}</div>
        <div><span>באולפן</span><b className="txt">{hours(c.seconds)}</b><small>{d.totals.sessions} סשנים{c.last_session ? ` · אחרון ${date(c.last_session)}` : ''}</small></div>
      </div>

      {(active.length > 0 || c.notes) && (
        <div className="cp-grid">
          {active.length > 0 && <section className="panel">
            <h4>{active.length > 1 ? 'פרויקטים פעילים' : 'פרויקט פעיל'}</h4>
            {active.map(p => <ProjectRow key={p.id} p={p} onEdit={() => setProject(p)} />)}
          </section>}
          {c.notes && <section className="panel">
            <h4>הערות <button className="btn small ghost" type="button" onClick={() => setDialog('edit')}>עריכה</button></h4>
            <p className="cp-notes">{c.notes}</p>
          </section>}
        </div>
      )}

      <section className="panel cp-hist">
        <div className="cp-hist-head">
          <h4>היסטוריה</h4>
          <div className="seg" role="tablist">
            {tabs.map(([k, l, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}{n ? <small> {n}</small> : null}</button>)}
          </div>
        </div>

        {tab === 'notes' && <div>
          <button className="btn small" type="button" aria-haspopup="dialog" onClick={e => setNoteEl(noteEl ? null : e.currentTarget)}>+ הערה או משימה</button>
          {openTasks.length > 0 && <><div className="cp-sub">משימות פתוחות</div>
            {openTasks.map(t => <label key={t.id} className="cp-task"><input type="checkbox" checked={false} onChange={() => toggleTask(t)} />
              <span className="grow">{t.text}</span>{t.due_at && <span className="mute nowrap">עד {when(t.due_at)}</span>}</label>)}</>}
          {d.notes.length > 0 && <><div className="cp-sub">הערות</div>
            <div className="cp-rows">{d.notes.map(n => <div key={n.id} className="cp-row cp-note-row">
              <span className="nowrap mute">{date(n.created_at)}</span>
              <span className="grow">{n.text}</span>
              <button className="btn small ghost" type="button" onClick={() => del(`/notes/${n.id}`, 'למחוק את ההערה?')}>מחיקה</button>
            </div>)}</div></>}
          {doneTasks.length > 0 && <details className="cp-done"><summary className="cp-sub">משימות שבוצעו ({doneTasks.length})</summary>
            {doneTasks.map(t => <label key={t.id} className="cp-task done"><input type="checkbox" checked onChange={() => toggleTask(t)} /><span className="grow">{t.text}</span></label>)}</details>}
          {!d.notes.length && !d.tasks.length && <div className="empty">אין עדיין הערות או משימות. אפשר להוסיף גם מחדר הבקרה, תוך כדי הקלטה.</div>}
        </div>}

        {tab === 'appts' && (d.all_appointments.length ? <div className="cp-rows">
          {d.all_appointments.map(a => {
            const past = a.starts_at < now
            return <button key={a.id} type="button" className={`cp-row ${past || a.status === 'cancelled' ? 'dim' : ''}`} onClick={() => setAppt(a)}>
              <span className="nowrap">{date(a.starts_at)} <span className="num mute">{time(a.starts_at)}</span></span>
              <span className="grow">{a.title ?? workKind(a.kind as never)?.label}</span>
              {a.status === 'cancelled' ? <span className="pill">בוטל</span> : !past ? <span className="pill gold">{a.invite_sent_at ? 'זומן' : STATUS.scheduled}</span> : null}
            </button>
          })}
        </div> : <div className="empty">עוד לא נקבעו תורים.</div>)}

        {tab === 'time' && (d.time.length ? <div className="cp-rows">
          {d.time.map(t => <div key={t.id} className="cp-row">
            <span className="nowrap">{date(t.started_at)}</span>
            <span className="grow"><span className="kind-dot" style={{ background: workKind(t.kind).color }} />{workKind(t.kind).label}{t.is_client_present ? ' · REC' : ''}</span>
            <span className="num">{t.ended_at ? spoken(entrySeconds(t)) : 'רץ עכשיו'}</span>
            {t.charge_id ? <span className="pill ok">חויב</span> : t.ended_at
              ? <button className="btn small ghost" type="button" aria-label="מחיקת הרישום" onClick={() => del(`/time/${t.id}`, 'למחוק את הרישום?')}>מחיקה</button>
              : null}
          </div>)}
        </div> : <div className="empty">עוד לא נרשמו סשנים.</div>)}

        {tab === 'ledger' && (ledger.length ? <div className="cp-rows">
          {ledger.map(r => <div key={r.id} className="cp-row">
            <span className="nowrap mute">{date(r.at)}</span>
            <span className="grow">{r.what}</span>
            <b className={`num ${r.credit ? 'pos' : ''}`}>{r.credit ? '−' : ''}{money(r.debit || r.credit)}</b>
            <button className="btn small ghost" type="button" onClick={() => del(r.path, r.msg)}>מחיקה</button>
          </div>)}
        </div> : <div className="empty">עוד אין חיובים או תשלומים.</div>)}
      </section>

      {menuEl && <WorkMenu anchor={menuEl} title={`שעון עבודה ל${c.name}`} onClose={() => setMenuEl(null)} onPick={k => S.startClock(k, c.id)} />}
      {noteEl && <QuickNote anchor={noteEl} clientId={c.id} entryId={null} title={`הערה על ${c.name}`} onClose={() => setNoteEl(null)} />}
      {moreEl && <ActionMenu anchor={moreEl} items={more} onClose={() => setMoreEl(null)} />}
      {dialog === 'pay' && <PaymentForm clientId={c.id} onClose={() => setDialog(null)} />}
      {dialog === 'charge' && <ChargeForm clientId={c.id} onClose={() => setDialog(null)} />}
      {dialog === 'appt' && <AppointmentForm clientId={c.id} onClose={() => setDialog(null)} />}
      {dialog === 'time' && <ManualTimeForm clientId={c.id} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <ClientForm client={c as Client} onClose={() => setDialog(null)} />}
      {dialog === 'project' && <ProjectForm clientId={c.id} onClose={() => setDialog(null)} />}
      {dialog === 'reminder' && <ReminderForm clientId={c.id} onClose={() => setDialog(null)} />}
      {appt && <AppointmentForm appt={{ ...appt, client_name: c.name, client_email: c.email }} onClose={() => setAppt(null)} />}
      {project && <ProjectForm clientId={c.id} project={project} onClose={() => setProject(null)} />}
    </div>
  )
}

function ProjectRow({ p, onEdit }: { p: Project & { seconds: number; charged: number }; onEdit(): void }) {
  const quote = p.quote_amount ? { now: p.charged, of: p.quote_amount, money: true } : p.quoted_hours ? { now: p.seconds / 3600, of: p.quoted_hours, money: false } : null
  return (
    <div className="cp-proj">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{p.title}{p.status === 'done' && <span className="pill" style={{ marginInlineStart: 6 }}>הסתיים</span>}</b>
        <button className="btn small ghost" type="button" onClick={onEdit}>עריכה</button>
      </div>
      <div className="mute" style={{ fontSize: 13 }}>
        {p.billing_mode ? BILLING_MODES[p.billing_mode] : 'תמחור לפי ההגדרות'}{p.unit_price != null && ` · ${money(p.unit_price)}`}
        {' · '}{hours(p.seconds)} · חויב {money(p.charged)}
        {quote && ` · ${quote.money ? `${money(quote.now)} מתוך ${money(quote.of)}` : `${quote.now.toFixed(1)} מתוך ${quote.of} ש׳`}`}
      </div>
      {quote && <div className="progress"><i style={{ width: `${Math.min(100, (quote.now / quote.of) * 100)}%` }} /></div>}
          </div>
  )
}
