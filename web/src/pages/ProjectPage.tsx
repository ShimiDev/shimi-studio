// סיכום פרויקט: כל הסשנים, שעות לפי סוג עבודה, שווי לפי התמחור, מה חויב ומה שולם.
// מוכן לחיוב, ואפשר להדפיס או לשמור כ-PDF ולשלוח ללקוח.
import { useState } from 'react'
import { api } from '../api'
import { useStore, useData } from '../store'
import { money, hours, time, date } from '../format'
import { ActionMenu } from '../components/WorkMenu'
import { ChargeForm, PaymentForm, ProjectForm } from '../components/Forms'
import {
  BILLING_MODES, PAY_METHODS, workKind,
  type BillingMode, type Charge, type Client, type Note, type Payment, type Project, type TimeEntry,
} from '../../../shared/types'

interface Summary {
  project: Project
  client: Client
  mode: BillingMode
  rate: number
  sessions: (TimeEntry & { seconds: number | null })[]
  charges: Charge[]
  payments: Payment[]
  notes: Note[]
  by_kind: { kind: string; sessions: number; seconds: number; open_seconds: number }[]
  unassigned: { n: number; seconds: number }
  running: boolean
  totals: { sessions: number; seconds: number; open_seconds: number; value: number | null; open_value: number | null; charged: number; paid: number; balance: number }
}

