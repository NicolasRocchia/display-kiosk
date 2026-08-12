import type { ServicesData } from '../../shared/api-types'
import { WidgetFrame } from '../components/WidgetFrame'
import { useWidgetData } from '../hooks/useWidgetData'

const POLL_MS = 60 * 1000

type Check = ServicesData[number]

const dotTone = (s: Check) => (!s.up ? 'critical' : s.degraded ? 'warning' : 'good')

const metaText = (s: Check) => {
  if (!s.up) return s.detail ?? 'caído'
  if (s.degraded) return s.detail ?? 'degradado'
  return `${s.latencyMs} ms`
}

export function ServicesWidget() {
  const { data, status, updatedAt, errorMessage } = useWidgetData<ServicesData>(
    '/api/services',
    POLL_MS,
  )

  return (
    <WidgetFrame
      title="Servicios"
      status={status}
      updatedAt={updatedAt}
      errorMessage={errorMessage}
    >
      {data &&
        (data.length === 0 ? (
          <p className="widget__note">Sin servicios configurados (MONITOR_URLS)</p>
        ) : (
          <ul className="services">
            {data.map((s) => (
              <li key={s.url} className="services__item">
                {/* punto de color + texto: el estado nunca depende del color solo */}
                <span className={`services__dot services__dot--${dotTone(s)}`} />
                <span className="services__name">{s.name}</span>
                <span className="services__meta">{metaText(s)}</span>
              </li>
            ))}
          </ul>
        ))}
    </WidgetFrame>
  )
}
