// מסך הלקוחות: רשת כרטיסים רגילה ונוחה. לחיצה על כרטיס מוציאה את הדמות לחדר ההקלטה.
import { useMemo, useState } from 'react'
import { useStore, useData } from '../store'
import { avatar, walkOut } from '../three/overlay'
import { money, hours, when } from '../format'
import { ClientForm } from '../components/Forms'
import { WorkMenu } from '../components/WorkMenu'
import { CLIENT_KINDS, workKind, type ClientSummary } from '../../../shared/types'

type Filter = 'all' | 'today' | 'due' | 'new' | 'archived'
const NEW_DAYS = 21

export function ClientsPage() {
  const { go, clock, startClock, stopClock } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [menu, setMenu] = useState<{ el: HTMLElement; c: ClientSummary } | null>(null)
  const [leaving, setLeaving] = useState<string | null>(null)
  const { data, loading } = useData<ClientSummary[]>(filter === 'archived' ? '/clients?archived=1' : '/clients')

  const isNew = (c: ClientSummary) => Date.now() - Date.parse(c.created_at) < NEW_DAYS * 864e5 && !c.last_session
  const list = useMemo(() => (data ?? []).filter(c => {
    if (q && !c.name.includes(q) && !(c.project_title ?? '').includes(q) && !(c.phone ?? '').includes(q)) return false
    if (filter === 'today') return !!c.today
    if (filter === 'due') return c.balance > 0
    if (filter === 'new') return isNew(c)
    return true
  }), [data, q, filter])

  const enter = (c: ClientSummary, card: HTMLElement) => {
    if (leaving) return
    setLeaving(c.id)
    const ava = card.querySelector<HTMLElement>('.ava')!
    card.classList.add('lifted')
    walkOut(ava, c, () => { setLeaving(null); go({ page: 'control', clientId: c.id }) })
  }

  return (
    <>
      <div className="ctools">
        <input className="search" type="search" placeholder="חיפוש לפי שם, פרויקט או טלפון" aria-label="חיפוש לקוח" value={q} onChange={e => setQ(e.target.value)} />
        <div className="seg" role="group" aria-label="סינון">
          {([['all', 'כולם'], ['today', 'מגיעים היום'], ['due', 'חוב פתוח'], ['new', 'חדשים'], ['archived', 'ארכיון']] as const).map(([k, l]) =>
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <span className="spacer" />
        <button className="btn primary" type="button" onClick={() => setAdding(true)}>+ לקוח חדש</button>
      </div>

      <div className={`cgrid-cards${leaving ? ' leaving' : ''}`}>
        {list.map(c => {
          const working = clock && clock.kind !== 'recording' && clock.client_id === c.id
          const wk = working ? workKind(clock!.kind) : null
          const img = avatar(c)
          return (
            <div key={c.id} className={`card${working ? ' working' : ''}`} style={wk ? { ['--wc' as string]: wk.color } : undefined}
              role="button" tabIndex={0} aria-label={`כניסה לחדר עם ${c.name}`}
              onClick={e => !(e.target as HTMLElement).closest('.quick') && enter(c, e.currentTarget)}
              onKeyDown={e => e.key === 'Enter' && e.target === e.currentTarget && enter(c, e.currentTarget)}>
              <div className="ava" style={{ background: `linear-gradient(160deg, ${c.color_a}33, ${c.color_b}44)` }}>
                {img && <img src={img} alt="" />}
                <div className="eq"><span /><span /><span /><span /></div>
              </div>
              <div>
                <h3>{c.name}</h3>
                <div className="sub">{[c.project_title, CLIENT_KINDS[c.kind]].filter(Boolean).join(' · ')}</div>
                <div className="sub">תור הבא: {when(c.next_appt)}</div>
              </div>
              <div className="meta">
                {c.balance > 0 ? <span className="pill due">{money(c.balance)} פתוח</span>
                  : c.balance < 0 ? <span className="pill ok">זכות {money(-c.balance)}</span>
                  : <span className="pill ok">אין חוב</span>}
                <span className="pill">{hours(c.seconds)}</span>
                {isNew(c) && <span className="pill new">חדש</span>}
                <button className="quick" type="button"
                  onClick={e => { e.stopPropagation(); if (working) stopClock(); else setMenu({ el: e.currentTarget, c }) }}>
                  {working ? `${wk!.label} · רץ` : '⏱ שעון עבודה'}
                </button>
                <span className="go">לחדר ←</span>
              </div>
            </div>
          )
        })}
      </div>
      {!loading && data && !list.length && (
        <div className="empty">
          {data.length ? 'אין לקוחות שמתאימים לחיפוש.' : filter === 'archived' ? 'הארכיון ריק.' : <>עוד אין לקוחות. <button className="btn small" type="button" onClick={() => setAdding(true)}>הוספת הלקוח הראשון</button></>}
        </div>
      )}

      {menu && <WorkMenu anchor={menu.el} title={`שעון עבודה ל${menu.c.name}`} onClose={() => setMenu(null)}
        onPick={k => startClock(k, menu.c.id)} />}
      {adding && <ClientForm onClose={() => setAdding(false)} />}
    </>
  )
}
