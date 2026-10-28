// "Esta noche": luna, planetas y nubes, para decidir si vale la pena sacar el telescopio.
// Efemérides con astronomy-engine (cálculo puro, sin red); nubes del pronóstico horario
// de Open-Meteo que ya trae /api/weather.

import { Body, Equator, Horizon, Illumination, MoonPhase, Observer, SearchRiseSet } from "astronomy-engine";
import type { WeatherData } from "../../shared/api-types";

export interface NightInfo {
  /** "Luna creciente", "Luna llena"… */
  moonLabel: string;
  /** fracción iluminada, 0-100 */
  moonPct: number;
  /** "HH:MM" locales, o null si no sale/se pone en las próximas 24 h */
  moonrise: string | null;
  moonset: string | null;
  /** planetas con más de 10° sobre el horizonte a las 22:00 locales */
  planets: string[];
  /** nubosidad prevista, 0-100, a las 22:00 y a la 01:00 (null si el pronóstico no la trae) */
  clouds22: number | null;
  clouds01: number | null;
  verdict: string;
}

const PLANETS: Array<[Body, string]> = [
  [Body.Venus, "Venus"],
  [Body.Mars, "Marte"],
  [Body.Jupiter, "Júpiter"],
  [Body.Saturn, "Saturno"],
];

export function nightInfo(weather: WeatherData | null, lat: number, lon: number, now: Date, timeZone: string): NightInfo {
  const observer = new Observer(lat, lon, 100);
  const at22 = localDateAt(now, timeZone, 22);

  // Luna
  const illum = Illumination(Body.Moon, at22);
  const phase = MoonPhase(at22); // 0 nueva, 90 creciente, 180 llena, 270 menguante
  const moonPct = Math.round(illum.phase_fraction * 100);
  const moonrise = SearchRiseSet(Body.Moon, observer, +1, now, 1);
  const moonset = SearchRiseSet(Body.Moon, observer, -1, now, 1);

  // Planetas sobre el horizonte a las 22
  const planets = PLANETS.filter(([body]) => {
    const eq = Equator(body, at22, observer, true, true);
    const hor = Horizon(at22, observer, eq.ra, eq.dec, "normal");
    return hor.altitude > 10;
  }).map(([, name]) => name);

  // Nubes
  const clouds22 = cloudsAt(weather, localIsoHour(now, timeZone, 22, 0));
  const clouds01 = cloudsAt(weather, localIsoHour(now, timeZone, 1, 1));

  return {
    moonLabel: moonLabel(phase),
    moonPct,
    moonrise: moonrise ? hhmm(moonrise.date, timeZone) : null,
    moonset: moonset ? hhmm(moonset.date, timeZone) : null,
    planets,
    clouds22,
    clouds01,
    verdict: verdict(clouds22, clouds01, moonPct),
  };
}

function moonLabel(phaseDeg: number): string {
  if (phaseDeg < 22.5 || phaseDeg >= 337.5) return "Luna nueva";
  if (phaseDeg < 67.5) return "Luna creciente";
  if (phaseDeg < 112.5) return "Cuarto creciente";
  if (phaseDeg < 157.5) return "Luna creciente";
  if (phaseDeg < 202.5) return "Luna llena";
  if (phaseDeg < 247.5) return "Luna menguante";
  if (phaseDeg < 292.5) return "Cuarto menguante";
  return "Luna menguante";
}

function verdict(c22: number | null, c01: number | null, moonPct: number): string {
  if (c22 === null && c01 === null) return "Sin pronóstico de nubes";
  const worst = Math.max(c22 ?? 0, c01 ?? 0);
  if (worst <= 30) return moonPct >= 80 ? "Cielo despejado, luna brillante" : "Buena noche para el telescopio";
  if (worst <= 60) return "Noche con nubes variables";
  return "Noche nublada";
}

function cloudsAt(weather: WeatherData | null, isoLocalHour: string): number | null {
  const h = weather?.hourly?.find((x) => x.time.startsWith(isoLocalHour));
  return h?.cloudCoverPct ?? null;
}

/** "YYYY-MM-DDTHH" local para hoy (+dayOffset) a la hora dada; mismo formato que Open-Meteo */
function localIsoHour(now: Date, timeZone: string, hour: number, dayOffset: number): string {
  const d = new Date(now.getTime() + dayOffset * 86_400_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return `${day}T${String(hour).padStart(2, "0")}`;
}

/** Instante UTC que corresponde a hoy a las `hour`:00 en la zona dada */
function localDateAt(now: Date, timeZone: string, hour: number): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  // corregir por el desfase de la zona (sin DST en Argentina, pero se calcula igual)
  const offsetMin = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMin * 60_000);
}

function tzOffsetMinutes(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - d.getTime()) / 60_000);
}

function hhmm(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
