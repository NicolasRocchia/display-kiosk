// Tests del panel e-ink. Se corren con `npm test` (Node ≥ 22, sin framework).
// Además de verificar, escriben una vista previa en /tmp/panel-preview.png (o en
// PANEL_PREVIEW) para mirar el layout sin deployar.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { ServicesData, SolarData, WeatherData } from "../shared/api-types";
import { CLOCK_BOX, PANEL_H, PANEL_W, renderPanelSvg } from "./panel/layout.ts";
import { alertLine, heavyLoadWindow } from "./panel/insights.ts";
import { nightInfo } from "./panel/night.ts";
import { renderSvgToGrayPng } from "./panel/render.ts";
import { recordSample, resetSeries } from "./panel/series.ts";
import { insideArgentina, parseCap, pointInPolygon } from "./sources/smn.ts";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "  ok  " : " FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
}

const TZ = "America/Argentina/Buenos_Aires";
// 27/10/2026 13:25 en Buenos Aires = 16:25Z
const now = new Date("2026-10-27T16:25:00Z");

// ---- serie solar: idempotente por minuto, descarta el snapshot nocturno de ayer, resetea por día
resetSeries();
let s = recordSample("2026-10-27T15:00:00Z", 400, 380, TZ, now);
s = recordSample("2026-10-27T15:00:00Z", 999, 999, TZ, now);
check("serie: misma muestra no se duplica", s.length === 1 && s[0].w === 400);
s = recordSample("2026-10-27T15:05:00Z", 450, 390, TZ, now);
check("serie: muestra nueva se agrega ordenada", s.length === 2 && s[1].m === 12 * 60 + 5);
s = recordSample("2026-10-26T21:30:00Z", 1200, 300, TZ, now);
check("serie: snapshot de ayer se descarta", s.length === 2);
s = recordSample("2026-10-27T18:00:00Z", 100, 100, TZ, now);
check("serie: muestra 'futura' se descarta", s.length === 2);
s = recordSample(null, 300, 300, TZ, new Date("2026-10-28T12:00:00Z"));
check("serie: cambio de día resetea", s.length === 1);

// ---- datos de ejemplo (parecidos a los del kiosk la tarde del 27/10)
const weather: WeatherData = {
  tempC: 20.3,
  feelsLikeC: 19.1,
  humidityPct: 61,
  windKmh: 11,
  weatherCode: 3,
  isDay: true,
  uvIndex: 5,
  uvIndexMax: 8,
  minC: 12,
  maxC: 20.4,
  sunrise: "2026-10-27T06:16",
  sunset: "2026-10-27T19:29",
  hourly: Array.from({ length: 36 }, (_, i) => {
    const t = new Date(Date.UTC(2026, 9, 27, 16 + i)); // 13:00 local en adelante
    const h = (13 + i) % 24;
    const iso = `${t.toISOString().slice(0, 10) === "2026-10-27" || 13 + i < 24 ? "2026-10-27" : "2026-10-28"}T${String(h).padStart(2, "0")}:00`;
    const sun = Math.max(0, Math.sin(((h - 6) / 13) * Math.PI)); // 0 de noche, 1 al mediodía
    return {
      time: iso,
      tempC: 19 + 2 * sun,
      precipProbPct: h >= 16 && h <= 18 ? 15 : 0,
      weatherCode: h >= 16 && h <= 18 ? 61 : h >= 14 && h <= 15 ? 2 : 3,
      cloudCoverPct: h === 22 ? 20 : h === 1 ? 45 : 60,
      radiationWm2: Math.round(900 * sun),
    };
  }),
  days: [
    { date: "2026-10-27", minC: 12, maxC: 20, weatherCode: 3, precipProbPct: 10, precipMm: 0, windMaxKmh: 25 },
    { date: "2026-10-28", minC: 1, maxC: 23, weatherCode: 2, precipProbPct: 33, precipMm: 1, windMaxKmh: 30 },
    { date: "2026-10-29", minC: 13, maxC: 25, weatherCode: 61, precipProbPct: 66, precipMm: 8, windMaxKmh: 35 },
    { date: "2026-10-30", minC: 14, maxC: 26, weatherCode: 95, precipProbPct: 26, precipMm: 3, windMaxKmh: 50 },
    { date: "2026-10-31", minC: 15, maxC: 27, weatherCode: 80, precipProbPct: 21, precipMm: 2, windMaxKmh: 20 },
    { date: "2026-11-01", minC: 17, maxC: 26, weatherCode: 1, precipProbPct: 76, precipMm: 12, windMaxKmh: 20 },
  ],
  currentSource: "station",
  windDir: "NNE",
  rainTodayMm: 0,
  rainMonthMm: 42,
  rainYearMm: 610,
  radiationWm2: 700,
};

