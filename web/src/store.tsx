// מצב משותף לכל האפליקציה: ניווט, השעון שרץ, הודעות קופצות, ומצב הפרטיות של REC.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from './api'
import { spoken } from './format'
import { entrySeconds } from '../../shared/time'
import { workKind, type RunningClock, type TimeEntry, type WorkKind } from '../../shared/types'

export type Route = { page: 'clients' } | { page: 'client'; clientId: string } | { page: 'project'; projectId: string } | { page: 'control'; clientId?: string } | { page: 'calendar' } | { page: 'money' } | { page: 'settings' }

function parseHash(): Route {
  const [, page, id] = location.hash.split('/')
  if (page === 'control') return { page, clientId: id || undefined }
  if (page === 'client' && id) return { page, clientId: id }
  if (page === 'project' && id) return { page, projectId: id }
  if (page === 'calendar' || page === 'money' || page === 'settings') return { page }
  return { page: 'clients' }
}

interface Store {
  route: Route
  /** מי בחדר עכשיו: הלקוח שהשעון רץ עליו, ואם אין, האחרון שנכנס לחדר הבקרה */
  inRoom: string | null
  /** סיום סשן: עוצר שעון שרץ על הלקוח, מוציא אותו מהחדר ומחזיר לרשת הלקוחות */
  endSession(clientId: string): Promise<void>
  /** לקוח שבדרך חזרה לכרטיס שלו (לאנימציה במסך הלקוחות) */
  returning: string | null
  doneReturning(): void
  go(r: Route): void
  toast(msg: string, err?: boolean): void
  clock: RunningClock | null
  seconds: number
  startClock(kind: WorkKind, clientId: string | null, opts?: { present?: boolean; projectId?: string | null }): Promise<void>
  pauseClock(): Promise<void>
  resumeClock(): Promise<void>
  stopClock(): Promise<void>
  /** REC עם לקוח בחדר, והנתונים עדיין לא נחשפו */
  privacy: boolean
  isRec: boolean
  isSolo: boolean
  revealed: boolean
  setRevealed(v: boolean): void
  /** מונה שעולה בכל שינוי נתונים, כדי שמסכים יטענו מחדש */
  version: number
  bump(): void
  fail(e: unknown): void
}

