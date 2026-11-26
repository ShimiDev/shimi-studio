// הערה או משימה מהירה תוך כדי סשן. רק כותבת לשרת ולא קוראת ממנו,
// כך שגם ב-REC עם לקוח בחדר לא נחשף שום מידע חוץ ממה שנכתב עכשיו.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { time } from '../format'

type Kind = 'note' | 'task'
interface Saved { id: string; kind: Kind; text: string; at: string }

const key = (s: string) => `qn:${s}`
const load = (s: string): Saved[] => { try { return JSON.parse(sessionStorage.getItem(key(s)) ?? '[]') } catch { return [] } }

export function QuickNote({ anchor, clientId, entryId, title, onClose }: {
  anchor: HTMLElement; clientId: string | null; entryId: string | null; title: string; onClose(): void
}) {
  const S = useStore()
  const scope = entryId ?? clientId ?? 'none'
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [kind, setKind] = useState<Kind>('note')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<Saved[]>(() => load(scope))

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect(), m = ref.current!.getBoundingClientRect()
    let top = a.top - m.height - 8
    if (top < 8) top = a.bottom + 8
    setPos({ left: Math.min(Math.max(8, a.left + a.width / 2 - m.width / 2), innerWidth - m.width - 8), top })
  }, [anchor, saved.length])
  useEffect(() => {
    input.current?.focus()
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('pointerdown', out); addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc) }
  }, [anchor, onClose])

  const save = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      const r = await api.post<{ id: string }>('/notes', { kind, text: t, client_id: clientId, time_entry_id: entryId })
      const next = [{ id: r.id, kind, text: t, at: new Date().toISOString() }, ...saved].slice(0, 20)
      setSaved(next); sessionStorage.setItem(key(scope), JSON.stringify(next))
      setText(''); input.current?.focus()
      S.toast(kind === 'task' ? 'המשימה נשמרה' : 'ההערה נשמרה')
      if (!S.privacy) S.bump()
    } catch (e) { S.fail(e) } finally { setBusy(false) }
  }

  return (
    <div className="qn" ref={ref} style={pos} role="dialog" aria-label="הערה מהסשן">
      <div className="qn-head">
        <b>{title}</b>
        <div className="seg" role="radiogroup" aria-label="סוג">
          <button type="button" role="radio" aria-checked={kind === 'note'} aria-pressed={kind === 'note'} onClick={() => setKind('note')}>הערה</button>
          <button type="button" role="radio" aria-checked={kind === 'task'} aria-pressed={kind === 'task'} onClick={() => setKind('task')}>משימה</button>
        </div>
      </div>
      <label className="sr" htmlFor="qn-text">{kind === 'task' ? 'משימה' : 'הערה'}</label>
      <textarea id="qn-text" ref={input} rows={3} value={text} maxLength={kind === 'task' ? 500 : 2000}
        placeholder={kind === 'task' ? 'מה צריך לעשות? למשל: לשלוח סקיצה עד יום ראשון' : 'מה כדאי לזכור מהסשן? למשל: טייק 3 הכי טוב בפזמון'}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() } }} />
      <div className="qn-foot">
        <span className="mute">Enter לשמירה · Shift+Enter לשורה חדשה</span>
        <button className="btn small primary" type="button" disabled={!text.trim() || busy} onClick={save}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
      {saved.length > 0 && <ul className="qn-list" aria-label="נשמרו בסשן הזה">
        {saved.map(s => <li key={s.id}><span className={`pill ${s.kind === 'task' ? 'gold' : ''}`}>{s.kind === 'task' ? 'משימה' : 'הערה'}</span><span className="grow">{s.text}</span><span className="mute num">{time(s.at)}</span></li>)}
      </ul>}
    </div>
  )
}
