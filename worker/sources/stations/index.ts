import { fetchUtnSanFrancisco } from "./utnSanFrancisco";

/**
 * Medición de una estación meteorológica local. Todo es opcional salvo
 * temperatura y humedad: lo que la estación no dé lo completa Open-Meteo.
 */
export interface StationSnapshot {
  tempC: number;
  feelsLikeC: number;
  humidityPct: number;
  windKmh: number;
  windDir: string | null;
  rainTodayMm: number | null;
  rainMonthMm: number | null;
  rainYearMm: number | null;
  radiationWm2: number | null;
}

/**
 * Adaptadores disponibles, elegidos con la var LOCAL_STATION.
 *
 * ¿Tenés una estación cerca con datos públicos? Copiá utnSanFrancisco.ts,
 * adaptá el parseo a su formato y sumá la entrada acá. Dos reglas: respetá
 * el TTL de 10 min del cache (no golpees un servicio ajeno) y descartá los
 * snapshots viejos, así una estación colgada cae a Open-Meteo sola.
 */
export const stations: Record<string, (timeZone: string) => Promise<StationSnapshot>> = {
  "utn-san-francisco": fetchUtnSanFrancisco,
};