const Ctx = createContext<Store>(null!)
export const useStore = () => useContext(Ctx)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(parseHash)
  const [toastMsg, setToast] = useState<{ msg: string; err: boolean } | null>(null)
  const [clock, setClock] = useState<RunningClock | null>(null)
  const [now, setNow] = useState(Date.now())
  const [revealed, setRevealedState] = useState(false)
  const [version, setVersion] = useState(0)
  const toastT = useRef<number>(0)
  const hideT = useRef<number>(0)

  useEffect(() => {
    const on = () => setRoute(parseHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((r: Route) => {
    location.hash = r.page === 'project' ? `#/project/${r.projectId}` : (r.page === 'control' || r.page === 'client') && r.clientId ? `#/${r.page}/${r.clientId}` : `#/${r.page}`
    scrollTo(0, 0)
  }, [])

  const toast = useCallback((msg: string, err = false) => {
    setToast({ msg, err }); clearTimeout(toastT.current)
    toastT.current = window.setTimeout(() => setToast(null), err ? 4000 : 2400)
  }, [])
  const fail = useCallback((e: unknown) => toast(e instanceof ApiError ? e.message : 'משהו השתבש', true), [toast])
  const bump = useCallback(() => setVersion(v => v + 1), [])

  // השעון: הזמן האמיתי בשרת. כאן רק מתקתקים כל שנייה ומסנכרנים כל 30 שניות
  const refresh = useCallback(() => api.get<RunningClock | null>('/clock').then(setClock).catch(() => {}), [])
  useEffect(() => { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i) }, [refresh])
  useEffect(() => { if (!clock) return; const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i) }, [clock])
  useEffect(() => { const v = () => document.visibilityState === 'visible' && refresh(); document.addEventListener('visibilitychange', v); return () => document.removeEventListener('visibilitychange', v) }, [refresh])

  const announceStop = useCallback((s: (TimeEntry & { seconds: number }) | null, name?: string | null) => {
    if (!s || s.kind === 'recording') return
    toast(`נשמרו ${spoken(s.seconds)} ${workKind(s.kind).label}${name ? ` ל${name}` : ''}`)
  }, [toast])

  const startClock: Store['startClock'] = useCallback(async (kind, clientId, opts = {}) => {
    const prevName = clock?.client_name
    try {
      const r = await api.post<{ running: RunningClock; stopped: (TimeEntry & { seconds: number }) | null }>('/clock/start', {
        kind, client_id: clientId, project_id: opts.projectId ?? null, is_client_present: !!opts.present,
      })
      setClock(r.running); setNow(Date.now()); setRevealedState(false)
      if (r.stopped && r.stopped.kind !== 'recording') announceStop(r.stopped, prevName)
      else if (kind !== 'recording') toast(`שעון ${workKind(kind).label} התחיל${r.running.client_name ? ` ל${r.running.client_name}` : ''}`)
      bump()
    } catch (e) { fail(e) }
  }, [clock, announceStop, toast, fail, bump])

  const pauseClock = useCallback(async () => { try { setClock(await api.post('/clock/pause')) } catch (e) { fail(e) } }, [fail])
  const resumeClock = useCallback(async () => { try { setClock(await api.post('/clock/resume')) } catch (e) { fail(e) } }, [fail])
  const stopClock = useCallback(async () => {
    const name = clock?.client_name
    try {
      const r = await api.post<{ stopped: (TimeEntry & { seconds: number }) | null }>('/clock/stop')
      setClock(null); setRevealedState(false)
      if (r.stopped?.kind === 'recording') toast(`ההקלטה נשמרה: ${spoken(r.stopped.seconds)}`)
      else announceStop(r.stopped, name)
      bump()
    } catch (e) { fail(e) }
  }, [clock, announceStop, toast, fail, bump])

  const isRec = clock?.kind === 'recording'
  const isSolo = isRec && !clock?.is_client_present
  const privacy = isRec && !!clock?.is_client_present && !revealed

  // "הצג נתונים" נסגר לבד אחרי דקה בלי פעילות
  const setRevealed = useCallback((v: boolean) => { setRevealedState(v) }, [])
  useEffect(() => {
    if (!revealed || !isRec) return
    const arm = () => { clearTimeout(hideT.current); hideT.current = window.setTimeout(() => setRevealedState(false), 60000) }
    arm()
    const evs = ['pointerdown', 'keydown', 'wheel'] as const
    evs.forEach(e => addEventListener(e, arm))
    return () => { clearTimeout(hideT.current); evs.forEach(e => removeEventListener(e, arm)) }
  }, [revealed, isRec])

  // ב-REC עם לקוח, כל מסך אחר נסגר וחוזרים לחדר הבקרה
  useEffect(() => {
    if (privacy && route.page !== 'control') go({ page: 'control', clientId: clock?.client_id ?? undefined })
  }, [privacy, route.page, go, clock])

  const seconds = clock ? entrySeconds(clock, now) : 0
  const [lastRoom, setLastRoom] = useState<string | null>(() => { try { return sessionStorage.getItem('in-room') } catch { return null } })
  const ended = useRef<string | null>(null)
  // מי בחדר: מי שמקליטים איתו עכשיו, אחרת מי שנכנס אחרון ועוד לא סיים סשן.
  // שעון מיקס/עריכה ללקוח לא מכניס אותו לחדר.
  const recClient = clock?.kind === 'recording' && clock.is_client_present ? clock.client_id : null
  const inRoom = recClient ?? lastRoom
  useEffect(() => {
    if (route.page !== 'control') { ended.current = null; return }
    if (!route.clientId || route.clientId === inRoom || route.clientId === ended.current) return
    // כבר יש מישהו בחדר: לא מכניסים עוד לקוח עד שמסיימים את הסשן
    if (inRoom) {
      toast('יש כבר לקוח בחדר. כדי להכניס מישהו אחר, קודם לוחצים "סיום סשן"', true)
      go({ page: 'control', clientId: inRoom })
      return
    }
    setLastRoom(route.clientId); try { sessionStorage.setItem('in-room', route.clientId) } catch { /* */ }
  }, [route, inRoom, toast, go])
  const [returning, setReturning] = useState<string | null>(null)
  const endSession = useCallback(async (clientId: string) => {
    if (clock && clock.client_id === clientId) await stopClock()
    ended.current = clientId
    setLastRoom(null); try { sessionStorage.removeItem('in-room') } catch { /* */ }
    setReturning(clientId)
    go({ page: 'clients' })
  }, [clock, stopClock, go])
  const doneReturning = useCallback(() => setReturning(null), [])

  const value = useMemo<Store>(() => ({
    inRoom, endSession, returning, doneReturning, route, go, toast, clock, seconds, startClock, pauseClock, resumeClock, stopClock,
    privacy, isRec, isSolo, revealed, setRevealed, version, bump, fail,
  }), [inRoom, endSession, returning, doneReturning, route, go, toast, clock, seconds, startClock, pauseClock, resumeClock, stopClock, privacy, isRec, isSolo, revealed, setRevealed, version, bump, fail])

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className={`toast${toastMsg.err ? ' err' : ''}`} role="status">{toastMsg.msg}</div>}
    </Ctx.Provider>
  )
}

/** טעינת נתונים פשוטה. נטען מחדש כשהנתיב או ה-version משתנים. skip = לא לטעון בכלל */
export function useData<T>(path: string | null) {
  const { version, fail } = useStore()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) { setData(null); return }
    let live = true
    setLoading(true)
    api.get<T>(path).then(d => { if (live) setData(d) }).catch(e => live && fail(e)).finally(() => live && setLoading(false))
    return () => { live = false }
  }, [path, version, tick, fail])
  return { data, loading, reload: () => setTick(t => t + 1), setData }
}
