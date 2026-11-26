// כסף: סיכום חודשי, תשלומים, הוצאות וחיובים
import { useState } from 'react'
import { useStore, useData } from '../store'
import { api } from '../api'
import { money, hours, date } from '../format'
import { PaymentForm, ExpenseForm } from '../components/Forms'
import { israelDate, israelMonthRange } from '../../../shared/time'
import { PAY_METHODS, EXPENSE_CATEGORIES, workKind, type MonthReport, type Payment, type Expense, type Charge } from '../../../shared/types'

function shiftMonth(m: string, n: number) {
  const [y, mm] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mm - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
const monthName = (m: string) => new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T00:00:00Z`))

function Bars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  if (!rows.length) return <div className="mute">אין נתונים החודש.</div>
  return <div className="bars">{rows.map(r => (
    <div className="b" key={r.label}><span>{r.label}</span><div className="track"><i style={{ width: `${(r.value / max) * 100}%` }} /></div><span className="bnum">{r.text}</span></div>
  ))}</div>
}

export function MoneyPage() {
  const { bump, fail, toast } = useStore()
  const [month, setMonth] = useState(() => israelDate().slice(0, 7))
  const [tab, setTab] = useState<'payments' | 'expenses' | 'charges'>('payments')
  const [dialog, setDialog] = useState<'pay' | 'expense' | null>(null)
  const [m0, m1] = israelMonthRange(month)
  const range = `from=${encodeURIComponent(m0)}&to=${encodeURIComponent(m1)}`
  const report = useData<MonthReport>(`/reports/month?m=${month}`)
  const pays = useData<Payment[]>(tab === 'payments' ? `/payments?${range}` : null)
  const exps = useData<Expense[]>(tab === 'expenses' ? `/expenses?${range}` : null)
  const chs = useData<Charge[]>(tab === 'charges' ? '/charges' : null)
  const r = report.data
  const del = async (path: string) => {
    if (!confirm('למחוק?')) return
    try { await api.del(path); bump(); toast('נמחק') } catch (e) { fail(e) }
  }

  return (
    <>
      <div className="ctools">
        <h1 className="page" style={{ margin: 0 }}>כסף</h1>
        <div className="row">
          <button className="btn small" type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="חודש קודם">→</button>
          <b style={{ minWidth: 110, textAlign: 'center' }}>{monthName(month)}</b>
          <button className="btn small" type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="חודש הבא">←</button>
        </div>
        <span className="spacer" />
        <button className="btn" type="button" onClick={() => setDialog('expense')}>+ הוצאה</button>
        <button className="btn primary" type="button" onClick={() => setDialog('pay')}>+ תשלום</button>
      </div>

      <div className="stats">
        <div className="stat gold"><small>הכנסות</small><b>{money(r?.income)}</b></div>
        <div className="stat"><small>הוצאות</small><b>{money(r?.expenses)}</b></div>
        <div className="stat"><small>רווח</small><b>{money(r?.profit)}</b></div>
        <div className="stat"><small>שעות עבודה</small><b>{hours(r?.by_kind.reduce((s, k) => s + k.seconds, 0) ?? 0)}</b></div>
      </div>

      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="panel"><h4>הכנסות לפי לקוח</h4>
          <Bars rows={(r?.by_client ?? []).filter(x => x.income > 0).slice(0, 8).map(x => ({ label: x.name, value: x.income, text: money(x.income) }))} /></div>
        <div className="panel"><h4>שעות לפי סוג עבודה</h4>
          <Bars rows={(r?.by_kind ?? []).map(x => ({ label: workKind(x.kind).label, value: x.seconds, text: hours(x.seconds) }))} /></div>
        <div className="panel"><h4>לפי אמצעי תשלום</h4>
          <Bars rows={(r?.by_method ?? []).map(x => ({ label: PAY_METHODS[x.method], value: x.amount, text: money(x.amount) }))} /></div>
        <div className="panel"><h4>הוצאות לפי קטגוריה</h4>
          <Bars rows={(r?.by_category ?? []).map(x => ({ label: EXPENSE_CATEGORIES[x.category], value: x.amount, text: money(x.amount) }))} /></div>
      </div>

      <div className="panel">
        <div className="seg" style={{ marginBottom: 10 }}>
          {([['payments', 'תשלומים'], ['expenses', 'הוצאות'], ['charges', 'חיובים (כל הזמן)']] as const).map(([k, l]) =>
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div className="scroll-x">
          {tab === 'payments' && (pays.data?.length ? (
            <table className="list"><thead><tr><th>תאריך</th><th>לקוח</th><th>אמצעי</th><th>סכום</th><th>הערה</th><th /></tr></thead><tbody>
              {pays.data.map(p => <tr key={p.id}><td>{date(p.paid_at)}</td><td>{p.client_name ?? '—'}</td><td>{PAY_METHODS[p.method]}</td><td className="amt">{money(p.amount)}</td><td>{p.notes}</td>
                <td><button className="btn small ghost" type="button" onClick={() => del(`/payments/${p.id}`)}>מחיקה</button></td></tr>)}
            </tbody></table>) : <div className="empty">אין תשלומים בחודש הזה.</div>)}
          {tab === 'expenses' && (exps.data?.length ? (
            <table className="list"><thead><tr><th>תאריך</th><th>קטגוריה</th><th>ספק</th><th>סכום</th><th>מע״מ</th><th /></tr></thead><tbody>
              {exps.data.map(x => <tr key={x.id}><td>{date(x.spent_at)}</td><td>{EXPENSE_CATEGORIES[x.category]}</td><td>{x.vendor}</td><td className="amt">{money(x.amount)}</td><td className="amt">{x.vat_amount ? money(x.vat_amount) : ''}</td>
                <td><button className="btn small ghost" type="button" onClick={() => del(`/expenses/${x.id}`)}>מחיקה</button></td></tr>)}
            </tbody></table>) : <div className="empty">אין הוצאות בחודש הזה.</div>)}
          {tab === 'charges' && (chs.data?.length ? (
            <table className="list"><thead><tr><th>תאריך</th><th>לקוח</th><th>תיאור</th><th>סכום</th></tr></thead><tbody>
              {chs.data.map(x => <tr key={x.id}><td>{date(x.charged_at)}</td><td>{x.client_name}</td><td>{x.description}</td><td className="amt">{money(x.amount)}</td></tr>)}
            </tbody></table>) : <div className="empty">עוד אין חיובים. מחייבים לקוח מתוך חדר הבקרה.</div>)}
        </div>
      </div>
      {dialog === 'pay' && <PaymentForm onClose={() => setDialog(null)} />}
      {dialog === 'expense' && <ExpenseForm onClose={() => setDialog(null)} />}
    </>
  )
}
