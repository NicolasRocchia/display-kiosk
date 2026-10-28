// Cálculos derivados para el panel: alertas locales de respaldo y la ventana solar
// para cargas pesadas. Puros: reciben los datos ya normalizados y devuelven texto.

import type { AlertsData, SmnAlert, SolarData, WeatherData } from "../../shared/api-types";

export interface AlertLine {
  text: string;
  level: SmnAlert["level"];
}

const FROST_C = 3;
const GUST_KMH = 40;
const HEAT_C = 35;

/**
 * La alerta a mostrar: la del SMN más grave que esté vigente o por venir; si no hay,
 * una local derivada del pronóstico (helada, ráfagas, tormenta, calor), que el SMN no
 * cubre para fenómenos leves pero en el campo importan.
 */
export function alertLine(alerts: AlertsData | null, weather: WeatherData | null, now: Date, timeZone: string): AlertLine | null {
  const smn = alerts?.[0];
  if (smn) {
    return { text: `${smn.event}: ${whenLabel(smn.onset, smn.expires, now, timeZone)}`, level: smn.level };
  }
  if (!weather?.days) return null;

  const days = weather.days.slice(0, 3);
  const dayWord = (i: number) => (i === 0 ? "hoy" : i === 1 ? "mañana" : "pasado");
  for (const [i, d] of days.entries()) {
    if (d.weatherCode >= 95) return { text: `Tormenta ${dayWord(i)}`, level: "amarilla" };
  }
  for (const [i, d] of days.entries()) {
    if (d.minC <= FROST_C) return { text: `Helada ${dayWord(i)} (mín ${Math.round(d.minC)}°)`, level: "amarilla" };
  }
  for (const [i, d] of days.entries()) {
    if (d.windMaxKmh != null && d.windMaxKmh >= GUST_KMH)
      return { text: `Ráfagas ${dayWord(i)} de ${Math.round(d.windMaxKmh)} km/h`, level: "amarilla" };
  }
  for (const [i, d] of days.entries()) {
    if (d.maxC >= HEAT_C) return { text: `Calor ${dayWord(i)} (máx ${Math.round(d.maxC)}°)`, level: "amarilla" };
  }
  return null;
}

// "mañana 15 a 21 h" / "hoy hasta las 21 h" / "jueves 9 a 15 h"
function whenLabel(onsetIso: string, expiresIso: string, now: Date, timeZone: string): string {
  const onset = new Date(onsetIso);
  const expires = new Date(expiresIso);
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hourOf = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(d)) % 24;
  const today = dayOf(now);
  const tomorrow = dayOf(new Date(now.getTime() + 86_400_000));
  const onsetDay = dayOf(onset);
  const dayName = onsetDay === today ? "hoy" : onsetDay === tomorrow ? "mañana" : new Intl.DateTimeFormat("es-AR", { timeZone, weekday: "long" }).format(onset);
  const endH = hourOf(expires) + (expires.getMinutes() >= 59 ? 1 : 0);
  if (onset.getTime() <= now.getTime()) return `${dayName} hasta las ${endH} h`;
  return `${dayName} ${hourOf(onset)} a ${endH} h`;
}

/** Potencia (W) por cada W/m² cuando no hay con qué calibrar: ~3,7 kWp con pérdidas */
const DEFAULT_W_PER_WM2 = 2.9;
/** lo que consume un termotanque o un lavarropas calentando */
const HEAVY_LOAD_W = 2000;

/**
 * Ventana de horas en que la generación prevista supera una carga pesada. La relación
 * W por W/m² se calibra con el instante actual (inversor contra la radiación medida por
 * la estación local, si hay) y se aplica al pronóstico de radiación de Open-Meteo.
 * Sin estación se usa un valor típico para ~3,7 kWp. Devuelve texto listo.
 */
export function heavyLoadWindow(solar: SolarData | null, weather: WeatherData | null, now: Date, timeZone: string): string | null {
  const hourly = weather?.hourly?.filter((h) => h.radiationWm2 != null) ?? [];
  if (hourly.length === 0) return null;

  let ratio = DEFAULT_W_PER_WM2;
  if (solar && weather?.radiationWm2 != null && weather.radiationWm2 > 150 && solar.acPowerW > 50) {
    ratio = Math.min(4, Math.max(1, solar.acPowerW / weather.radiationWm2));
  }

  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const today = dayOf(now);
  const tomorrow = dayOf(new Date(now.getTime() + 86_400_000));
  const nowHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(now)) % 24;

  const windowFor = (day: string, fromHour: number) => {
    const hours = hourly
      .filter((h) => h.time.startsWith(day) && Number(h.time.slice(11, 13)) >= fromHour)
      .map((h) => ({ h: Number(h.time.slice(11, 13)), ok: (h.radiationWm2 ?? 0) * ratio >= HEAVY_LOAD_W }));
    // bloque contiguo más largo de horas "ok"
    let best: [number, number] | null = null;
    let start: number | null = null;
    for (const [i, x] of hours.entries()) {
      if (x.ok && start === null) start = x.h;
      const last = i === hours.length - 1;
      if ((!x.ok || last) && start !== null) {
        const end = x.ok && last ? x.h + 1 : x.h;
        if (!best || end - start > best[1] - best[0]) best = [start, end];
        start = null;
      }
    }
    return best;
  };

  const todayWin = windowFor(today, nowHour);
  if (todayWin && todayWin[1] - todayWin[0] >= 2) return `cargas pesadas: mejor de ${todayWin[0]} a ${todayWin[1]} h`;
  const tomorrowWin = windowFor(tomorrow, 0);
  if (tomorrowWin && tomorrowWin[1] - tomorrowWin[0] >= 2) return `cargas pesadas: mañana de ${tomorrowWin[0]} a ${tomorrowWin[1]} h`;
  if (todayWin || tomorrowWin) return "cargas pesadas: ventana solar corta";
  return "cargas pesadas: sin ventana solar hasta mañana";
}
