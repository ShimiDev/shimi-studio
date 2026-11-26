import { useEffect, useState } from 'react'
import { api } from '../api'
import { useStore, useData } from '../store'
import { toAgorot, fromAgorot } from '../format'
import { BILLING_MODES, type Settings, type BillingMode } from '../../../shared/types'

export function SettingsPage() {
  const { toast, fail } = useStore()
  const { data, setData } = useData<Settings>('/settings')
  const [rate, setRate] = useState('')
  useEffect(() => { if (data) setRate(fromAgorot(data.default_rate)) }, [data])
  const save = async (patch: Partial<Settings>) => {
    try { setData(await api.put<Settings>('/settings', patch)); toast('ההגדרות נשמרו') } catch (e) { fail(e) }
  }
  if (!data) return null
  const rateLabel = data.billing_mode === 'per_song' ? 'מחיר ברירת מחדל לשיר (₪)' : data.billing_mode === 'fixed' ? 'תעריף לשעה, לחישובים (₪)' : 'תעריף ברירת מחדל לשעה (₪)'
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
          <form onSubmit={e => { e.preventDefault(); const v = toAgorot(rate); if (v != null) save({ default_rate: v }) }}>
            <label className="field"><span>{rateLabel}</span><input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} /></label>
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
      </div>
    </>
  )
}
