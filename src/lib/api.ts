import type { Envelope } from '../../shared/api-types'

/** Una conexión a medio abrir bloquearía el widget hasta la recarga diaria. */
const TIMEOUT_MS = 15_000

// El Worker responde el envelope JSON tanto en 200 (ok/stale) como en 502 (error).
// Los fallos de red (fetch rechazado) los maneja useWidgetData.
export async function fetchWidget<T>(path: string): Promise<Envelope<T>> {
  const res = await fetch(path, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return (await res.json()) as Envelope<T>
}