const solar: SolarData = {
  acPowerW: 2050,
  yieldTodayKwh: 9.8,
  yieldTotalKwh: 1234,
  feedInPowerW: -1,
  homeConsumptionW: 404,
  homeConsumptionTodayKwh: 12.1,
  solarSharePct: 32,
  pv1PowerW: 200,
  pv2PowerW: 205,
  batterySoc: null,
  batteryPowerW: null,
  batteryStatus: null,
  inverterStatusCode: "2",
  inverterStatusLabel: "Normal",
  inverterOk: true,
  inverterUploadTime: "2026-10-27T16:21:00Z",
  demo: true,
};

const services: ServicesData = [
  ["Claude", 322, "ok"],
  ["GitHub", 180, "ok"],
  ["Cloudflare", 95, "ok"],
  ["Mi API", 126, "ok"],
  ["Mi web", 382, "down"],
  ["Statuspage demo", 410, "deg"],
  ["Backups", 73, "ok"],
  ["Home Assistant", 151, "ok"],
  ["Grafana", 240, "ok"],
  ["Mail", 240, "ok"],
  ["VPN", 62, "ok"],
].map(([name, latencyMs, state]) => ({
  name: String(name),
  up: state !== "down",
  degraded: state === "deg",
  detail: state === "deg" ? "Degraded Performance" : null,
  httpStatus: state === "down" ? 503 : 200,
  latencyMs: Number(latencyMs),
}));

// curva del día: campana de 7:00 a 13:25 con consumo plano
resetSeries();
let series: ReturnType<typeof recordSample> = [];
for (let m = 7 * 60; m <= 13 * 60 + 25; m += 5) {
  const t = (m - 7 * 60) / (12 * 60);
  const iso = new Date(Date.UTC(2026, 9, 27, Math.floor(m / 60) + 3, m % 60)).toISOString();
  series = recordSample(iso, 3000 * Math.sin(Math.PI * Math.min(t, 1)) ** 2, 350 + (m === 11 * 60 ? 2600 : 0), TZ, now);
}
check("serie: curva de ejemplo con muestras", series.length > 60, `${series.length} puntos`);

// ---- SMN: CAP parseado y filtrado por polígono
const cap = `<alert><sent>2026-10-27T08:47:59-03:00</sent><info><event>Tormentas</event><severity>Moderate</severity>
<onset>2026-10-28T15:00:00-03:00</onset><expires>2026-10-28T20:59:59-03:00</expires>
<description>El área será afectada por tormentas. Se esperan 20 a 40 mm.</description>
<area><polygon>-31.0,-62.5 -31.0,-61.5 -32.0,-61.5 -32.0,-62.5 -31.0,-62.5</polygon></area></info></alert>`;
const parsed = parseCap(cap);
check("smn: parsea evento, nivel y vigencia", parsed?.event === "Tormentas" && parsed.level === "amarilla" && parsed.expires.startsWith("2026-10-28T20"));
check("smn: primera oración de la descripción", parsed?.description === "El área será afectada por tormentas.");
check("smn: un punto dentro del polígono", !!parsed && pointInPolygon([-31.5, -62.0], parsed.polygons[0]));
check("smn: el Obelisco queda afuera", !!parsed && !pointInPolygon([-34.6037, -58.3816], parsed.polygons[0]));
check("smn: Buenos Aires está en el área del SMN", insideArgentina([-34.6037, -58.3816]));
check("smn: Madrid no", !insideArgentina([40.4168, -3.7038]));

// ---- alertas: SMN manda; sin SMN, la local (helada mañana, mín 1°)
const smnAlert = alertLine([{ event: "Tormentas", level: "naranja", onset: "2026-10-28T15:00:00-03:00", expires: "2026-10-28T20:59:59-03:00", description: "" }], weather, now, TZ);
check("alerta SMN con horario", smnAlert?.text === "Tormentas: mañana 15 a 21 h" && smnAlert.level === "naranja", smnAlert?.text);
const localAlert = alertLine([], weather, now, TZ);
check("alerta local de helada", localAlert?.text === "Helada mañana (mín 1°)", localAlert?.text);

// ---- ventana de cargas pesadas: calibrada con 2050 W a 700 W/m² (ratio ~2,9)
const heavy = heavyLoadWindow(solar, weather, now, TZ);
check("ventana solar de hoy", heavy === "cargas pesadas: mejor de 13 a 16 h", heavy ?? "null");
const heavyNight = heavyLoadWindow(solar, weather, new Date("2026-10-27T23:30:00Z"), TZ);
check("ventana solar de mañana cuando ya oscureció", heavyNight?.includes("mañana") === true, heavyNight ?? "null");

