// כרטיס לקוח מלא: פרטים, תורים, סשנים, חיובים, תשלומים, פרויקטים וכרטסת, במקום אחד.
import { useMemo, useState } from 'react'
import { api } from '../api'
import { useStore, useData } from '../store'
import { avatar } from '../three/overlay'
import { money, hours, time, date, when, spoken } from '../format'
import { WorkMenu } from '../components/WorkMenu'
import { PaymentForm, ChargeForm, AppointmentForm, ManualTimeForm, ClientForm, ProjectForm, ReminderForm } from '../components/Forms'
import { entrySeconds } from '../../../shared/time'
import {
  CLIENT_KINDS, PAY_METHODS, BILLING_MODES, workKind,
  type ClientSummary, type Project, type TimeEntry, type Charge, type Payment, type Appointment, type Client,
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
}
type Tab = 'overview' | 'appts' | 'time' | 'ledger' | 'charges' | 'payments' | 'projects'
type Dialog = null | 'pay' | 'charge' | 'appt' | 'time' | 'edit' | 'project' | 'reminder'

/** מספר ישראלי → קישור וואטסאפ */
const waLink = (phone: string) => { const d = phone.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('0') ? '972' + d.slice(1) : d}` }
const STATUS = { scheduled: 'מתוכנן', done: 'התקיים', cancelled: 'בוטל' } as const

export function ClientPage({ clientId }: { clientId: string }) {
  const S = useStore()
  const { data: d } = useData<ClientDetail>(`/clients/${clientId}`)
  const [tab, setTab] = useState<Tab>('overview')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)

  const del = async (path: string, msg: string) => {
    if (!confirm(msg)) return
    try { await api.del(path); S.bump(); S.toast('נמחק') } catch (e) { S.fail(e) }
  }

  // כרטסת: חיובים ותשלומים לפי סדר, עם יתרה מצטברת
  const ledger = useMemo(() => {
    if (!d) return []
    const rows = [
      ...d.charges.map(x => ({ id: x.id, at: x.charged_at, what: x.description, debit: x.amount, credit: 0, kind: 'charge' as const })),
      ...d.payments.map(x => ({ id: x.id, at: x.paid_at, what: `תשלום · ${PAY_METHODS[x.method]}${x.notes ? ` · ${x.notes}` : ''}`, debit: 0, credit: x.amount, kind: 'pay' as const })),
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

  const tabs: [Tab, string, number | null][] = [
    ['overview', 'סקירה', null], ['appts', 'תורים', d.all_appointments.length], ['time', 'סשנים', d.time.length],
    ['ledger', 'כרטסת', null], ['charges', 'חיובים', d.charges.length], ['payments', 'תשלומים', d.payments.length], ['projects', 'פרויקטים', d.projects.length],
  ]

  return (
    <div className="cp">
      <button className="btn small ghost cp-back" type="button" onClick={() => S.go({ page: 'clients' })}>→ כל הלקוחות</button>

      <header className="cp-head panel">
        {S.inRoom === c.id
          ? <div className="cp-ava ava-empty" style={{ background: `linear-gradient(160deg, ${c.color_a}22, ${c.color_b}22)` }}><span className="ava-out">בחדר</span></div>
          : img && <img className="cp-ava" src={img} alt="" style={{ background: `linear-gradient(160deg, ${c.color_a}33, ${c.color_b}44)` }} />}
        <div className="cp-id">
          <h1>{c.name}{c.archived_at && <span className="pill" style={{ marginInlineStart: 8 }}>בארכיון</span>}</h1>
          <div className="mute">{[CLIENT_KINDS[c.kind], c.project_title, `לקוח מ-${date(c.created_at)}`].filter(Boolean).join(' · ')}</div>
          <div className="row cp-contact">
            {c.phone && <a className="btn small" href={`tel:${c.phone}`}><span dir="ltr">{c.phone}</span></a>}
            {c.phone && <a className="btn small" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer">וואטסאפ</a>}
            {c.email ? <a className="btn small" href={`mailto:${c.email}`}><span dir="ltr">{c.email}</span></a>
              : <button className="btn small ghost" type="button" onClick={() => setDialog('edit')}>+ הוספת מייל</button>}
          </div>
        </div>
        <div className="cp-actions">
          <button className="btn primary" type="button" onClick={() => S.go({ page: 'control', clientId: c.id })}>לחדר ←</button>
          <button className="btn" type="button" onClick={e => working ? S.stopClock() : setMenuEl(e.currentTarget)}>{working ? `עצירת ${workKind(S.clock!.kind).label}` : '⏱ שעון עבודה'}</button>
          <button className="btn" type="button" onClick={() => setDialog('appt')}>קביעת תור</button>
          <button className="btn" type="button" onClick={() => setDialog('charge')}>חיוב</button>
          <button className="btn" type="button" onClick={() => setDialog('pay')}>רישום תשלום</button>
          <button className="btn ghost" type="button" onClick={() => setDialog('edit')}>עריכת פרטים</button>
        </div>
      </header>

      <div className="cp-kpis">
        <div className={c.balance > 0 ? 'due' : c.balance < 0 ? 'ok' : ''}><span>{c.balance < 0 ? 'זכות' : 'יתרה לגבייה'}</span><b className="num">{money(Math.abs(c.balance))}</b></div>
        <div><span>סה״כ חויב</span><b className="num">{money(d.totals.charged)}</b></div>
        <div><span>סה״כ שולם</span><b className="num">{money(d.totals.paid)}</b></div>
        <div><span>שעות באולפן</span><b>{hours(c.seconds)}</b><small>{d.totals.sessions} סשנים</small></div>
        <div><span>תור הבא</span><b className="txt">{when(c.next_appt)}</b></div>
        <div><span>סשן אחרון</span><b className="txt">{c.last_session ? date(c.last_session) : '—'}</b></div>
      </div>

      <div className="seg cp-tabs" role="tablist">
        {tabs.map(([k, l, n]) => <button key={k} type="button" role="tab" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}{n ? <small> {n}</small> : null}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="cp-grid">
          <section className="panel">
            <h4>תורים קרובים <button className="btn small ghost" type="button" onClick={() => setDialog('appt')}>+ תור</button></h4>
            {upcoming.length ? upcoming.slice(0, 5).map(a => <ApptRow key={a.id} a={a} onOpen={() => setAppt(a)} />) : <div className="mute">אין תורים קרובים.</div>}
          </section>
          <section className="panel">
            <h4>פרויקטים פעילים <button className="btn small ghost" type="button" onClick={() => setDialog('project')}>+ פרויקט</button></h4>
            {active.length ? active.map(p => <ProjectRow key={p.id} p={p} onEdit={() => setProject(p)} />) : <div className="mute">אין פרויקטים פעילים.</div>}
          </section>
          <section className="panel">
            <h4>תנועות אחרונות <button className="btn small ghost" type="button" onClick={() => setTab('ledger')}>לכרטסת</button></h4>
            {ledger.length ? ledger.slice(0, 6).map(r => (
              <div key={r.id} className="cp-line"><span className="mute num">{date(r.at)}</span><span className="grow">{r.what}</span>
                <b className={`num ${r.kind === 'pay' ? 'pos' : ''}`}>{r.kind === 'pay' ? '−' : ''}{money(r.debit || r.credit)}</b></div>
            )) : <div className="mute">עוד אין חיובים או תשלומים.</div>}
          </section>
          <section className="panel">
            <h4>הערות <button className="btn small ghost" type="button" onClick={() => setDialog('edit')}>עריכה</button></h4>
            {c.notes ? <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{c.notes}</p> : <div className="mute">אין הערות.</div>}
            <div className="acts"><button className="btn small" type="button" onClick={() => setDialog('reminder')}>+ תזכורת על הלקוח</button>
              <button className="btn small" type="button" onClick={() => setDialog('time')}>+ הוספת שעות ידנית</button></div>
          </section>
        </div>
      )}

      {tab === 'appts' && <div className="panel scroll-x">{d.all_appointments.length ? (
        <table className="list"><thead><tr><th>מתי</th><th>מה</th><th>סטטוס</th><th>זימון</th></tr></thead><tbody>
          {d.all_appointments.map(a => (
            <tr key={a.id} className="click" onClick={() => setAppt(a)}>
              <td className="nowrap">{date(a.starts_at)} <span className="num">{time(a.starts_at)}–{time(a.ends_at)}</span></td>
              <td>{a.title ?? workKind(a.kind as never)?.label}</td>
              <td><span className={`pill ${a.status === 'cancelled' ? '' : a.status === 'done' || a.starts_at < now ? 'ok' : 'gold'}`}>{a.status === 'scheduled' && a.starts_at < now ? 'עבר' : STATUS[a.status]}</span></td>
              <td className="mute">{a.invite_sent_at ? `נשלח ${date(a.invite_sent_at)}` : '—'}{a.reminder_sent_at ? ' · תזכורת' : ''}</td>
            </tr>))}
        </tbody></table>) : <div className="empty">עוד לא נקבעו תורים.</div>}</div>}

      {tab === 'time' && <div className="panel scroll-x">{d.time.length ? (
        <table className="list"><thead><tr><th>תאריך</th><th>סוג</th><th>פרויקט</th><th>משך</th><th>חיוב</th><th /></tr></thead><tbody>
          {d.time.map(t => <tr key={t.id}>
            <td className="nowrap">{date(t.started_at)} {time(t.started_at)}</td>
            <td><span className="kind-dot" style={{ background: workKind(t.kind).color }} />{workKind(t.kind).label}{t.is_client_present ? ' (REC)' : ''}{t.source === 'manual' ? ' · ידני' : ''}</td>
            <td className="mute">{d.projects.find(p => p.id === t.project_id)?.title ?? '—'}</td>
            <td>{t.ended_at ? spoken(entrySeconds(t)) : 'רץ עכשיו'}</td>
            <td>{t.charge_id ? <span className="pill ok">חויב</span> : <span className="pill">פתוח</span>}</td>
            <td>{t.ended_at && !t.charge_id && <button className="btn small ghost" type="button" onClick={() => del(`/time/${t.id}`, 'למחוק את הרישום?')}>מחיקה</button>}</td>
          </tr>)}
        </tbody></table>) : <div className="empty">עוד לא נרשמו סשנים.</div>}</div>}

      {tab === 'ledger' && <div className="panel scroll-x">{ledger.length ? (
        <table className="list"><thead><tr><th>תאריך</th><th>תנועה</th><th>חובה</th><th>זכות</th><th>יתרה</th></tr></thead><tbody>
          {ledger.map(r => <tr key={r.id}><td className="nowrap">{date(r.at)}</td><td>{r.what}</td>
            <td className="amt">{r.debit ? money(r.debit) : ''}</td><td className="amt pos">{r.credit ? money(r.credit) : ''}</td>
            <td className={`amt ${r.bal > 0 ? 'due' : ''}`}>{money(r.bal)}</td></tr>)}
        </tbody></table>) : <div className="empty">אין תנועות.</div>}</div>}

      {tab === 'charges' && <div className="panel scroll-x">{d.charges.length ? (
        <table className="list"><thead><tr><th>תאריך</th><th>תיאור</th><th>פרויקט</th><th>סכום</th><th /></tr></thead><tbody>
          {d.charges.map(x => <tr key={x.id}><td className="nowrap">{date(x.charged_at)}</td><td>{x.description}</td>
            <td className="mute">{d.projects.find(p => p.id === x.project_id)?.title ?? '—'}</td><td className="amt">{money(x.amount)}</td>
            <td><button className="btn small ghost" type="button" onClick={() => del(`/charges/${x.id}`, 'למחוק את החיוב? שעות שחויבו בו יחזרו להיות פתוחות.')}>מחיקה</button></td></tr>)}
        </tbody></table>) : <div className="empty">אין חיובים.</div>}
        <p className="mute cp-note">חשבוניות וקבלות יופקו כאן כשנחבר את הנהלת החשבונות.</p></div>}

      {tab === 'payments' && <div className="panel scroll-x">{d.payments.length ? (
        <table className="list"><thead><tr><th>תאריך</th><th>אמצעי</th><th>סכום</th><th>הערה</th><th>קבלה</th><th /></tr></thead><tbody>
          {d.payments.map(x => <tr key={x.id}><td className="nowrap">{date(x.paid_at)}</td><td>{PAY_METHODS[x.method]}</td><td className="amt pos">{money(x.amount)}</td>
            <td>{x.notes}</td><td className="mute">{x.invoice_ref ?? '—'}</td>
            <td><button className="btn small ghost" type="button" onClick={() => del(`/payments/${x.id}`, 'למחוק את התשלום?')}>מחיקה</button></td></tr>)}
        </tbody></table>) : <div className="empty">אין תשלומים.</div>}</div>}

      {tab === 'projects' && <div className="panel">
        {d.projects.length ? d.projects.map(p => <ProjectRow key={p.id} p={p} onEdit={() => setProject(p)} full />) : <div className="empty">אין פרויקטים.</div>}
        <div className="acts"><button className="btn small" type="button" onClick={() => setDialog('project')}>+ פרויקט חדש</button></div>
      </div>}

      {menuEl && <WorkMenu anchor={menuEl} title={`שעון עבודה ל${c.name}`} onClose={() => setMenuEl(null)} onPick={k => S.startClock(k, c.id)} />}
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

function ApptRow({ a, onOpen }: { a: Appointment; onOpen(): void }) {
  return (
    <button type="button" className="cp-appt" onClick={onOpen}>
      <b>{when(a.starts_at)}</b>
      <span>{a.title ?? workKind(a.kind as never)?.label}</span>
      <span className="mute num">{time(a.starts_at)}–{time(a.ends_at)}</span>
      {a.invite_sent_at && <span className="pill ok">זומן</span>}
    </button>
  )
}

function ProjectRow({ p, onEdit, full }: { p: Project & { seconds: number; charged: number }; onEdit(): void; full?: boolean }) {
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
      {full && null}
    </div>
  )
}
