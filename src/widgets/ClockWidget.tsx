import { useEffect, useState } from 'react'
import type { WeatherData } from '../../shared/api-types'
import { useWidgetData } from '../hooks/useWidgetData'

const WEATHER_POLL_MS = 10 * 60 * 1000

// "2026-08-10T07:38" → "07:38"
const hhmm = (isoLocal: string) => isoLocal.slice(11, 16)

export function ClockWidget() {
  const [now, setNow] = useState(() => new Date())
  // El sol vive junto a la hora; el Worker cachea /api/weather así que el fetch extra es gratis.
  const { data: weather } = useWidgetData<WeatherData>('/api/weather', WEATHER_POLL_MS)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const rawDate = now.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const date = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)

  return (
    <div className="clock">
      <div className="clock__time">
        {time}
        <span className="clock__seconds">{seconds}</span>
      </div>
      <div className="clock__date">{date}</div>
      {weather?.sunrise && (
        <div className="clock__sun">
          ↑{hhmm(weather.sunrise)} ↓{hhmm(weather.sunset)}
        </div>
      )}
    </div>
  )
}