/** שעות עשרוניות לטבלה: 2.25 */
const hh = (s: number) => (Math.round(s / 36) / 100).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ProjectPage({ projectId }: { projectId: string }) {
  const S = useStore()
  const { data: d } = useData<Summary>(`/projects/${projectId}`)
  const [dialog, setDialog] = useState<null | 'charge' | 'pay' | 'edit'>(null)
  const [moreEl, setMoreEl] = useState<HTMLElement | null>(null)

  if (!d) return <div className="empty">טוען…</div>
  const { project: p, client: c, totals: t } = d
  const hourly = d.mode === 'hourly'
  const priceLine = hourly ? `${money(d.rate)} לשעה` : d.mode === 'per_song' ? (d.rate ? `${money(d.rate)} לשיר` : 'לא נקבע מחיר לשיר') : `${money(d.rate)} מחיר כולל`
  const quote = p.quote_amount ? { now: t.charged, of: p.quote_amount, label: `${money(t.charged)} מתוך ${money(p.quote_amount)}` }
    : p.quoted_hours ? { now: t.seconds / 3600, of: p.quoted_hours, label: `${hh(t.seconds)} מתוך ${p.quoted_hours} ש׳` } : null

  const assign = async () => {
    try { const r = await api.post<{ assigned: number }>('/time/assign', { project_id: p.id }); S.bump(); S.toast(`${r.assigned} סשנים שויכו ל${p.title}`) } catch (e) { S.fail(e) }
  }
  const setStatus = async (status: 'active' | 'done') => {
    try { await api.patch(`/projects/${p.id}`, { status }); S.bump(); S.toast(status === 'done' ? 'הפרויקט סומן כהסתיים' : 'הפרויקט נפתח מחדש') } catch (e) { S.fail(e) }
  }
  const more: [string, () => void][] = [
    ['רישום תשלום', () => setDialog('pay')],
    ['עריכת פרויקט ותמחור', () => setDialog('edit')],
    p.status === 'active' ? ['סימון כהסתיים', () => setStatus('done')] : ['פתיחה מחדש', () => setStatus('active')],
  ]

  return (
    <div className="cp pj">
      <button className="btn small ghost cp-back no-print" type="button" onClick={() => S.go({ page: 'client', clientId: c.id })}>→ {c.name}</button>

      <div className="print-only mute">האולפן של שימי · הופק ב-{date(new Date().toISOString())}</div>
      <header className="cp-head panel">
        <div className="cp-id">
          <div className="mute pj-kicker">סיכום פרויקט · {c.name}</div>
          <h1>{p.title}{p.status === 'done' && <span className="pill" style={{ marginInlineStart: 8 }}>הסתיים</span>}</h1>
          <div className="mute">{BILLING_MODES[d.mode]} · {priceLine}{!p.billing_mode && ' (לפי ההגדרות)'}</div>
        </div>
        <div className="cp-actions no-print">
          <button className="btn primary" type="button" disabled={hourly ? !t.open_seconds : d.mode === 'fixed' && !t.open_value} onClick={() => setDialog('charge')}>
            {hourly ? (t.open_seconds ? `חיוב ${hh(t.open_seconds)} שעות שלא חויבו` : 'הכל חויב') : d.mode === 'fixed' ? (t.open_value ? `חיוב היתרה: ${money(t.open_value)}` : 'הכל חויב') : 'חיוב שירים'}</button>
          <button className="btn" type="button" onClick={() => print()}>הדפסה / PDF</button>
          <button className="icon-btn" type="button" aria-label="עוד פעולות" aria-haspopup="menu" onClick={e => setMoreEl(moreEl ? null : e.currentTarget)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
        </div>
      </header>

      {d.running && <div className="room-busy no-print" role="status">יש עכשיו סשן פעיל בפרויקט. הוא ייכנס לסיכום ברגע שהשעון ייעצר.</div>}
      {d.unassigned.n > 0 && (
        <div className="room-busy no-print" role="status">
          <span>ל{c.name} יש {d.unassigned.n} סשנים בלי פרויקט ({hours(d.unassigned.seconds)}), שלא נכללים בסיכום הזה.</span>
          <button className="btn small" type="button" onClick={assign}>שיוך ל{p.title}</button>
        </div>
      )}

      <div className="cp-sum panel pj-sum">
        <div><span>שעות עבודה</span><b className="txt">{hh(t.seconds)} ש׳</b><small>{t.sessions} סשנים</small></div>
        <div><span>{hourly ? 'שווי העבודה' : d.mode === 'fixed' ? 'מחיר הפרויקט' : 'מחיר לשיר'}</span><b className="num">{money(t.value ?? d.rate)}</b>
          {hourly && <small>{hh(t.seconds)} × {money(d.rate)}</small>}</div>
        <div><span>חויב</span><b className="num">{money(t.charged)}</b>
          {t.open_value ? <small className="due-txt">עוד לא חויב: {money(t.open_value)}</small> : <small>הכל חויב</small>}</div>
        <div className={t.balance > 0 ? 'due' : ''}><span>שולם</span><b className="num">{money(t.paid)}</b>
          <small>{t.balance > 0 ? `נשאר לגבות ${money(t.balance)}` : 'אין חוב על הפרויקט'}</small></div>
      </div>
      {quote && <div className="panel pj-quote"><div className="row" style={{ justifyContent: 'space-between' }}><span className="mute">התקדמות מול ההצעה</span><b>{quote.label}</b></div>
        <div className="progress"><i style={{ width: `${Math.min(100, (quote.now / quote.of) * 100)}%` }} /></div></div>}

      <section className="panel">
        <h4>לפי סוג עבודה</h4>
        {d.by_kind.length ? <div className="scroll-x"><table className="list pj-table">
          <thead><tr><th>סוג</th><th>סשנים</th><th>שעות</th>{hourly && <><th>עוד לא חויב</th><th>שווי</th></>}</tr></thead>
          <tbody>
            {d.by_kind.map(k => <tr key={k.kind}>
              <td><span className="kind-dot" style={{ background: workKind(k.kind as never).color }} />{workKind(k.kind as never).label}</td>
              <td className="num">{k.sessions}</td><td className="num">{hh(k.seconds)}</td>
              {hourly && <><td className="num">{k.open_seconds ? hh(k.open_seconds) : '—'}</td>
                <td className="amt">{money(Math.round(k.seconds / 3600 * d.rate))}</td></>}
            </tr>)}
          </tbody>
          <tfoot><tr><td>סה״כ</td><td className="num">{t.sessions}</td><td className="num">{hh(t.seconds)}</td>{hourly && <><td className="num">{hh(t.open_seconds)}</td><td className="amt">{money(t.value)}</td></>}</tr></tfoot>
        </table></div> : <div className="empty">עוד אין סשנים בפרויקט.</div>}
      </section>

      {d.sessions.length > 0 && <section className="panel">
        <h4>כל הסשנים</h4>
        <div className="scroll-x"><table className="list pj-table">
          <thead><tr><th>תאריך</th><th>סוג</th><th>שעות</th><th>משך</th><th>מצב</th></tr></thead>
          <tbody>{d.sessions.map(s => <tr key={s.id}>
            <td className="nowrap">{date(s.started_at)}</td>
            <td><span className="kind-dot" style={{ background: workKind(s.kind).color }} />{workKind(s.kind).label}{s.source === 'manual' ? ' · ידני' : ''}</td>
            <td className="nowrap num">{time(s.started_at)}–{s.ended_at ? time(s.ended_at) : 'עכשיו'}</td>
            <td className="num">{s.seconds != null ? hh(s.seconds) : 'רץ'}</td>
            <td>{!s.ended_at ? <span className="pill">רץ</span> : !hourly ? <span className="mute">במחיר הפרויקט</span> : s.charge_id ? <span className="pill ok">חויב</span> : <span className="pill gold">לא חויב</span>}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}

      {(d.charges.length > 0 || d.payments.length > 0) && <section className="panel">
        <h4>חיובים ותשלומים</h4>
        <div className="cp-rows">
          {[...d.charges.map(x => ({ id: x.id, at: x.charged_at, what: x.description, amt: x.amount, pay: false })),
            ...d.payments.map(x => ({ id: x.id, at: x.paid_at, what: `תשלום · ${PAY_METHODS[x.method]}`, amt: x.amount, pay: true }))]
            .sort((a, b) => a.at.localeCompare(b.at)).map(r => <div key={r.id} className="cp-row">
              <span className="nowrap mute">{date(r.at)}</span><span className="grow">{r.what}</span>
              <b className={`num ${r.pay ? 'pos' : ''}`}>{r.pay ? '−' : ''}{money(r.amt)}</b></div>)}
        </div>
      </section>}

      {/* הערות פנימיות: לא מודפסות, כי הסיכום נשלח ללקוח */}
      {d.notes.length > 0 && <section className="panel no-print">
        <h4>הערות מהסשנים</h4>
        <div className="cp-rows">{d.notes.map(n => <div key={n.id} className="cp-row cp-note-row"><span className="nowrap mute">{date(n.created_at)}</span><span className="grow">{n.text}</span></div>)}</div>
      </section>}

      {moreEl && <ActionMenu anchor={moreEl} items={more} onClose={() => setMoreEl(null)} />}
      {dialog === 'charge' && <ChargeForm clientId={c.id} projectId={p.id} onClose={() => setDialog(null)} />}
      {dialog === 'pay' && <PaymentForm clientId={c.id} projectId={p.id} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <ProjectForm clientId={c.id} project={p} onClose={() => setDialog(null)} />}
    </div>
  )
}