// ---- esta noche
const night = nightInfo(weather, -34.6037, -58.3816, now, TZ);
check("noche: luna con fase y porcentaje", night.moonPct >= 0 && night.moonPct <= 100 && night.moonLabel.startsWith("Luna") || night.moonLabel.startsWith("Cuarto"), `${night.moonLabel} ${night.moonPct}%`);
check("noche: nubes a las 22 y a la 1 del pronóstico", night.clouds22 === 20 && night.clouds01 === 45, `${night.clouds22} ${night.clouds01}`);
check("noche: veredicto por nubes", night.verdict.length > 0, night.verdict);
console.log(`       planetas a las 22: ${night.planets.join(", ") || "ninguno"} · luna sale ${night.moonrise} se pone ${night.moonset}`);

// ---- SVG
const svg = renderPanelSvg({
  weather: { data: weather, stale: false, ageSeconds: 120 },
  solar: { data: solar, stale: true, ageSeconds: 1500 },
  services: { data: services, stale: false, ageSeconds: 30 },
  series,
  now,
  timeZone: TZ,
  alert: localAlert,
  night,
  heavyLoad: heavy,
});
check("svg: tamaño declarado", svg.includes(`width="${PANEL_W}" height="${PANEL_H}"`));
check("svg: fecha en español", svg.includes("Martes, 27 de octubre"), svg.match(/[A-Z][a-z]+, \d+ de \w+/)?.[0]);
check("svg: amanecer/atardecer", svg.includes("06:16") && svg.includes("19:29"));
check("svg: etiqueta del clima", svg.includes("Nublado"));
check("svg: aviso de dato viejo en solar", svg.includes("sin datos nuevos hace 25 min"));
check("svg: servicio caído arriba", svg.includes(">caído<"));
check("svg: resumen de servicios", svg.includes("9 de 11 OK"));
check("svg: lluvia con mes y año", svg.includes("mes 42 mm · año 610 mm"));
check("svg: alerta de helada", svg.includes("Helada mañana (mín 1°)"));
check("svg: línea solar del día", svg.includes("Hoy 9,8 kWh") && svg.includes("cargas pesadas"));
check("svg: nota de modo demo", svg.includes("datos de ejemplo"));
check("svg: caja del reloj vacía", !svg.includes(`y="${CLOCK_BOX.y + 60}"`));
check("svg: escapa caracteres", !/<text[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;)/.test(svg));

// ---- PNG con fuentes y wasm del disco
const require = createRequire(import.meta.url);
const wasmPath = require.resolve("@resvg/resvg-wasm/index_bg.wasm");
const assets = {
  wasm: readFileSync(wasmPath),
  fonts: [
    readFileSync("worker/panel/fonts/Roboto-Regular.subset.ttf"),
    readFileSync("worker/panel/fonts/Roboto-Bold.subset.ttf"),
  ],
};
const png = await renderSvgToGrayPng(svg, assets);
check("png: firma", png[0] === 137 && png[1] === 80 && png[2] === 78 && png[3] === 71);
const ihdr = new DataView(png.buffer, png.byteOffset + 16, 9);
check("png: 1448×1072 gris 8 bits", ihdr.getUint32(0) === PANEL_W && ihdr.getUint32(4) === PANEL_H && png[24] === 8 && png[25] === 0);
check("png: tamaño razonable", png.length > 10_000 && png.length < 400_000, `${png.length} bytes`);

const out = process.env.PANEL_PREVIEW ?? "/tmp/panel-preview.png";
writeFileSync(out, png);
console.log(`  vista previa: ${out}`);

// ---- sin datos: cada bloque degrada por separado
const vacio = renderPanelSvg({
  weather: { data: null, stale: false, ageSeconds: 0 },
  solar: { data: null, stale: false, ageSeconds: 0 },
  services: { data: null, stale: false, ageSeconds: 0 },
  series: [],
  now,
  timeZone: TZ,
  alert: null,
  night: null,
  heavyLoad: null,
});
check("svg vacío: avisa por bloque", ["Clima: sin datos", "Solar: sin datos", "Servicios: sin datos"].every((t) => vacio.includes(t)));
await renderSvgToGrayPng(vacio, assets);
check("png vacío: también renderiza", true);

if (fallos > 0) {
  console.error(`\n${fallos} test(s) fallaron`);
  process.exit(1);
}
console.log("\npanel: todo ok");
