import { useEffect, useState } from 'react'
import { api } from '../api'
import { useStore, useData } from '../store'
import { toAgorot, fromAgorot, money } from '../format'
import { ApiError } from '../api'
import { BILLING_MODES, PRODUCT_UNITS, type Settings, type BillingMode, type Product, type ProductUnit } from '../../../shared/types'

/** פרטי האולפן שמופיעים בזימונים */
function StudioPanel({ data, save }: { data: Settings; save(p: Partial<Settings>): Promise<void> }) {
  const [v, setV] = useState({ studio_name: data.studio_name, studio_address: data.studio_address, studio_phone: data.studio_phone, email_signature: data.email_signature })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV(s => ({ ...s, [k]: e.target.value }))
  return (
    <div className="panel">
      <h4>פרטי האולפן</h4>
      <p className="mute" style={{ marginTop: 0, fontSize: 14 }}>מופיעים בזימונים ובתזכורות שנשלחים ללקוחות.</p>
      <form onSubmit={e => { e.preventDefault(); save(v) }}>
        <label className="field"><span>שם האולפן</span><input value={v.studio_name} onChange={set('studio_name')} /></label>
        <label className="field"><span>כתובת</span><input value={v.studio_address} onChange={set('studio_address')} placeholder="רחוב, מספר, עיר" /></label>
        <label className="field"><span>טלפון</span><input value={v.studio_phone} onChange={set('studio_phone')} inputMode="tel" /></label>
        <label className="field"><span>חתימה למייל</span><textarea value={v.email_signature} onChange={set('email_signature')} placeholder={'שימי\nהאולפן של שימי'} /></label>
        <button className="btn small primary" type="submit">שמירה</button>
      </form>
    </div>
  )
}

