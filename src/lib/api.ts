import type { Envelope } from '../../shared/api-types'

// El Worker responde el envelope JSON tanto en 200 (ok/stale) como en 502 (error).
// Los fallos de red (fetch rechazado) los maneja useWidgetData.
export async function fetchWidget<T>(path: string): Promise<Envelope<T>> {
  const res = await fetch(path, { cache: 'no-store' })
  return (await res.json()) as Envelope<T>
}
