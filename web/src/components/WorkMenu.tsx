import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { WORK_KINDS, type WorkKind } from '../../../shared/types'

/** תפריט קטן לבחירת סוג עבודה לשעון: מיקס / מאסטרינג / עריכה / הפקה */
export function WorkMenu({ anchor, title, onPick, onClose }: { anchor: HTMLElement; title: string; onPick(k: WorkKind): void; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect(), m = ref.current!.getBoundingClientRect()
    let top = a.bottom + 6
    if (top + m.height > innerHeight - 8) top = a.top - m.height - 6
    setPos({ left: Math.min(Math.max(8, a.left), innerWidth - m.width - 8), top })
  }, [anchor])
  useEffect(() => {
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('pointerdown', out); addEventListener('keydown', esc)
    ref.current?.querySelector('button')?.focus()
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc) }
  }, [anchor, onClose])
  return (
    <div className="menu" role="menu" ref={ref} style={pos}>
      <div className="mh">{title}</div>
      {WORK_KINDS.filter(k => k.id !== 'recording').map(k => (
        <button key={k.id} type="button" role="menuitem" onClick={() => { onClose(); onPick(k.id) }}>
          <i style={{ background: k.color }} />{k.label}
        </button>
      ))}
    </div>
  )
}

/** תפריט פעולות כללי ("עוד") באותו עיצוב */
export function ActionMenu({ anchor, items, onClose }: { anchor: HTMLElement; items: [string, () => void][]; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect(), m = ref.current!.getBoundingClientRect()
    let top = a.bottom + 6
    if (top + m.height > innerHeight - 8) top = a.top - m.height - 6
    setPos({ left: Math.min(Math.max(8, a.left), innerWidth - m.width - 8), top })
  }, [anchor])
  useEffect(() => {
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('pointerdown', out); addEventListener('keydown', esc)
    ref.current?.querySelector('button')?.focus()
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc) }
  }, [anchor, onClose])
  return (
    <div className="menu" role="menu" ref={ref} style={pos}>
      {items.map(([label, fn]) => <button key={label} type="button" role="menuitem" onClick={() => { onClose(); fn() }}>{label}</button>)}
    </div>
  )
}
