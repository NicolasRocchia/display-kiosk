import type { AlertsData, ServicesData, SolarData, SourceId, WeatherData } from "../../shared/api-types";
import { fetchServices } from "./services";
import { fetchAlerts } from "./smn";
import { fetchSolar } from "./solax";
import { fetchWeather } from "./weather";

export interface Source<T> {
  id: SourceId;
  ttlSeconds: number;
  fetch: (env: Env) => Promise<T>;
}

// Agregar una fuente nueva = un archivo en worker/sources/ + una entrada acá.
export const sources = {
  solar: { id: "solar", ttlSeconds: 60, fetch: fetchSolar } satisfies Source<SolarData>,
  weather: { id: "weather", ttlSeconds: 600, fetch: fetchWeather } satisfies Source<WeatherData>,
  services: { id: "services", ttlSeconds: 60, fetch: fetchServices } satisfies Source<ServicesData>,
  // Solo tiene sentido en Argentina: fuera del país devuelve [] sin salir a la red.
  alerts: { id: "alerts", ttlSeconds: 900, fetch: fetchAlerts } satisfies Source<AlertsData>,
} as const;

export type KnownSourceId = keyof typeof sources;

export function isKnownSource(id: string): id is KnownSourceId {
  return id in sources;
}
