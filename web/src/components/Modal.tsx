import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type FormEvent, type MutableRefObject } from 'react'

/** הטופס שבתוך החלון מדווח כאן אם הוקלד בו משהו, כדי שסגירה בטעות לא תמחק אותו */
const ModalCtx = createContext<{ dirty: MutableRefObject<boolean>; close(): void } | null>(null)

/** חלון קופץ נגיש: Escape סוגר, הפוקוס נכנס לשדה הראשון.
 *  אם הוקלד משהו, שואלים לפני שסוגרים (רקע, Escape, ✕ או "ביטול") */
export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const dirty = useRef(false)
  const close = useCallback(() => {
    if (dirty.current && !confirm('יש שינויים שלא נשמרו. לסגור בלי לשמור?')) return
    onClose()
  }, [onClose])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [close])
  useEffect(() => { ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.x)')?.focus() }, [])
  const ctx = useMemo(() => ({ dirty, close }), [close])
  return (
    <ModalCtx.Provider value={ctx}>
      <div className="modal-back" onMouseDown={e => e.target === e.currentTarget && close()}>
        <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
          <header><h2>{title}</h2><button className="btn ghost x" type="button" onClick={close} aria-label="סגירה">✕</button></header>
          {children}
        </div>
      </div>
    </ModalCtx.Provider>
  )
}

/** טופס בתוך חלון: כפתור שמירה, שגיאה, ומניעת שליחה כפולה */
export function FormShell({ onSubmit, busy, error, submit = 'שמירה', onCancel, children, extra }: {
  onSubmit(): void; busy: boolean; error: string | null; submit?: string; onCancel(): void; children: ReactNode; extra?: ReactNode
}) {
  const ctx = useContext(ModalCtx)
  const go = (e: FormEvent) => { e.preventDefault(); if (!busy) onSubmit() }
  const touch = () => { if (ctx) ctx.dirty.current = true }
  return (
    <form onSubmit={go} onInput={touch} onChange={touch} noValidate>
      {children}
      {error && <p className="form-err" role="alert">{error}</p>}
      <footer>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'שומר…' : submit}</button>
        <button className="btn ghost" type="button" onClick={() => ctx ? ctx.close() : onCancel()}>ביטול</button>
        <span className="spacer" />
        {extra}
      </footer>
    </form>
  )
}
