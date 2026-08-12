import type { WeatherData } from "../../shared/api-types";
import { stations, type StationSnapshot } from "./stations";

const TIMEOUT_MS = 8_000;

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    uv_index: number;
    is_day: number;
  };
  daily: {
    time: string[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_probability_max: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
}

/**
 * Clima híbrido: lo medido sale de la estación local (si hay una configurada en
 * LOCAL_STATION) y lo modelado —icono del cielo, UV, pronósticos— de Open-Meteo.
 * Si la estación falla o reporta viejo, Open-Meteo cubre todo.
 */
export async function fetchWeather(env: Env): Promise<WeatherData> {
  const [om, station] = await Promise.all([fetchOpenMeteo(env), fetchStation(env)]);

  return {
    tempC: station?.tempC ?? om.current.temperature_2m,
    feelsLikeC: station?.feelsLikeC ?? om.current.apparent_temperature,
    humidityPct: station?.humidityPct ?? om.current.relative_humidity_2m,
    windKmh: station?.windKmh ?? om.current.wind_speed_10m,
    weatherCode: om.current.weather_code,
    isDay: om.current.is_day === 1,
    uvIndex: om.current.uv_index,
    uvIndexMax: om.daily.uv_index_max[0] ?? 0,
    minC: om.daily.temperature_2m_min[0] ?? om.current.temperature_2m,
    maxC: om.daily.temperature_2m_max[0] ?? om.current.temperature_2m,
    sunrise: om.daily.sunrise[0] ?? "",
    sunset: om.daily.sunset[0] ?? "",
    hourly: (om.hourly?.time ?? []).map((time, i) => ({
      time,
      tempC: om.hourly.temperature_2m[i] ?? 0,
      precipProbPct: om.hourly.precipitation_probability[i] ?? 0,
      weatherCode: om.hourly.weather_code[i] ?? 0,
    })),
    days: (om.daily?.time ?? []).map((date, i) => ({
      date,
      minC: om.daily.temperature_2m_min[i] ?? 0,
      maxC: om.daily.temperature_2m_max[i] ?? 0,
      weatherCode: om.daily.weather_code[i] ?? 0,
      precipProbPct: om.daily.precipitation_probability_max[i] ?? 0,
    })),
    currentSource: station ? "station" : "model",
    windDir: station?.windDir ?? null,
    rainTodayMm: station?.rainTodayMm ?? null,
    rainMonthMm: station?.rainMonthMm ?? null,
    rainYearMm: station?.rainYearMm ?? null,
    radiationWm2: station?.radiationWm2 ?? null,
  };
}

// Nunca rechaza: una estación caída no debe voltear el widget entero.
async function fetchStation(env: Env): Promise<StationSnapshot | null> {
  const id = env.LOCAL_STATION?.trim();
  if (!id) return null;
  const adapter = stations[id];
  if (!adapter) return null;
  return adapter(env.TIMEZONE).catch(() => null);
}

async function fetchOpenMeteo(env: Env): Promise<OpenMeteoResponse> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", env.LATITUDE);
  url.searchParams.set("longitude", env.LONGITUDE);
  url.searchParams.set("timezone", env.TIMEZONE);
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,uv_index,is_day",
  );
  url.searchParams.set(
    "daily",
    "sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
  );
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
  // hourly: solo las próximas 8 horas desde la hora en curso; daily: hoy + 5 días
  url.searchParams.set("forecast_hours", "8");
  url.searchParams.set("forecast_days", "6");

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  return res.json<OpenMeteoResponse>();
}
