// כל הטפסים של המערכת. כל טופס: שדות עם תווית מעל, המרה משקלים לאגורות, ושמירה לשרת.
import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import { useStore, useData } from '../store'
import { Modal, FormShell } from './Modal'
import { toAgorot, fromAgorot, toLocalInput, fromLocalInput, money, hours } from '../format'
import {
  CLIENT_KINDS, PAY_METHODS, EXPENSE_CATEGORIES, BILLING_MODES, WORK_KINDS,
  PRODUCT_UNITS,
  type Client, type ClientKind, type Project, type ClientSummary, type ChargePreview, type Appointment, type BillingMode, type Product,
} from '../../../shared/types'

/** עזר קטן לטפסים: שדות, מצב שמירה ושגיאה */
function useForm<T extends Record<string, unknown>>(init: T) {
  const [v, setV] = useState(init)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof T>(k: K) => (e: { target: { value: string; type?: string; checked?: boolean } }) =>
    setV(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e instanceof ApiError ? e.message : 'משהו השתבש') } finally { setBusy(false) }
  }
  return { v, setV, set, busy, error, setError, run }
}

function ClientSelect({ value, onChange, allowNone }: { value: string; onChange(v: string): void; allowNone?: string }) {
  const { data } = useData<ClientSummary[]>('/clients')
  return (
    <label className="field"><span>לקוח</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {allowNone != null ? <option value="">{allowNone}</option> : <option value="" disabled>בחרו לקוח</option>}
        {data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  )
}

function ProjectSelect({ clientId, value, onChange }: { clientId: string; value: string; onChange(v: string): void }) {
  const { data } = useData<{ projects: Project[] }>(clientId ? `/clients/${clientId}` : null)
  const list = data?.projects.filter(p => p.status === 'active') ?? []
  if (!clientId || !list.length) return null
  return (
    <label className="field"><span>פרויקט</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">בלי פרויקט</option>
        {list.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
    </label>
  )
}

/** ברירת מחדל לשדה הפרויקט: הפרויקט הפעיל החדש ביותר של הלקוח.
 *  ממלא רק אם השדה עוד ריק, כך שבחירה של המשתמש (גם "בלי פרויקט") נשמרת */
function useDefaultProject(clientId: string, onFound: (id: string) => void) {
  const det = useData<{ projects: Project[] }>(clientId ? `/clients/${clientId}` : null)
  const first = det.data?.projects.find(p => p.status === 'active')?.id
  useEffect(() => { if (first) onFound(first) }, [first, clientId]) // eslint-disable-line react-hooks/exhaustive-deps
  return det.data != null || !clientId
}

// ---------------- לקוח ----------------
export function ClientForm({ client, onClose, onSaved }: { client?: Client; onClose(): void; onSaved?(c: Client): void }) {
  const { bump, toast } = useStore()
  const f = useForm({
    name: client?.name ?? '', kind: (client?.kind ?? 'artist') as ClientKind, is_group: !!client?.is_group,
    phone: client?.phone ?? '', email: client?.email ?? '', hourly_rate: fromAgorot(client?.hourly_rate),
    notes: client?.notes ?? '', project_title: '', color_a: client?.color_a ?? '', color_b: client?.color_b ?? '',
  })
  const save = () => f.run(async () => {
    if (!f.v.name.trim()) throw new ApiError('צריך שם', 400)
    const payload = {
      name: f.v.name, kind: f.v.kind, is_group: f.v.is_group, phone: f.v.phone || null, email: f.v.email || null,
      hourly_rate: toAgorot(f.v.hourly_rate), notes: f.v.notes || null,
      ...(client ? { color_a: f.v.color_a, color_b: f.v.color_b } : { project_title: f.v.project_title || null }),
    }
    const c = client ? await api.patch<Client>(`/clients/${client.id}`, payload) : await api.post<Client>('/clients', payload)
    bump(); toast(client ? 'נשמר' : `${c.name} נוסף/ה`); onSaved?.(c); onClose()
  })
  const archive = () => f.run(async () => {
    await api.patch(`/clients/${client!.id}`, { archived: !client!.archived_at })
    bump(); toast(client!.archived_at ? 'הלקוח חזר לרשימה' : 'הלקוח הועבר לארכיון'); onClose()
  })
  return (
    <Modal title={client ? `עריכת ${client.name}` : 'לקוח חדש'} onClose={onClose}>
      <FormShell onSubmit={save} busy={f.busy} error={f.error} onCancel={onClose}
        extra={client && <button className="btn small danger" type="button" onClick={archive}>{client.archived_at ? 'החזרה מהארכיון' : 'העברה לארכיון'}</button>}>
        <label className="field"><span>שם</span><input value={f.v.name} onChange={f.set('name')} autoComplete="off" required /></label>
        <div className="fields2">
          <label className="field"><span>סוג</span>
            <select value={f.v.kind} onChange={e => { const k = e.target.value as ClientKind; f.setV(s => ({ ...s, kind: k, is_group: client ? s.is_group : k === 'band' || k === 'choir' })) }}>
              {Object.entries(CLIENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field"><span>תעריף לשעה (₪)</span><input inputMode="decimal" value={f.v.hourly_rate} onChange={f.set('hourly_rate')} placeholder="לפי ההגדרות" /></label>
          <label className="field"><span>טלפון</span><input type="tel" dir="ltr" value={f.v.phone} onChange={f.set('phone')} /></label>
          <label className="field"><span>מייל</span><input type="email" dir="ltr" value={f.v.email} onChange={f.set('email')} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.v.is_group} onChange={f.set('is_group')} />הרכב (שלוש דמויות בחלון)</label>
        {!client && <label className="field"><span>פרויקט ראשון (לא חובה)</span><input value={f.v.project_title} onChange={f.set('project_title')} placeholder="למשל: אלבום בכורה" /></label>}
        {client && (
          <div className="fields2">
            <label className="field"><span>צבע ראשי של הדמות</span><input type="color" value={f.v.color_a} onChange={f.set('color_a')} /></label>
            <label className="field"><span>צבע משני</span><input type="color" value={f.v.color_b} onChange={f.set('color_b')} /></label>
          </div>
        )}
        <label className="field"><span>הערות</span><textarea value={f.v.notes} onChange={f.set('notes')} /></label>
      </FormShell>
    </Modal>
  )
}

// ---------------- פרויקט ----------------
export function ProjectForm({ clientId, project, onClose }: { clientId: string; project?: Project; onClose(): void }) {
  const { bump, toast } = useStore()
  const f = useForm({
    title: project?.title ?? '', billing_mode: (project?.billing_mode ?? '') as BillingMode | '',
    unit_price: fromAgorot(project?.unit_price), quote_amount: fromAgorot(project?.quote_amount),
    quoted_hours: project?.quoted_hours?.toString() ?? '', done: project?.status === 'done',
  })
  const prods = useData<Product[]>('/products')
  const basis = (prods.data ?? []).filter(p => p.unit === 'hour' || p.unit === 'song' || p.unit === 'project')
  const fromProduct = (id: string) => {
    const p = basis.find(x => x.id === id); if (!p) return
    const mode: BillingMode = p.unit === 'hour' ? 'hourly' : p.unit === 'song' ? 'per_song' : 'fixed'
    f.setV(s => ({ ...s, billing_mode: mode, unit_price: fromAgorot(p.price), quote_amount: mode === 'fixed' ? fromAgorot(p.price) : s.quote_amount, title: s.title || p.name }))
  }
  const priceLabel = f.v.billing_mode === 'per_song' ? 'מחיר לשיר (₪)' : f.v.billing_mode === 'fixed' ? 'מחיר כולל (₪)' : 'מחיר לשעה (₪)'
  const save = () => f.run(async () => {
    const payload = {
      title: f.v.title, billing_mode: f.v.billing_mode || null, unit_price: toAgorot(f.v.unit_price),
      quote_amount: toAgorot(f.v.quote_amount), quoted_hours: f.v.quoted_hours ? Number(f.v.quoted_hours) : null,
    }
    if (project) await api.patch(`/projects/${project.id}`, { ...payload, status: f.v.done ? 'done' : 'active' })
    else await api.post('/projects', { ...payload, client_id: clientId })
    bump(); toast('הפרויקט נשמר'); onClose()
  })
  return (
    <Modal title={project ? 'עריכת פרויקט' : 'פרויקט חדש'} onClose={onClose}>
      <FormShell onSubmit={save} busy={f.busy} error={f.error} onCancel={onClose}>
        <label className="field"><span>שם הפרויקט</span><input value={f.v.title} onChange={f.set('title')} /></label>
        {basis.length > 0 && (
          <label className="field"><span>תמחור לפי פריט מהמחירון (לא חובה)</span>
            <select value="" onChange={e => fromProduct(e.target.value)}>
              <option value="">בחירה ממלאת את השיטה והמחיר</option>
              {basis.map(p => <option key={p.id} value={p.id}>{p.name} · {money(p.price)} {PRODUCT_UNITS[p.unit].label}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span>שיטת תמחור</span>
          <select value={f.v.billing_mode} onChange={f.set('billing_mode')}>
            <option value="">לפי ההגדרות הכלליות</option>
            {Object.entries(BILLING_MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <div className="fields2">
          <label className="field"><span>{priceLabel}</span><input inputMode="decimal" value={f.v.unit_price} onChange={f.set('unit_price')} placeholder="לפי ההגדרות" /></label>
          <label className="field"><span>הצעת מחיר כוללת (₪)</span><input inputMode="decimal" value={f.v.quote_amount} onChange={f.set('quote_amount')} /></label>
          <label className="field"><span>שעות בהצעה</span><input inputMode="decimal" value={f.v.quoted_hours} onChange={f.set('quoted_hours')} /></label>
        </div>
        {project && <label className="check"><input type="checkbox" checked={f.v.done} onChange={f.set('done')} />הפרויקט הסתיים</label>}
      </FormShell>
    </Modal>
  )
}

// ---------------- תשלום ----------------
export function PaymentForm({ clientId, projectId, onClose }: { clientId?: string; projectId?: string; onClose(): void }) {
  const { bump, toast } = useStore()
  const f = useForm({ client_id: clientId ?? '', project_id: projectId ?? '', amount: '', method: 'transfer', paid_at: toLocalInput(new Date()), notes: '' })
  // תשלום בלי פרויקט לא נספר ב"שולם" של סיכום הפרויקט. לכן ממלאים את הפרויקט הפעיל, כמו בחיוב
  const [picked, setPicked] = useState(!!projectId)
  useDefaultProject(f.v.client_id, id => { if (!picked) f.setV(s => (s.project_id ? s : { ...s, project_id: id })) })
  const save = () => f.run(async () => {
    const amount = toAgorot(f.v.amount)
    if (!amount || amount <= 0) throw new ApiError('צריך סכום', 400)
    await api.post('/payments', { client_id: f.v.client_id || null, project_id: f.v.project_id || null, amount, method: f.v.method, paid_at: fromLocalInput(f.v.paid_at), notes: f.v.notes || null })
    bump(); toast(`נרשם תשלום של ${money(amount)}`); onClose()
  })
  return (
    <Modal title="רישום תשלום" onClose={onClose}>
      <FormShell onSubmit={save} busy={f.busy} error={f.error} onCancel={onClose}>
        <ClientSelect value={f.v.client_id} onChange={v => { setPicked(false); f.setV(s => ({ ...s, client_id: v, project_id: '' })) }} allowNone="בלי לקוח" />
        <ProjectSelect clientId={f.v.client_id} value={f.v.project_id} onChange={v => { setPicked(true); f.setV(s => ({ ...s, project_id: v })) }} />
        <div className="fields2">
          <label className="field"><span>סכום (₪)</span><input inputMode="decimal" value={f.v.amount} onChange={f.set('amount')} /></label>
          <label className="field"><span>אמצעי תשלום</span>
            <select value={f.v.method} onChange={f.set('method')}>{Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
        </div>
        <label className="field"><span>מתי</span><input type="datetime-local" value={f.v.paid_at} onChange={f.set('paid_at')} /></label>
        <label className="field"><span>הערה</span><input value={f.v.notes} onChange={f.set('notes')} /></label>
      </FormShell>
    </Modal>
  )
}

// ---------------- חיוב (ידני או מתוך שעות) ----------------
export function ChargeForm({ clientId, projectId, onClose }: { clientId: string; projectId?: string; onClose(): void }) {
  const { bump, toast } = useStore()
  const f = useForm({ project_id: projectId ?? '', mode: 'time' as 'time' | 'product' | 'manual', songs: '1', amount: '', description: '', product_id: '', qty: '1', price: '' })
  const [pv, setPv] = useState<ChargePreview | null>(null)
  const prods = useData<Product[]>('/products')
  // ברירת מחדל: הפרויקט הפעיל הראשון של הלקוח
  const [picked, setPicked] = useState(!!projectId)
  const ready = useDefaultProject(clientId, id => { if (!picked) f.setV(s => (s.project_id ? s : { ...s, project_id: id })) })
  useEffect(() => {
    // מחכים לפרויקט ברירת המחדל, ומתעלמים מתשובה ישנה: אחרת הסכום של "בלי פרויקט"
    // יכול להגיע אחרון ולהישלח יחד עם השעות של הפרויקט
    if (f.v.mode !== 'time' || !ready) return
    let live = true
    setPv(null)
    const q = new URLSearchParams({ client_id: clientId, ...(f.v.project_id ? { project_id: f.v.project_id } : {}), songs: f.v.songs || '0' })
    api.get<ChargePreview>(`/charges/preview?${q}`).then(p => { if (!live) return; setPv(p); f.setV(s => ({ ...s, amount: fromAgorot(p.amount), description: p.description })) }).catch(() => live && setPv(null))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, f.v.project_id, f.v.mode, f.v.songs, ready])
  // מהמחירון: כמות × מחיר
  const prod = prods.data?.find(p => p.id === f.v.product_id)
  useEffect(() => {
    if (f.v.mode !== 'product' || !prod) return
    const q = Number(f.v.qty) || 0, price = toAgorot(f.v.price) ?? prod.price
    f.setV(s => ({ ...s, amount: fromAgorot(Math.round(q * price)), description: q === 1 ? prod.name : `${prod.name} × ${q}` }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.v.mode, f.v.product_id, f.v.qty, f.v.price])
  const save = () => f.run(async () => {
    const amount = toAgorot(f.v.amount)
    if (amount == null) throw new ApiError('צריך סכום', 400)
    if (f.v.mode === 'time' && !pv) throw new ApiError('השעות עוד נטענות. נסו שוב בעוד רגע', 400)
    await api.post('/charges', {
      client_id: clientId, project_id: f.v.project_id || null, amount, description: f.v.description,
      ...(f.v.mode === 'time' ? { from_time: true, songs: Number(f.v.songs) || 0, entry_ids: pv!.entry_ids } : {}),
      ...(f.v.mode === 'product' && prod ? { product_id: prod.id, quantity: Number(f.v.qty) || 1, unit_price: toAgorot(f.v.price) ?? prod.price } : {}),
    })
    bump(); toast(`נרשם חיוב של ${money(amount)}`); onClose()
  })
  const setMode = (mode: 'time' | 'product' | 'manual') => f.setV(s => ({ ...s, mode, amount: '', description: '' }))
  return (
    <Modal title="חיוב לקוח" onClose={onClose}>
      <FormShell onSubmit={save} busy={f.busy} error={f.error} onCancel={onClose} submit="חיוב">
        <ProjectSelect clientId={clientId} value={f.v.project_id} onChange={v => { setPicked(true); f.setV(s => ({ ...s, project_id: v })) }} />
        <div className="seg" style={{ marginBottom: 12 }}>
          <button type="button" aria-pressed={f.v.mode === 'time'} onClick={() => setMode('time')}>מתוך השעות שנרשמו</button>
          <button type="button" aria-pressed={f.v.mode === 'product'} onClick={() => setMode('product')}>מהמחירון</button>
          <button type="button" aria-pressed={f.v.mode === 'manual'} onClick={() => setMode('manual')}>חיוב ידני</button>
        </div>
        {f.v.mode === 'time' && pv && (
          <p className="mute" style={{ marginTop: 0 }}>
            {BILLING_MODES[pv.mode]} · שעות פתוחות לחיוב: <b>{hours(pv.seconds)}</b>
            {pv.mode === 'hourly' && <> · תעריף {money(pv.rate)}</>}
          </p>
        )}
        {f.v.mode === 'time' && pv?.mode === 'per_song' && (
          <label className="field"><span>כמה שירים</span><input inputMode="numeric" value={f.v.songs} onChange={f.set('songs')} /></label>
        )}
        {f.v.mode === 'product' && (prods.data?.length ? (
          <>
            <label className="field"><span>פריט</span>
              <select value={f.v.product_id} onChange={e => { const p = prods.data!.find(x => x.id === e.target.value); f.setV(s => ({ ...s, product_id: e.target.value, price: fromAgorot(p?.price) })) }}>
                <option value="" disabled>בחרו מהמחירון</option>
                {prods.data.map(p => <option key={p.id} value={p.id}>{p.name} · {money(p.price)} {PRODUCT_UNITS[p.unit].label}</option>)}
              </select>
            </label>
            {prod && <div className="fields2">
              <label className="field"><span>כמות ({PRODUCT_UNITS[prod.unit].per})</span><input inputMode="decimal" value={f.v.qty} onChange={f.set('qty')} /></label>
              <label className="field"><span>מחיר ליחידה (₪)</span><input inputMode="decimal" value={f.v.price} onChange={f.set('price')} /></label>
            </div>}
          </>
        ) : <p className="mute" style={{ marginTop: 0 }}>המחירון ריק. מוסיפים פריטים במסך ההגדרות.</p>)}
        <div className="fields2">
          <label className="field"><span>סכום (₪)</span><input inputMode="decimal" value={f.v.amount} onChange={f.set('amount')} /></label>
          <label className="field"><span>תיאור</span><input value={f.v.description} onChange={f.set('description')} /></label>
        </div>
      </FormShell>
    </Modal>
  )
}

// ---------------- תור ----------------
export function AppointmentForm({ appt, clientId, start, end, onClose }: { appt?: Appointment; clientId?: string; start?: Date; end?: Date; onClose(): void }) {
  const { bump, toast } = useStore()
  const mail = useData<{ configured: boolean }>('/email')
  const s0 = appt ? new Date(appt.starts_at) : (start ?? nextHour())
  const dur = appt ? (Date.parse(appt.ends_at) - Date.parse(appt.starts_at)) / 60000 : start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : 180
  const f = useForm({ client_id: appt?.client_id ?? clientId ?? '', title: appt?.title ?? '', kind: appt?.kind ?? 'recording', starts: toLocalInput(s0), minutes: String(dur), notes: appt?.notes ?? '', send: true })
  const clients = useData<ClientSummary[]>('/clients')
  const client = clients.data?.find(c => c.id === f.v.client_id)
  const email = appt?.invite_email ?? client?.email ?? null
  const canMail = !!mail.data?.configured && !!f.v.client_id && !!email
  const invited = !!appt?.invite_sent_at
  let mailFailed = false
  const send = async (id: string, kind: 'invite' | 'update' | 'cancel') => {
    try { const r = await api.post<{ to: string }>(`/appointments/${id}/send`, { kind }); return r.to }
    catch (e) { mailFailed = true; toast(e instanceof ApiError ? `התור נשמר, אבל המייל לא נשלח: ${e.message}` : 'המייל לא נשלח', true); return null }
  }
  const save = () => f.run(async () => {
    const starts = fromLocalInput(f.v.starts), mins = Number(f.v.minutes)
    if (!(mins > 0)) throw new ApiError('משך לא תקין', 400)
    const body = { client_id: f.v.client_id || null, title: f.v.title || null, kind: f.v.kind, starts_at: starts, ends_at: new Date(Date.parse(starts) + mins * 60000).toISOString(), notes: f.v.notes || null }
    if (appt) {
      await api.patch(`/appointments/${appt.id}`, body)
      const moved = body.starts_at !== new Date(appt.starts_at).toISOString() || body.ends_at !== new Date(appt.ends_at).toISOString()
      const to = invited && moved && f.v.send && canMail ? await send(appt.id, 'update') : null
      if (!mailFailed) toast(to ? `התור עודכן ונשלח עדכון ל-${to}` : 'התור עודכן')
    } else {
      const r = await api.post<{ id: string; overlap: boolean }>('/appointments', body)
      const to = f.v.send && canMail ? await send(r.id, 'invite') : null
      if (!mailFailed) toast([r.overlap ? 'התור נקבע. שימו לב: יש חפיפה עם תור אחר' : 'התור נקבע', to ? `זימון נשלח ל-${to}` : ''].filter(Boolean).join('. '))
    }
    bump(); onClose()
  })
  const cancel = () => f.run(async () => {
    await api.patch(`/appointments/${appt!.id}`, { status: 'cancelled' })
    const to = invited && f.v.send && canMail ? await send(appt!.id, 'cancel') : null
    if (!mailFailed) toast(to ? `התור בוטל והודעה נשלחה ל-${to}` : 'התור בוטל'); bump(); onClose()
  })
  const sendNow = () => f.run(async () => {
    const r = await api.post<{ to: string }>(`/appointments/${appt!.id}/send`, { kind: invited ? 'update' : 'invite' })
    toast(`${invited ? 'עדכון' : 'זימון'} נשלח ל-${r.to}`); bump(); onClose()
  })
  return (
    <Modal title={appt ? 'עריכת תור' : 'תור חדש'} onClose={onClose}>
      <FormShell onSubmit={save} busy={f.busy} error={f.error} onCancel={onClose}
        extra={appt && appt.status === 'scheduled' && <button className="btn small danger" type="button" onClick={cancel}>ביטול התור</button>}>
        <ClientSelect value={f.v.client_id} onChange={v => f.setV(s => ({ ...s, client_id: v }))} allowNone="בלי לקוח (תור אישי)" />
        <div className="fields2">
          <label className="field"><span>מתי</span><input type="datetime-local" value={f.v.starts} onChange={f.set('starts')} /></label>
          <label className="field"><span>משך (דקות)</span>
            <select value={f.v.minutes} onChange={f.set('minutes')}>
              {[30, 60, 90, 120, 180, 240, 300, 360, 480].map(m => <option key={m} value={m}>{m < 60 ? `${m} דק׳` : `${m / 60} שעות`}</option>)}
              {![30, 60, 90, 120, 180, 240, 300, 360, 480].includes(Number(f.v.minutes)) && <option value={f.v.minutes}>{f.v.minutes} דק׳</option>}
            </select>
          </label>
          <label className="field"><span>סוג</span>
            <select value={f.v.kind} onChange={f.set('kind')}>{WORK_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
          </label>
          <label className="field"><span>כותרת (לא חובה)</span><input value={f.v.title} onChange={f.set('title')} placeholder="למשל: ווקאל לסינגל" /></label>
        </div>
        <label className="field"><span>הערות</span><textarea value={f.v.notes} onChange={f.set('notes')} /></label>
        {f.v.client_id && (
          <div className="invite-box">
            {!mail.data?.configured ? <span className="mute">זימון במייל: צריך לחבר את תיבת המייל במסך ההגדרות.</span>
              : !email ? <span className="mute">ללקוח אין מייל. מוסיפים אותו בכרטיס הלקוח ואז אפשר לשלוח זימון.</span>
                : <>
                  {invited && <span className="pill ok">זימון נשלח ל-{appt!.invite_email}</span>}
                  {appt?.reminder_sent_at && <span className="pill">תזכורת נשלחה</span>}
                  <label className="check"><input type="checkbox" checked={f.v.send} onChange={f.set('send')} />
                    {!appt ? `לשלוח זימון ליומן ל-${email}` : invited ? 'לשלוח ללקוח עדכון אם המועד משתנה או מתבטל' : `לשלוח זימון ל-${email}`}</label>
                  {appt && appt.status === 'scheduled' && <button className="btn small" type="button" disabled={f.busy} onClick={sendNow}>{invited ? 'שליחה חוזרת עכשיו' : 'שליחת זימון עכשיו'}</button>}
                </>}
          </div>
        )}
      </FormShell>
    </Modal>
  )
}
function nextHour() { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d }

// ---------------- הוצאה ----------------
export function ExpenseForm({ onClose }: { onClose(): void }) {
  const { bump, toast } = useStore()
  const f = useForm({ category: 'equipment', vendor: '', amount: '', vat_amount: '', spent_at: toLocalInput(new Date()), notes: '' })
  const save = () => f.run(async () => {
    const amount = toAgorot(f.v.amount)
    if (!amount) throw new ApiError('צריך סכום', 400)
    await api.post('/expenses', { category: f.v.category, vendor: f.v.vendor || null, amount, vat_amount: toAgorot(f.v.vat_amount), spent_at: fromLocalInput(f.v.spent_at), notes: f.v.notes || null })
    bump(); toast(`נרשמה הוצאה של ${money(amount)}`); onClose()
  })
  return (
    <Modal title="הוצאה חדשה" onClose={onClose}>
      <FormShell onSubmit={save} busy={f.busy} error={f.error} onCancel={onClose}>
        <div className="fields2">
          <label className="field"><span>קטגוריה</span>
            <select value={f.v.category} onChange={f.set('category')}>{Object.entries(EXPENSE_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field"><span>ספק</span><input value={f.v.vendor} onChange={f.set('vendor')} /></label>
          <label className="field"><span>סכום כולל (₪)</span><input inputMode="decimal" value={f.v.amount} onChange={f.set('amount')} /></label>
          <label className="field"><span>מתוכו מע״מ (₪)</span><input inputMode="decimal" value={f.v.vat_amount} onChange={f.set('vat_amount')} /></label>
        </div>
        <label className="field"><span>מתי</span><input type="datetime-local" value={f.v.spent_at} onChange={f.set('spent_at')} /></label>
        <label className="field"><span>הערה</span><input value={f.v.notes} onChange={f.set('notes')} /></label>
      </FormShell>
    </Modal>
  )
}

// ---------------- שעות ידניות ----------------
export function ManualTimeForm({ clientId, onClose }: { clientId: string; onClose(): void }) {
  const { bump, toast } = useStore()
  const f = useForm({ project_id: '', kind: 'mix', started: toLocalInput(new Date(Date.now() - 2 * 3600e3)), minutes: '120', notes: '' })
  // מציגים מראש לאיזה פרויקט השעות ייכנסו. "בלי פרויקט" שנבחר במפורש נשמר כך
  const [picked, setPicked] = useState(false)
  useDefaultProject(clientId, id => { if (!picked) f.setV(s => (s.project_id ? s : { ...s, project_id: id })) })
  const save = () => f.run(async () => {
    await api.post('/time', { client_id: clientId, project_id: f.v.project_id || null, kind: f.v.kind, started_at: fromLocalInput(f.v.started), minutes: Number(f.v.minutes), notes: f.v.notes || null })
    bump(); toast('השעות נרשמו'); onClose()
  })
  return (
    <Modal title="הוספת שעות ידנית" onClose={onClose}>
      <FormShell onSubmit={save} busy={f.busy} error={f.error} onCancel={onClose}>
        <ProjectSelect clientId={clientId} value={f.v.project_id} onChange={v => { setPicked(true); f.setV(s => ({ ...s, project_id: v })) }} />
        <div className="fields2">
          <label className="field"><span>סוג עבודה</span>
            <select value={f.v.kind} onChange={f.set('kind')}>{WORK_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
          </label>
          <label className="field"><span>כמה דקות</span><input inputMode="numeric" value={f.v.minutes} onChange={f.set('minutes')} /></label>
        </div>
        <label className="field"><span>התחלה</span><input type="datetime-local" value={f.v.started} onChange={f.set('started')} /></label>
        <label className="field"><span>הערה</span><input value={f.v.notes} onChange={f.set('notes')} /></label>
      </FormShell>
    </Modal>
  )
}

// ---------------- תזכורת ----------------
export function ReminderForm({ clientId, onClose }: { clientId?: string; onClose(): void }) {
  const { bump } = useStore()
  const f = useForm({ text: '', client_id: clientId ?? '', due: '' })
  const save = () => f.run(async () => {
    if (!f.v.text.trim()) throw new ApiError('מה להזכיר?', 400)
    await api.post('/reminders', { text: f.v.text, client_id: f.v.client_id || null, due_at: f.v.due ? fromLocalInput(f.v.due) : null })
    bump(); onClose()
  })
  return (
    <Modal title="תזכורת חדשה" onClose={onClose}>
      <FormShell onSubmit={save} busy={f.busy} error={f.error} onCancel={onClose}>
        <label className="field"><span>מה להזכיר</span><input value={f.v.text} onChange={f.set('text')} /></label>
        <ClientSelect value={f.v.client_id} onChange={v => f.setV(s => ({ ...s, client_id: v }))} allowNone="כללי" />
        <label className="field"><span>עד מתי (לא חובה)</span><input type="datetime-local" value={f.v.due} onChange={f.set('due')} /></label>
      </FormShell>
    </Modal>
  )
}
