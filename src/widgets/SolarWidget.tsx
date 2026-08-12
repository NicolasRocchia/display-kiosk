import { useEffect, useState } from 'react'
import type { SolarData } from '../../shared/api-types'
import { Stat } from '../components/Stat'
import { WidgetFrame } from '../components/WidgetFrame'
import { useWidgetData } from '../hooks/useWidgetData'
import { demoSeries, recordSample, type SeriesPoint } from '../lib/solarSeries'

const POLL_MS = 60 * 1000
/** por debajo de esto el inversor está de noche/reposo */
const IDLE_W = 10
/** importación sostenida que enciende el marco ámbar */
const TONE_IMPORT_W = 150
/** el inversor sube datos cada ~5 min; pasado esto se muestra aviso */
const UPLOAD_STALE_MIN = 15

function fmtPower(w: number): string {
  if (Math.abs(w) >= 1000) {
    const kw = w / 1000
    return `${kw.toFixed(Math.abs(kw) >= 10 ? 1 : 2)} kW`
  }
  return `${Math.round(w)} W`
}

// Marco según origen de la energía: verde = los paneles cubren el consumo,
// ámbar = se está comprando de la red; de noche sin marco (AMOLED).
function toneFor(d: SolarData): 'good' | 'warning' | null {
  if (d.acPowerW < IDLE_W) return null
  if (d.feedInPowerW < -TONE_IMPORT_W) return 'warning'
  return 'good'
}

export function SolarWidget() {
  const { data, status, updatedAt, errorMessage } = useWidgetData<SolarData>(
    '/api/solar',
    POLL_MS,
  )
  const [series, setSeries] = useState<SeriesPoint[]>([])

  useEffect(() => {
    if (!data) return
    setSeries(data.demo ? demoSeries() : recordSample(data.inverterUploadTime, data.acPowerW))
  }, [data])

  return (
    <WidgetFrame
      title="Solar"
      status={status}
      updatedAt={updatedAt}
      errorMessage={errorMessage}
      tone={data ? toneFor(data) : null}
    >
      {data && (
        <>
          <SolarGrid data={data} />
          {(data.batterySoc != null || !data.inverterOk || data.demo) && (
            <div className="stat-row">
              {data.batterySoc != null && (
                <Stat value={`${Math.round(data.batterySoc)}%`} label="batería" />
              )}
              {!data.inverterOk && (
                <span className="badge badge--critical">⚠ {data.inverterStatusLabel}</span>
              )}
              {data.demo && <span className="badge">datos de ejemplo</span>}
            </div>
          )}
          <div className="sparkline-box">
            <Sparkline series={series} />
          </div>
          <UploadNote iso={data.inverterUploadTime} idle={data.acPowerW < IDLE_W} />
        </>
      )}
    </WidgetFrame>
  )
}

// Cuadrícula 2×2: paneles | casa / red | % del día. Las flechas marcan el flujo
// (verde = solar, ámbar = comprando de red); el número queda siempre en tinta.
function SolarGrid({ data }: { data: SolarData }) {
  const generating = data.acPowerW >= IDLE_W
  const gridW = Math.abs(data.feedInPowerW)

  // Fila protagonista: paneles → casa (mismo tamaño); debajo: red y %.
  // Tinte sutil: verde en paneles, ámbar en red — se distinguen de un vistazo.
  return (
    <div className="solar-grid">
      <div className="flow__node">
        <div
          className={`flow__value flow__value--main flow__value--solar${generating ? '' : ' flow__value--idle'}`}
        >
          {fmtPower(data.acPowerW)}
        </div>
        <div className="stat__label">paneles</div>
      </div>
      <div className="flow__node">
        <div className="flow__value flow__value--main">
          <span className={`flow__arrow ${generating ? 'flow__arrow--good' : 'flow__arrow--off'}`}>
            ⟶
          </span>{' '}
          {fmtPower(data.homeConsumptionW)}
        </div>
        <div className="stat__label">casa</div>
      </div>
      <div className="flow__node">
        {/* valor crudo: así paneles + red = casa cierra a simple vista */}
        <div className="flow__value flow__value--grid">{fmtPower(gridW)}</div>
        <div className="stat__label">red</div>
      </div>
      {data.solarSharePct != null && (
        <div className="flow__node">
          <div className="flow__value">{data.solarSharePct}%</div>
          <div className="stat__label">del consumo de hoy, del sol</div>
        </div>
      )}
    </div>
  )
}

// Curva de generación del día (acumulada por el propio kiosk).
// Con menos de 4 muestras (~20 min de día) el trazo aún no dice nada.
// La ventana X va del primer punto del día hasta ahora (mínimo 3 h): la curva
// siempre llena el ancho y crece con el día, en vez de ser una púa sobre 24 h.
function Sparkline({ series }: { series: SeriesPoint[] }) {
  if (series.length < 4) return null
  const first = series[0]
  const last = series[series.length - 1]
  const startM = first.m
  const spanM = Math.max(last.m - first.m, 180)
  const maxW = Math.max(100, ...series.map((p) => p.w))
  const x = (m: number) => ((m - startM) / spanM) * 288
  const y = (w: number) => 40 - (w / maxW) * 38
  const line = series.map((p) => `${x(p.m).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ')
  const area = `M${x(first.m).toFixed(1)},40 L${line.replaceAll(' ', ' L')} L${x(last.m).toFixed(1)},40 Z`

  return (
    <svg className="sparkline" viewBox="0 0 288 40" preserveAspectRatio="none" role="img" aria-label="Generación del día">
      <path d={area} className="sparkline__area" />
      <polyline points={line} className="sparkline__line" />
    </svg>
  )
}

// De noche el inversor se apaga (el dongle no tiene energía) y es normal que no
// reporte: la nota solo aplica si dejó de reportar mientras generaba.
function UploadNote({ iso, idle }: { iso: string | null; idle: boolean }) {
  if (!iso || idle) return null
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < UPLOAD_STALE_MIN) return null
  return <p className="widget__note">Inversor sin reportar hace {min} min</p>
}
