import type { ComponentType } from 'react'
import { ClockWidget } from './ClockWidget'
import { ServicesWidget } from './ServicesWidget'
import { SolarWidget } from './SolarWidget'
import { WeatherWidget } from './WeatherWidget'

export interface WidgetDescriptor {
  id: string
  /** nombre de grid-area declarado en theme.css (ambas orientaciones) */
  area: 'clock' | 'weather' | 'solar' | 'services'
  Component: ComponentType
}

// Agregar un widget = crear su componente (+ fuente en worker/sources si necesita datos)
// y sumar una entrada acá + su grid-area en theme.css.
export const registry: WidgetDescriptor[] = [
  { id: 'clock', area: 'clock', Component: ClockWidget },
  { id: 'weather', area: 'weather', Component: WeatherWidget },
  { id: 'solar', area: 'solar', Component: SolarWidget },
  { id: 'services', area: 'services', Component: ServicesWidget },
]
