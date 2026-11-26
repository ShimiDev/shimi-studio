import { useEffect, useRef, type ReactNode, type FormEvent } from 'react'

/** חלון קופץ נגיש: Escape סוגר, הפוקוס נכנס לשדה הראשון */
export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.x)')?.focus()
    return () => removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2>{title}</h2><button className="btn ghost x" type="button" onClick={onClose} aria-label="סגירה">✕</button></header>
        {children}
      </div>
    </div>
  )
}

/** טופס בתוך חלון: כפתור שמירה, שגיאה, ומניעת שליחה כפולה */
export function FormShell({ onSubmit, busy, error, submit = 'שמירה', onCancel, children, extra }: {
  onSubmit(): void; busy: boolean; error: string | null; submit?: string; onCancel(): void; children: ReactNode; extra?: ReactNode
}) {
  const go = (e: FormEvent) => { e.preventDefault(); if (!busy) onSubmit() }
  return (
    <form onSubmit={go} noValidate>
      {children}
      {error && <p className="form-err" role="alert">{error}</p>}
      <footer>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'שומר…' : submit}</button>
        <button className="btn ghost" type="button" onClick={onCancel}>ביטול</button>
        <span className="spacer" />
        {extra}
      </footer>
    </form>
  )
}
