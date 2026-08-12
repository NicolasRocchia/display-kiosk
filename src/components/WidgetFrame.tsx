import type { ReactNode } from 'react'
import type { WidgetStatus } from '../hooks/useWidgetData'

interface Props {
  /** sin título el header solo aparece cuando hay stale/error que señalar */
  title?: string
  status: WidgetStatus
  updatedAt: string | null
  errorMessage?: string | null
  /** marco de color según estado (diseño 1d): good = verde, warning = ámbar */
  tone?: 'good' | 'warning' | null
  children: ReactNode
}

// Chrome común: en 'ok' la pantalla queda limpia; stale/error se señalan discretos
// pero legibles a distancia (símbolo + texto, nunca color solo).
export function WidgetFrame({ title, status, updatedAt, errorMessage, tone, children }: Props) {
  const showHeader = Boolean(title) || status === 'stale' || status === 'error'
  return (
    <section className={`widget${tone ? ` widget--tone-${tone}` : ''}`}>
      {showHeader && (
        <header className="widget__header">
          {title && <h2 className="widget__title">{title}</h2>}
          {status === 'stale' && (
            <span className="widget__meta widget__meta--warning">⚠ {agoLabel(updatedAt)}</span>
          )}
          {status === 'error' && (
            <span className="widget__meta widget__meta--critical">✕ sin datos</span>
          )}
        </header>
      )}
      {status === 'loading' ? (
        <div className="widget__skeleton" />
      ) : status === 'error' ? (
        <p className="widget__error">{errorMessage ?? 'Error'}</p>
      ) : (
        children
      )}
    </section>
  )
}

function agoLabel(iso: string | null): string {
  if (!iso) return 'sin actualizar'
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'hace <1 min'
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)} h`
}
