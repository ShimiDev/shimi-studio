import { useStore } from '../store'
import { clock as fmtClock } from '../format'
import { avatar } from '../three/overlay'
import { workKind } from '../../../shared/types'

/** השעון ממשיך לרוץ כשמסתובבים בין המסכים: נגן קטן צף בפינה */
export function MiniPlayer() {
  const { clock, seconds, pauseClock, resumeClock, stopClock, go, route } = useStore()
  if (!clock || clock.kind === 'recording') return null
  if (route.page === 'control') return null
  const k = workKind(clock.kind)
  const img = clock.color_a ? avatar({ color_a: clock.color_a, color_b: clock.color_b!, is_group: clock.is_group }) : ''
  return (
    <div className="mini" style={{ ['--wc' as string]: k.color }}>
      {img && <img src={img} alt="" />}
      <button className="pt" type="button" title="לחדר הבקרה" onClick={() => go({ page: 'control', clientId: clock.client_id ?? undefined })}>
        <b>{clock.client_name}</b><small>{k.label}{clock.paused_at ? ' · מושהה' : ''}</small>
      </button>
      <span className="ptime">{fmtClock(seconds)}</span>
      {clock.paused_at
        ? <button className="pb" type="button" aria-label="המשך" onClick={resumeClock}>▶</button>
        : <button className="pb" type="button" aria-label="השהה" onClick={pauseClock}>❚❚</button>}
      <button className="pb stop" type="button" aria-label="עצור ושמור" onClick={stopClock}>■</button>
    </div>
  )
}
