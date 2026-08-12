// Serie de generación del día, acumulada en el propio kiosk (localStorage).
// El inversor reporta cada ~5 min; un punto por reporte alcanza para la curva.

export interface SeriesPoint {
  /** minuto del día (0-1439) */
  m: number
  /** potencia AC en W */
  w: number
}

const KEY_PREFIX = 'solar-series-'

/**
 * Curva del día para el modo demo: se dibuja completa desde el arranque en vez
 * de irse acumulando, así el display se ve como en un día real sin esperar uno.
 * Mismos parámetros que worker/sources/demoSolar.ts.
 */
export function demoSeries(): SeriesPoint[] {
  const now = new Date()
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const sunrise = 7 * 60 + 30
  const sunset = 18 * 60 + 30
  const points: SeriesPoint[] = []
  for (let m = sunrise; m <= Math.min(nowMinute, sunset); m += 5) {
    const progress = (m - sunrise) / (sunset - sunrise)
    const cloud = 0.82 + 0.12 * Math.sin(m / 47) + 0.06 * Math.sin(m / 13)
    points.push({ m, w: Math.max(0, Math.round(3000 * Math.sin(progress * Math.PI) * cloud)) })
  }
  return points
}

const pad = (n: number) => String(n).padStart(2, '0')

const localDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const todayKey = () => `${KEY_PREFIX}${localDateStr(new Date())}`

/**
 * Registra una muestra (idempotente por minuto) y devuelve la serie del día.
 * De noche Solax sirve el snapshot congelado del atardecer ANTERIOR: si el
 * uploadTime no es de hoy se descarta, y cualquier punto "futuro" que haya
 * quedado guardado (fantasma de ese bug) se purga al leer.
 */
export function recordSample(uploadIso: string | null, watts: number): SeriesPoint[] {
  const now = new Date()
  const key = todayKey()
  const nowMinute = now.getHours() * 60 + now.getMinutes()

  let series: SeriesPoint[] = []
  try {
    series = JSON.parse(localStorage.getItem(key) ?? '[]') as SeriesPoint[]
  } catch {
    series = []
  }
  const beforePurge = series.length
  series = series.filter((p) => p.m <= nowMinute)

  const upload = uploadIso ? new Date(uploadIso) : now
  const uploadValid = !Number.isNaN(upload.getTime())
  const isToday = !uploadValid || localDateStr(upload) === localDateStr(now)

  let dirty = series.length !== beforePurge
  if (isToday) {
    const m = uploadValid ? upload.getHours() * 60 + upload.getMinutes() : nowMinute
    if (m <= nowMinute && !series.some((p) => p.m === m)) {
      series.push({ m, w: Math.max(0, Math.round(watts)) })
      series.sort((a, b) => a.m - b.m)
      dirty = true
    }
  }

  if (dirty) {
    try {
      localStorage.setItem(key, JSON.stringify(series))
      cleanupOldDays(key)
    } catch {
      // storage lleno o bloqueado: la curva sigue en memoria
    }
  }
  return series
}

function cleanupOldDays(currentKey: string): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith(KEY_PREFIX) && k !== currentKey) {
      localStorage.removeItem(k)
    }
  }
}