/** חיבור תיבת המייל, ותזכורות אוטומטיות */
function EmailPanel({ data, save }: { data: Settings; save(p: Partial<Settings>): Promise<void> }) {
  const { toast, fail } = useStore()
  const st = useData<{ configured: boolean; from: string | null }>('/email')
  const [busy, setBusy] = useState(false)
  const test = async () => {
    setBusy(true)
    try { const r = await api.post<{ to: string }>('/email/test'); toast(`מייל בדיקה נשלח ל-${r.to}`) }
    catch (e) { fail(e) } finally { setBusy(false) }
  }
  if (!st.data) return null
  return (
    <div className="panel">
      <h4>מייל, זימונים ותזכורות</h4>
      {st.data.configured
        ? <div className="row" style={{ marginBottom: 12 }}><span className="pill ok">מחובר</span><span className="num">{st.data.from}</span>
            <button className="btn small" type="button" disabled={busy} onClick={test}>שליחת מייל בדיקה</button></div>
        : <p className="mute" style={{ marginTop: 0, fontSize: 14 }}>תיבת המייל עוד לא מחוברת. אחרי החיבור אפשר לשלוח ללקוחות זימונים ליומן ישר מהתור.</p>}
      <label className="check"><input type="checkbox" checked={data.reminders_enabled} disabled={!st.data.configured}
        onChange={e => save({ reminders_enabled: e.target.checked })} />תזכורת אוטומטית במייל ללקוח לפני כל תור</label>
      {data.reminders_enabled && (
        <label className="field"><span>כמה זמן לפני</span>
          <select value={data.reminder_hours} onChange={e => save({ reminder_hours: Number(e.target.value) })}>
            {[2, 3, 6, 12, 24, 48].map(h => <option key={h} value={h}>{h === 24 ? 'יום לפני' : h === 48 ? 'יומיים לפני' : `${h} שעות לפני`}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

/** המחירון: מוצרים ושירותים */
function ProductsPanel() {
  const { toast, fail } = useStore()
  const { data, reload } = useData<Product[]>('/products?all=1')
  const empty = { name: '', category: '', unit: 'hour' as ProductUnit, price: '' }
  const [add, setAdd] = useState(empty)
  const [edit, setEdit] = useState<string | null>(null)
  const [row, setRow] = useState(empty)
  const create = async () => {
    const price = toAgorot(add.price)
    if (!add.name.trim() || price == null) { fail(new ApiError('צריך שם ומחיר', 400)); return }
    try { await api.post('/products', { ...add, category: add.category || null, price }); setAdd(empty); toast('נוסף למחירון'); reload() } catch (e) { fail(e) }
  }
  const update = async (id: string, patch: Record<string, unknown>) => {
    try { await api.patch(`/products/${id}`, patch); reload() } catch (e) { fail(e) }
  }
  const saveRow = async (id: string) => {
    const price = toAgorot(row.price)
    if (!row.name.trim() || price == null) { fail(new ApiError('צריך שם ומחיר', 400)); return }
    await update(id, { ...row, category: row.category || null, price }); setEdit(null)
  }
  const remove = async (p: Product) => {
    if (!confirm(`להסיר את "${p.name}" מהמחירון?`)) return
    try { const r = await api.del<{ archived: boolean }>(`/products/${p.id}`); toast(r.archived ? 'הפריט כבר חויב בעבר, אז הוא הוסתר ולא נמחק' : 'הפריט נמחק'); reload() } catch (e) { fail(e) }
  }
  const units = Object.keys(PRODUCT_UNITS) as ProductUnit[]
  const Fields = ({ v, set }: { v: typeof empty; set(f: typeof empty): void }) => <>
    <input value={v.name} onChange={e => set({ ...v, name: e.target.value })} placeholder="שם, למשל: מיקס לשיר" aria-label="שם" />
    <input value={v.category} onChange={e => set({ ...v, category: e.target.value })} placeholder="קטגוריה" aria-label="קטגוריה" list="prod-cats" />
    <select value={v.unit} onChange={e => set({ ...v, unit: e.target.value as ProductUnit })} aria-label="יחידה">{units.map(u => <option key={u} value={u}>{PRODUCT_UNITS[u].label}</option>)}</select>
    <input value={v.price} onChange={e => set({ ...v, price: e.target.value })} placeholder="מחיר ₪" inputMode="decimal" aria-label="מחיר" />
  </>
  return (
    <div className="panel span-all">
      <h4>מחירון</h4>
      <p className="mute" style={{ marginTop: 0, fontSize: 14 }}>השירותים והמוצרים של האולפן. בוחרים מכאן כשמחייבים לקוח או כשפותחים פרויקט.</p>
      <datalist id="prod-cats">{[...new Set((data ?? []).map(p => p.category).filter(Boolean))].map(c => <option key={c!} value={c!} />)}</datalist>
      <form className="prod-row prod-add" onSubmit={e => { e.preventDefault(); create() }}>
        {Fields({ v: add, set: setAdd })}
        <button className="btn small primary" type="submit">הוספה</button>
      </form>
      <div className="prod-list">
        {data?.map(p => edit === p.id ? (
          <form key={p.id} className="prod-row" onSubmit={e => { e.preventDefault(); saveRow(p.id) }}>
            {Fields({ v: row, set: setRow })}
            <span className="row"><button className="btn small primary" type="submit">שמירה</button><button className="btn small ghost" type="button" onClick={() => setEdit(null)}>ביטול</button></span>
          </form>
        ) : (
          <div key={p.id} className={`prod-row${p.active ? '' : ' off'}`}>
            <b>{p.name}</b>
            <span className="mute">{p.category ?? ''}</span>
            <span className="mute">{PRODUCT_UNITS[p.unit].label}</span>
            <span className="num">{money(p.price)}</span>
            <span className="row">
              <button className="btn small ghost" type="button" onClick={() => { setEdit(p.id); setRow({ name: p.name, category: p.category ?? '', unit: p.unit, price: fromAgorot(p.price) }) }}>עריכה</button>
              {p.active ? <button className="btn small ghost" type="button" onClick={() => remove(p)}>הסרה</button>
                : <button className="btn small ghost" type="button" onClick={() => update(p.id, { active: true })}>החזרה</button>}
            </span>
          </div>
        ))}
        {data && !data.length && <p className="mute">עוד אין פריטים. מוסיפים בשורה למעלה.</p>}
      </div>
    </div>
  )
}

function DemoPanel() {
  const { toast, fail } = useStore()
  const { data, setData } = useData<{ loaded: boolean }>('/demo')
  const [busy, setBusy] = useState(false)
  const act = async (load: boolean) => {
    if (!load && !confirm('למחוק את כל נתוני ההדגמה? נתונים שהוזנו ידנית לא יימחקו.')) return
    setBusy(true)
    try {
      setData(load ? await api.post('/demo') : await api.del('/demo'))
      toast(load ? 'נתוני ההדגמה נטענו' : 'נתוני ההדגמה נמחקו')
      setTimeout(() => location.reload(), 600)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  if (!data) return null
  return (
    <div className="panel">
      <h4>נתוני הדגמה</h4>
      <p className="mute" style={{ marginTop: 0, fontSize: 14 }}>
        {data.loaded
          ? 'כרגע טעונים לקוחות, שעות, תשלומים ותורים לדוגמה. לפני שמתחילים לעבוד באמת, מוחקים אותם כאן. נתונים שהוזנו ידנית נשארים.'
          : 'טוען כמה לקוחות, שלושה חודשי עבודה, תשלומים, הוצאות ותורים לדוגמה, כדי לראות איך המערכת נראית כשהיא מלאה.'}
      </p>
      {data.loaded
        ? <button className="btn small" type="button" disabled={busy} onClick={() => act(false)}>מחיקת נתוני ההדגמה</button>
        : <button className="btn small primary" type="button" disabled={busy} onClick={() => act(true)}>טעינת נתוני הדגמה</button>}
    </div>
  )
}

export function SettingsPage() {
  const { toast, fail } = useStore()
  const { data, setData } = useData<Settings>('/settings')
  const [rate, setRate] = useState('')
  const [song, setSong] = useState('')
  useEffect(() => { if (data) { setRate(fromAgorot(data.default_rate)); setSong(data.default_song_price ? fromAgorot(data.default_song_price) : '') } }, [data])
  const save = async (patch: Partial<Settings>) => {
    try { setData(await api.put<Settings>('/settings', patch)); toast('ההגדרות נשמרו') } catch (e) { fail(e) }
  }
  if (!data) return null
  // תעריף לשעה ומחיר לשיר הם שני שדות נפרדים, כדי שהחלפת שיטה לא תהפוך 150 ₪ לשעה ל-150 ₪ לשיר
  return (
    <>
      <h1 className="page">הגדרות</h1>
      <div className="grid2">
        <div className="panel">
          <h4>תמחור</h4>
          <p className="mute" style={{ marginTop: 0, fontSize: 14 }}>איך לחשב חיוב כברירת מחדל. בכל פרויקט אפשר לבחור אחרת.</p>
          <div className="seg" style={{ marginBottom: 14 }}>
            {(Object.keys(BILLING_MODES) as BillingMode[]).map(k =>
              <button key={k} type="button" aria-pressed={data.billing_mode === k} onClick={() => save({ billing_mode: k })}>{BILLING_MODES[k]}</button>)}
          </div>
          <form onSubmit={e => { e.preventDefault(); const v = toAgorot(rate); const sp = toAgorot(song); if (v == null) { fail(new ApiError('צריך תעריף לשעה', 400)); return } save({ default_rate: v, default_song_price: sp ?? 0 }) }}>
            <div className="fields2">
              <label className="field"><span>תעריף ברירת מחדל לשעה (₪)</span><input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} /></label>
              <label className="field"><span>מחיר ברירת מחדל לשיר (₪)</span><input inputMode="decimal" value={song} onChange={e => setSong(e.target.value)} placeholder="לא נקבע" /></label>
            </div>
            <button className="btn small primary" type="submit">שמירה</button>
          </form>
        </div>
        <div className="panel">
          <h4>מע״מ</h4>
          <div className="seg" style={{ marginBottom: 10 }}>
            <button type="button" aria-pressed={data.vat_status === 'exempt'} onClick={() => save({ vat_status: 'exempt' })}>עוסק פטור</button>
            <button type="button" aria-pressed={data.vat_status === 'licensed'} onClick={() => save({ vat_status: 'licensed' })}>עוסק מורשה</button>
          </div>
          <p className="mute" style={{ fontSize: 14, marginBottom: 0 }}>ישמש בשלב הנהלת החשבונות להפקת קבלות וחשבוניות.</p>
        </div>
        <div className="panel">
          <h4>חיבורים</h4>
          <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}><span>יומן גוגל</span><span className="pill">בשלב הבא</span></div>
          <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}><span>הנהלת חשבונות</span><span className="pill">בהמשך</span></div>
          <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}><span>סליקה</span><span className="pill">בהמשך</span></div>
        </div>
        <StudioPanel data={data} save={save} />
        <EmailPanel data={data} save={save} />
        <DemoPanel />
        <ProductsPanel />
      </div>
    </>
  )
}
