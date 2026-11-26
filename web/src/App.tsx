import { useEffect, useState } from 'react'
import { useStore, type Route } from './store'
import { ClientsPage } from './pages/Clients'
import { ControlRoom } from './pages/ControlRoom'
import { ClientPage } from './pages/ClientPage'
import { CalendarPage } from './pages/Calendar'
import { MoneyPage } from './pages/Money'
import { SettingsPage } from './pages/Settings'
import { MiniPlayer } from './components/MiniPlayer'
import { dayLong, time } from './format'
import { workKind } from '../../shared/types'

const TABS: { page: Route['page']; label: string }[] = [
  { page: 'clients', label: 'לקוחות' },
  { page: 'control', label: 'חדר בקרה' },
  { page: 'calendar', label: 'יומן' },
  { page: 'money', label: 'ניהול כספים' },
  { page: 'settings', label: 'הגדרות' },
]

function Now() {
  const [d, setD] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setD(new Date()), 30000); return () => clearInterval(i) }, [])
  return <span className="today">{dayLong(d)} · <span className="num">{time(d.toISOString())}</span></span>
}

export function App() {
  const { route, go, clock, isRec, isSolo, revealed } = useStore()
  const work = !!clock && clock.kind !== 'recording'
  const cls = ['app', isRec && 'rec', isSolo && 'solo', isRec && revealed && 'reveal-on', work && 'work'].filter(Boolean).join(' ')
  return (
    <div className={cls} style={work ? { ['--wc' as string]: workKind(clock!.kind).color } : undefined}>
      <header className="topbar">
        <a className="brand" href="#/clients" aria-label="Shimon Leibowitz Studio">
          <img src="/logo.png" alt="" width={38} height={38} />
          <span><b>האולפן של שימי</b><small>SHIMON LEIBOWITZ STUDIO</small></span>
        </a>
        <nav className="tabs" aria-label="ניווט ראשי">
          {TABS.map(t => (
            <button key={t.page} className="tab" type="button" aria-current={route.page === t.page || (route.page === 'client' && t.page === 'clients') ? 'page' : undefined}
              onClick={() => go(t.page === 'control' ? { page: 'control', clientId: route.page === 'control' ? route.clientId : clock?.client_id ?? undefined } : { page: t.page } as Route)}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <Now />
      </header>
      <main>
        {route.page === 'clients' && <ClientsPage />}
        {route.page === 'client' && <ClientPage key={route.clientId} clientId={route.clientId} />}
        {route.page === 'control' && <ControlRoom clientId={route.clientId} />}
        {route.page === 'calendar' && <CalendarPage />}
        {route.page === 'money' && <MoneyPage />}
        {route.page === 'settings' && <SettingsPage />}
      </main>
      <MiniPlayer />
      <div className="door" id="door"><span>חדר הקלטה</span></div>
      <div className="flash" id="flash" />
    </div>
  )
}
