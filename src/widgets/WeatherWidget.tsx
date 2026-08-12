import type { WeatherData } from '../../shared/api-types'
import { Stat } from '../components/Stat'
import { WidgetFrame } from '../components/WidgetFrame'
import { useWidgetData } from '../hooks/useWidgetData'
import { wmo } from '../lib/wmo'

const POLL_MS = 10 * 60 * 1000

// "2026-08-10T07:38" → "07:38"
const hhmm = (isoLocal: string) => isoLocal.slice(11, 16)

export function WeatherWidget() {
  const { data, status, updatedAt, errorMessage } = useWidgetData<WeatherData>(
    '/api/weather',
    POLL_MS,
  )

  const info = data ? wmo(data.weatherCode, data.isDay) : null

  return (
    <WidgetFrame status={status} updatedAt={updatedAt} errorMessage={errorMessage}>
      {data && info && (
        <>
          <div className="weather__now">
            <span className="weather__icon">{info.icon}</span>
            <span className="weather__temp">{Math.round(data.tempC)}°</span>
            <div className="weather__cond">
              <div>{info.label}</div>
              <div className="weather__feels">
                Sensación {Math.round(data.feelsLikeC)}° · Humedad {Math.round(data.humidityPct)}%
              </div>
            </div>
          </div>
          <div className="stat-row">
            <Stat value={`${Math.round(data.minC)}° / ${Math.round(data.maxC)}°`} label="mín / máx" />
            <Stat
              value={String(Math.round(data.windKmh))}
              unit="km/h"
              label={data.windDir ? `viento del ${data.windDir}` : 'viento'}
            />
            {data.radiationWm2 != null && (
              <Stat value={String(Math.round(data.radiationWm2))} unit="W/m²" label="radiación" />
            )}
            {data.rainTodayMm != null && data.rainTodayMm > 0 && (
              <Stat value={data.rainTodayMm.toFixed(1)} unit="mm" label="lluvia hoy" />
            )}
          </div>
          <Hourly data={data} />
          <DaysAhead data={data} />
        </>
      )}
    </WidgetFrame>
  )
}

// Próximos 5 días: icono, mín/máx y lluvia si amenaza.
function DaysAhead({ data }: { data: WeatherData }) {
  if (!data.days || data.days.length < 2) return null
  return (
    <div className="daily">
      {data.days.slice(1, 6).map((d, i) => (
        <div key={d.date} className="daily__col">
          <div className="daily__name">{i === 0 ? 'Mañana' : dayName(d.date)}</div>
          <div className="daily__icon">{wmo(d.weatherCode, true).icon}</div>
          <div className="daily__temps">
            {Math.round(d.minC)}° / {Math.round(d.maxC)}°
          </div>
          <div className="daily__rain">
            {d.precipProbPct >= 10 ? `${Math.round(d.precipProbPct)}%` : ' '}
          </div>
        </div>
      ))}
    </div>
  )
}

function dayName(date: string): string {
  // T12:00 evita el corrimiento de día por zona horaria
  const name = new Date(`${date}T12:00`).toLocaleDateString('es-AR', { weekday: 'long' })
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// Próximas horas: columna por hora con icono, temperatura y lluvia (si amenaza).
// data.hourly puede faltar si el Worker sirve una entrada cacheada anterior al campo.
function Hourly({ data }: { data: WeatherData }) {
  if (!data.hourly || data.hourly.length === 0) return null
  const sunriseHm = hhmm(data.sunrise)
  const sunsetHm = hhmm(data.sunset)
  return (
    <div className="hourly">
      {data.hourly.slice(0, 6).map((h) => {
        const hm = hhmm(h.time)
        const isDay = hm >= sunriseHm && hm < sunsetHm
        return (
          <div key={h.time} className="hourly__col">
            <div className="hourly__hour">{h.time.slice(11, 13)}h</div>
            <div className="hourly__icon">{wmo(h.weatherCode, isDay).icon}</div>
            <div className="hourly__temp">{Math.round(h.tempC)}°</div>
            <div className="hourly__rain">
              {h.precipProbPct >= 10 ? `${Math.round(h.precipProbPct)}%` : ' '}
            </div>
          </div>
        )
      })}
    </div>
  )
}
