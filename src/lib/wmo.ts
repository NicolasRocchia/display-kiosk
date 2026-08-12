// Códigos meteorológicos WMO que reporta Open-Meteo.

export interface WmoInfo {
  label: string
  icon: string
}

interface WmoEntry extends WmoInfo {
  iconNight?: string
}

const WMO: Record<number, WmoEntry> = {
  0: { label: 'Despejado', icon: '☀️', iconNight: '🌙' },
  1: { label: 'Mayormente despejado', icon: '🌤️', iconNight: '🌙' },
  2: { label: 'Parcialmente nublado', icon: '⛅', iconNight: '☁️' },
  3: { label: 'Nublado', icon: '☁️' },
  45: { label: 'Niebla', icon: '🌫️' },
  48: { label: 'Niebla escarchada', icon: '🌫️' },
  51: { label: 'Llovizna leve', icon: '🌦️' },
  53: { label: 'Llovizna', icon: '🌦️' },
  55: { label: 'Llovizna intensa', icon: '🌧️' },
  56: { label: 'Llovizna helada', icon: '🌧️' },
  57: { label: 'Llovizna helada intensa', icon: '🌧️' },
  61: { label: 'Lluvia leve', icon: '🌦️' },
  63: { label: 'Lluvia', icon: '🌧️' },
  65: { label: 'Lluvia intensa', icon: '🌧️' },
  66: { label: 'Lluvia helada', icon: '🌧️' },
  67: { label: 'Lluvia helada intensa', icon: '🌧️' },
  71: { label: 'Nevada leve', icon: '🌨️' },
  73: { label: 'Nevada', icon: '🌨️' },
  75: { label: 'Nevada intensa', icon: '❄️' },
  77: { label: 'Granos de nieve', icon: '❄️' },
  80: { label: 'Chaparrones leves', icon: '🌦️' },
  81: { label: 'Chaparrones', icon: '🌧️' },
  82: { label: 'Chaparrones fuertes', icon: '⛈️' },
  85: { label: 'Chaparrones de nieve', icon: '🌨️' },
  86: { label: 'Chaparrones de nieve fuertes', icon: '🌨️' },
  95: { label: 'Tormenta', icon: '⛈️' },
  96: { label: 'Tormenta con granizo', icon: '⛈️' },
  99: { label: 'Tormenta con granizo fuerte', icon: '⛈️' },
}

export function wmo(code: number, isDay: boolean): WmoInfo {
  const entry = WMO[code] ?? { label: `Código ${code}`, icon: '🌡️' }
  return {
    label: entry.label,
    icon: !isDay && entry.iconNight ? entry.iconNight : entry.icon,
  }
}
