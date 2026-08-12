// Contrato JSON entre el Worker (/api/*) y el frontend.

export type SourceId = "solar" | "weather" | "services";

export interface ApiOk<T> {
  ok: true;
  source: SourceId;
  /** ISO 8601 — momento en que el dato se obtuvo del upstream */
  updatedAt: string;
  ageSeconds: number;
  /** true = el upstream falló y este es el último dato bueno conocido */
  stale: boolean;
  data: T;
}

export interface ApiErr {
  ok: false;
  source: string;
  error: { code: string; message: string };
  data: null;
}

export type Envelope<T> = ApiOk<T> | ApiErr;

export interface SolarData {
  acPowerW: number;
  yieldTodayKwh: number;
  yieldTotalKwh: number;
  /** positivo = exportando a red, negativo = importando */
  feedInPowerW: number;
  /** consumo del hogar, derivado: generación − exportación (+ importación) */
  homeConsumptionW: number;
  /** kWh consumidos por la casa hoy (derivado de los acumulados de planta); null si la planta no reporta */
  homeConsumptionTodayKwh: number | null;
  /** % del consumo de hoy cubierto por los paneles (autosuficiencia); null si aún no hay consumo */
  solarSharePct: number | null;
  pv1PowerW: number | null;
  pv2PowerW: number | null;
  /** null en los tres campos de batería = instalación sin batería */
  batterySoc: number | null;
  batteryPowerW: number | null;
  batteryStatus: "normal" | "fault" | "disconnected" | null;
  inverterStatusCode: string;
  inverterStatusLabel: string;
  /** false ante estados de falla → el widget muestra badge de alerta */
  inverterOk: boolean;
  /** ISO 8601 con zona (UTC) — última subida de datos del inversor a SolaxCloud */
  inverterUploadTime: string | null;
  /** true = datos de ejemplo (no hay credenciales de SolaxCloud configuradas) */
  demo: boolean;
}

export interface HourForecast {
  /** ISO local sin zona, ej. "2026-08-10T14:00" */
  time: string;
  tempC: number;
  precipProbPct: number;
  weatherCode: number;
}

export interface DayForecast {
  /** "2026-08-11" */
  date: string;
  minC: number;
  maxC: number;
  weatherCode: number;
  precipProbPct: number;
}

export interface WeatherData {
  tempC: number;
  feelsLikeC: number;
  humidityPct: number;
  windKmh: number;
  /** código WMO (interpretado por src/lib/wmo.ts) */
  weatherCode: number;
  isDay: boolean;
  uvIndex: number;
  uvIndexMax: number;
  minC: number;
  maxC: number;
  /** ISO local sin zona, ej. "2026-08-10T07:38" */
  sunrise: string;
  sunset: string;
  /** próximas ~8 horas desde la hora actual */
  hourly: HourForecast[];
  /** hoy + próximos días (days[1] = mañana) */
  days: DayForecast[];
  /** "station" = medición de una estación local; "model" = interpolación de Open-Meteo */
  currentSource: "station" | "model";
  windDir: string | null;
  rainTodayMm: number | null;
  rainMonthMm: number | null;
  rainYearMm: number | null;
  radiationWm2: number | null;
}

export interface ServiceCheck {
  name: string;
  url: string;
  up: boolean;
  /** true = responde pero con estado degradado (solo checks tipo statuspage) */
  degraded: boolean;
  /** texto corto de estado cuando no está todo OK (ej. "Minor Service Outage") */
  detail: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
}

export type ServicesData = ServiceCheck[];
