import { useEffect, useState } from 'react'
import { fetchWidget } from '../lib/api'

export type WidgetStatus = 'loading' | 'ok' | 'stale' | 'error'

export interface WidgetState<T> {
  data: T | null
  status: WidgetStatus
  /** ISO del último dato bueno conocido */
  updatedAt: string | null
  errorMessage: string | null
}

const INITIAL: WidgetState<never> = {
  data: null,
  status: 'loading',
  updatedAt: null,
  errorMessage: null,
}

// Polling genérico de un endpoint /api/*: nunca solapa requests, conserva el último
// dato bueno ante fallos y re-consulta al recuperar red o visibilidad.
export function useWidgetData<T>(path: string, intervalMs: number): WidgetState<T> {
  const [state, setState] = useState<WidgetState<T>>(INITIAL)

  useEffect(() => {
    let cancelled = false
    // Local al effect (no useRef): un ref persistiría entre el doble-mount de
    // StrictMode y el segundo mount saltearía su fetch inicial.
    let inFlight = false

    const tick = async () => {
      if (inFlight || cancelled) return
      inFlight = true
      try {
        const envelope = await fetchWidget<T>(path)
        if (cancelled) return
        if (envelope.ok) {
          setState({
            data: envelope.data,
            status: envelope.stale ? 'stale' : 'ok',
            updatedAt: envelope.updatedAt,
            errorMessage: null,
          })
        } else {
          setState((prev) =>
            prev.data !== null
              ? { ...prev, status: 'stale', errorMessage: envelope.error.message }
              : { ...INITIAL, status: 'error', errorMessage: envelope.error.message },
          )
        }
      } catch {
        if (cancelled) return
        setState((prev) =>
          prev.data !== null
            ? { ...prev, status: 'stale', errorMessage: 'Sin conexión' }
            : { ...INITIAL, status: 'error', errorMessage: 'Sin conexión' },
        )
      } finally {
        inFlight = false
      }
    }

    void tick()
    const id = setInterval(() => void tick(), intervalMs)
    const onOnline = () => void tick()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [path, intervalMs])

  return state
}
