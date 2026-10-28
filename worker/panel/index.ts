// /api/panel.png — el kiosk en e-ink: junta las tres fuentes (con el mismo cache que
// /api/*), acumula la curva solar del día y devuelve un PNG gris de 1448×1072.
//
// El Kindle lo pide cada ~5 min; el PNG se cachea en memoria PANEL_TTL_S para que
// recargas seguidas (o un segundo dispositivo) no vuelvan a rasterizar.

import type { AlertsData, ServicesData, SolarData, WeatherData } from "../../shared/api-types";
import { cachedFetch } from "../cache.ts";
import { sources, type Source } from "../sources/index.ts";
import { panelAssets } from "./assets.ts";
import { alertLine, heavyLoadWindow } from "./insights.ts";
import { renderPanelSvg, type Section } from "./layout.ts";
import { nightInfo } from "./night.ts";
import { renderSvgToGrayPng } from "./render.ts";
import { recordSample } from "./series.ts";

const PANEL_TTL_S = 240;
// Por encima del plazo de las fuentes (12 s en cache.ts) y por debajo del timeout
// del Kindle (curl --max-time 40): el Worker tiene que alcanzar a responder algo,
// aunque sea el PNG anterior, antes de que el dispositivo corte.
const BUILD_MAX_WAIT_MS = 25_000;

let cached: { png: Uint8Array; at: number } | null = null;
let inFlight: Promise<Uint8Array> | null = null;

export interface PanelResult {
  png: Uint8Array;
  /** true = no se pudo renderizar a tiempo y este es el PNG anterior */
  stale: boolean;
}

async function section<T>(id: "solar" | "weather" | "services" | "alerts", env: Env): Promise<Section<T>> {
  const src: Source<unknown> = sources[id];
  try {
    const r = await cachedFetch(src.id, src.ttlSeconds, () => src.fetch(env));
    return {
      data: r.data as T,
      stale: r.stale,
      ageSeconds: Math.round((Date.now() - r.updatedAt) / 1000),
    };
  } catch (err) {
    console.warn(`panel: ${id} sin datos:`, err instanceof Error ? err.message : err);
    return { data: null, stale: false, ageSeconds: 0 };
  }
}

async function buildPanel(env: Env): Promise<Uint8Array> {
  const now = new Date();
  const timeZone = env.TIMEZONE || "America/Argentina/Buenos_Aires";
  const [weather, solar, services, alerts] = await Promise.all([
    section<WeatherData>("weather", env),
    section<SolarData>("solar", env),
    section<ServicesData>("services", env),
    section<AlertsData>("alerts", env),
  ]);

  const series = solar.data
    ? recordSample(solar.data.inverterUploadTime, solar.data.acPowerW, solar.data.homeConsumptionW, timeZone, now)
    : [];

  const lat = parseFloat(env.LATITUDE);
  const lon = parseFloat(env.LONGITUDE);
  let night = null;
  try {
    night = nightInfo(weather.data, lat, lon, now, timeZone);
  } catch (err) {
    console.warn("panel: efemérides:", err instanceof Error ? err.message : err);
  }

  const svg = renderPanelSvg({
    weather,
    solar,
    services,
    series,
    now,
    timeZone,
    alert: alertLine(alerts.data, weather.data, now, timeZone),
    night,
    heavyLoad: heavyLoadWindow(solar.data, weather.data, now, timeZone),
  });
  return renderSvgToGrayPng(svg, panelAssets);
}

export async function panelPng(env: Env): Promise<PanelResult> {
  const now = Date.now();
  if (cached && now - cached.at < PANEL_TTL_S * 1000) return { png: cached.png, stale: false };

  // Un solo render aunque lleguen pedidos juntos. El plazo es de quien espera, no
  // de quien inició: si el cliente que disparó el render corta la conexión,
  // Workers cancela su I/O y la promesa compartida puede quedar pendiente para
  // siempre; sin plazo, todos los pedidos siguientes se colgarían con ella
  // (mismo problema que resolvió cache.ts el 2026-09-19).
  let running = inFlight;
  if (!running) {
    const started: Promise<Uint8Array> = buildPanel(env)
      .then((png) => {
        cached = { png, at: Date.now() };
        return png;
      })
      .finally(() => {
        if (inFlight === started) inFlight = null;
      });
    inFlight = started;
    running = started;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (inFlight === running) inFlight = null;
      console.warn(`panel: render sin respuesta en ${BUILD_MAX_WAIT_MS} ms; se descarta`);
      reject(new Error(`Render del panel sin respuesta en ${BUILD_MAX_WAIT_MS / 1000} s`));
    }, BUILD_MAX_WAIT_MS);
  });

  try {
    const png = await Promise.race([running, deadline]);
    return { png, stale: false };
  } catch (err) {
    if (cached) return { png: cached.png, stale: true };
    throw err;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
