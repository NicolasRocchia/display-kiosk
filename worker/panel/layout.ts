// Layout del panel e-ink: un SVG apaisado de 1448×1072 (Kindle Paperwhite 10ª gen
// girado) en blanco y negro, con los mismos datos que los widgets del kiosk.
//
// La caja superior derecha queda vacía a propósito: ahí el Kindle pinta la hora
// cada minuto por su cuenta (refresco parcial), y el PNG completo se repinta cada
// ~5 min. Ver el script del Kindle (/mnt/us/panel/panel.sh).
//
// Sin CSS ni fuentes externas: resvg solo conoce las fuentes que se le pasan
// (Roboto Regular/Bold, en ./fonts).

import type { ServicesData, SolarData, WeatherData } from "../../shared/api-types";
import { iconForWmo, weatherIcon } from "./icons.ts";
import type { AlertLine } from "./insights.ts";
import type { NightInfo } from "./night.ts";
import type { SeriesPoint } from "./series.ts";

export const PANEL_W = 1448;
export const PANEL_H = 1072;

export interface Section<T> {
  data: T | null;
  /** true = el upstream falló y este es el último dato bueno */
  stale: boolean;
  ageSeconds: number;
}

export interface PanelInput {
  weather: Section<WeatherData>;
  solar: Section<SolarData>;
  services: Section<ServicesData>;
  series: SeriesPoint[];
  now: Date;
  timeZone: string;
  /** alerta a mostrar (SMN o local), ya resuelta por insights.ts */
  alert: AlertLine | null;
  night: NightInfo | null;
  /** línea de cargas pesadas, ya resuelta por insights.ts */
  heavyLoad: string | null;
}

const INK = "#000";
// Grises oscuros: en e-ink los claros se lavan. El gráfico solar conserva los suyos.
const GRAY = "#000";
const LIGHT = "#555555";
const SPARK_GRAY = "#6e6e6e";
const SPARK_LIGHT = "#b0b0b0";
const M = 40;
const LX0 = M;
const LX1 = 860;
const RX0 = 920;
const RX1 = PANEL_W - M;
const SOLAR_Y = 866;
/** Caja del reloj que pinta el Kindle: coincide con CLK_* de panel.sh */
export const CLOCK_BOX = { x: RX0, y: M, w: RX1 - RX0, h: 150 };
/** filas de la grilla de servicios OK (2 columnas) */
const MAX_SERVICE_ROWS = 5;
/** lado de los íconos del pronóstico por horas y por días */
const FORECAST_ICON = 84;
const IDLE_W = 10;
const UPLOAD_STALE_MIN = 15;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Anchor = "start" | "middle" | "end";

/** Texto con `top` = borde superior aproximado de las mayúsculas/dígitos. */
function text(
  x: number,
  top: number,
  s: string,
  size: number,
  opts: { bold?: boolean; fill?: string; anchor?: Anchor } = {},
): string {
  const { bold = false, fill = INK, anchor = "start" } = opts;
  const y = top + size * 0.72;
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}

const hline = (x1: number, x2: number, y: number, color = LIGHT) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="2"/>`;

const hhmm = (isoLocal: string) => isoLocal.slice(11, 16);

function fmtPower(w: number): string {
  if (Math.abs(w) >= 1000) {
    const kw = w / 1000;
    return `${kw.toFixed(Math.abs(kw) >= 10 ? 1 : 2)} kW`;
  }
  return `${Math.round(w)} W`;
}

function dayName(date: string): string {
  const name = new Date(`${date}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "long",
    timeZone: "UTC",
  });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function staleNote(section: Section<unknown>, x: number, top: number, anchor: Anchor = "start"): string {
  if (!section.stale) return "";
  const min = Math.max(1, Math.round(section.ageSeconds / 60));
  return text(x, top, `sin datos nuevos hace ${min} min`, 24, { anchor });
}

function missing(x: number, top: number, what: string): string {
  return text(x, top, `${what}: sin datos`, 30);
}

// ---------------------------------------------------------------- clima

function weatherBlock(section: Section<WeatherData>, alert: AlertLine | null): string {
  const d = section.data;
  if (!d) return missing(LX0, 90, "Clima");
  const out: string[] = [];

  const label = weatherLabel(d.weatherCode);
  out.push(weatherIcon(iconForWmo(d.weatherCode, d.isDay), LX0 + 70, 110, 140));
  out.push(text(LX0 + 150, 30, `${Math.round(d.tempC)}°`, 190, { bold: true }));
  const condX = 560;
  const condSize = label.length <= 10 ? 48 : label.length <= 16 ? 36 : 28;
  out.push(text(condX, 50, label, condSize, { bold: true }));
  out.push(text(condX, 110, `Sensación ${Math.round(d.feelsLikeC)}°`, 30));
  out.push(text(condX, 148, `Humedad ${Math.round(d.humidityPct)}%`, 30));
  if (alert) {
    // marcador "!" y texto; naranja y roja van más grandes
    const big = alert.level !== "amarilla";
    out.push(
      `<rect x="${condX}" y="188" width="28" height="24" rx="4" fill="${INK}"/><text x="${condX + 14}" y="207" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">!</text>`,
    );
    out.push(text(condX + 38, 189, alert.text, big ? 28 : 24, { bold: true }));
  }
  out.push(staleNote(section, LX1, 10, "end"));

  // Fila de stats: mín/máx · viento · lluvia (hoy, mes, año)
  const rainValue =
    d.rainTodayMm != null
      ? `${d.rainTodayMm.toFixed(d.rainTodayMm >= 10 ? 0 : 1).replace(".", ",")} mm`
      : `${Math.round(d.days?.[0]?.precipMm ?? 0)} mm`;
  const stats: Array<[string, string, string?]> = [
    [`${Math.round(d.minC)}° / ${Math.round(d.maxC)}°`, "mín / máx"],
    [`${Math.round(d.windKmh)} km/h`, d.windDir ? `viento del ${d.windDir}` : "viento"],
    [rainValue, d.rainTodayMm != null ? "lluvia hoy" : "lluvia prevista hoy", rainTotals(d)],
  ];
  const statX = [LX0, 300, 560];
  stats.forEach(([v, l, l2], i) => {
    out.push(text(statX[i], 250, v, 44, { bold: true }));
    out.push(text(statX[i], 304, l, 26));
    if (l2) out.push(text(statX[i], 334, l2, 24));
  });

  // Por horas
  let y = 364;
  out.push(hline(LX0, LX1, y));
  const hourly = (d.hourly ?? []).slice(0, 6);
  if (hourly.length > 0) {
    const sunriseHm = hhmm(d.sunrise);
    const sunsetHm = hhmm(d.sunset);
    const cw = (LX1 - LX0) / 6;
    hourly.forEach((h, i) => {
      const cx = LX0 + cw * i + cw / 2;
      const hm = hhmm(h.time);
      const isDay = hm >= sunriseHm && hm < sunsetHm;
      out.push(text(cx, y + 14, `${h.time.slice(11, 13)}h`, 28, { anchor: "middle" }));
      out.push(weatherIcon(iconForWmo(h.weatherCode, isDay), cx, y + 88, FORECAST_ICON));
      out.push(text(cx, y + 134, `${Math.round(h.tempC)}°`, 34, { bold: true, anchor: "middle" }));
      if (h.precipProbPct >= 10) {
        out.push(text(cx, y + 176, `${Math.round(h.precipProbPct)}%`, 26, { anchor: "middle" }));
      }
    });
  }

  // Por días
  y = 584;
  out.push(hline(LX0, LX1, y));
  const days = (d.days ?? []).slice(1, 6);
  if (days.length > 0) {
    const cw = (LX1 - LX0) / 5;
    days.forEach((day, i) => {
      const cx = LX0 + cw * i + cw / 2;
      out.push(text(cx, y + 14, i === 0 ? "Mañana" : dayName(day.date), 28, { anchor: "middle" }));
      out.push(weatherIcon(iconForWmo(day.weatherCode, true), cx, y + 88, FORECAST_ICON));
      out.push(
        text(cx, y + 134, `${Math.round(day.minC)}° / ${Math.round(day.maxC)}°`, 30, {
          bold: true,
          anchor: "middle",
        }),
      );
      if (day.precipProbPct >= 10) {
        const mm = day.precipMm != null && day.precipMm >= 0.5 ? ` · ${Math.round(day.precipMm)} mm` : "";
        out.push(text(cx, y + 176, `${Math.round(day.precipProbPct)}%${mm}`, 26, { anchor: "middle" }));
      }
    });
  }
  return out.join("");
}

function rainTotals(d: WeatherData): string | undefined {
  const parts: string[] = [];
  if (d.rainMonthMm != null) parts.push(`mes ${Math.round(d.rainMonthMm)} mm`);
  if (d.rainYearMm != null) parts.push(`año ${Math.round(d.rainYearMm)} mm`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// Mismas etiquetas que src/lib/wmo.ts (duplicadas a propósito: ese módulo es del
// frontend y trae emoji; acá solo hace falta el texto).
function weatherLabel(code: number): string {
  const labels: Record<number, string> = {
    0: "Despejado",
    1: "Mayormente despejado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla escarchada",
    51: "Llovizna leve",
    53: "Llovizna",
    55: "Llovizna intensa",
    56: "Llovizna helada",
    57: "Llovizna helada intensa",
    61: "Lluvia leve",
    63: "Lluvia",
    65: "Lluvia intensa",
    66: "Lluvia helada",
    67: "Lluvia helada intensa",
    71: "Nevada leve",
    73: "Nevada",
    75: "Nevada intensa",
    77: "Granos de nieve",
    80: "Chaparrones leves",
    81: "Chaparrones",
    82: "Chaparrones fuertes",
    85: "Chaparrones de nieve",
    86: "Chaparrones de nieve fuertes",
    95: "Tormenta",
    96: "Tormenta con granizo",
    99: "Tormenta con granizo fuerte",
  };
  return labels[code] ?? `Código ${code}`;
}

// ---------------------------------------------------------------- reloj y fecha

/** Flecha vertical de 22 px centrada en (cx, cy): arriba = amanecer, abajo = atardecer. */
function arrow(cx: number, cy: number, up: boolean): string {
  const tip = up ? cy - 11 : cy + 11;
  const base = up ? cy + 11 : cy - 11;
  const wing = up ? tip + 7 : tip - 7;
  return `<path d="M${cx} ${base} L${cx} ${tip} M${cx - 7} ${wing} L${cx} ${tip} L${cx + 7} ${wing}" fill="none" stroke="${GRAY}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function dateBlock(input: PanelInput): string {
  const out: string[] = [];
  const b = CLOCK_BOX;
  // Marco tenue: referencia visual de dónde va la hora; el Kindle pinta encima.
  out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${LIGHT}" stroke-width="2"/>`);

  const raw = input.now.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: input.timeZone,
  });
  out.push(text(RX0, 212, raw.charAt(0).toUpperCase() + raw.slice(1), 34, { bold: true }));

  // Amanecer y atardecer con flechas dibujadas (Roboto no trae ↑↓).
  const w = input.weather.data;
  if (w?.sunrise) {
    out.push(arrow(RX0 + 10, 276, true));
    out.push(text(RX0 + 30, 261, hhmm(w.sunrise), 30, { fill: GRAY }));
    out.push(arrow(RX0 + 150, 276, false));
    out.push(text(RX0 + 170, 261, hhmm(w.sunset), 30, { fill: GRAY }));
  }
  const updated = input.now.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: input.timeZone,
  });
  out.push(text(RX1, 265, `datos ${updated}`, 26, { anchor: "end" }));
  return out.join("");
}

// ---------------------------------------------------------------- esta noche

function nightBlock(night: NightInfo | null): string {
  const out: string[] = [];
  const y = 312;
  out.push(hline(RX0, RX1, y));
  out.push(text(RX0, y + 12, "ESTA NOCHE", 26));
  if (!night) return out.join("") + text(RX0, y + 50, "sin efemérides", 28);

  out.push(moonIcon(RX0 + 36, y + 82, 30, night.moonPct));
  out.push(text(RX0 + 90, y + 50, `${night.moonLabel} ${night.moonPct}%`, 32, { bold: true }));
  const rs: string[] = [];
  if (night.moonrise) rs.push(`sale ${night.moonrise}`);
  if (night.moonset) rs.push(`se pone ${night.moonset}`);
  out.push(text(RX0 + 90, y + 90, rs.join(" · ") || "no sale esta noche", 28));

  const c = (v: number | null) => (v === null ? "–" : `${Math.round(v)}%`);
  out.push(text(RX0, y + 132, "Nubes", 28));
  out.push(text(RX0 + 110, y + 130, `22 h: ${c(night.clouds22)}  ·  01 h: ${c(night.clouds01)}`, 30, { bold: true }));
  out.push(text(RX0, y + 170, "Visibles", 28));
  out.push(text(RX0 + 110, y + 168, night.planets.length > 0 ? night.planets.join(", ") : "ningún planeta", 30, { bold: true }));

  out.push(`<rect x="${RX0}" y="${y + 208}" width="${RX1 - RX0}" height="42" rx="10" fill="${INK}"/>`);
  out.push(text((RX0 + RX1) / 2, y + 219, night.verdict, 26, { bold: true, fill: "#fff", anchor: "middle" }));
  return out.join("");
}

// Disco con la parte iluminada: mitad derecha clara más una elipse central que la
// recorta (creciente) o la completa (gibosa). No distingue creciente de menguante.
function moonIcon(cx: number, cy: number, r: number, pct: number): string {
  const lit = Math.max(0, Math.min(1, pct / 100));
  const rx = (r * Math.abs(1 - 2 * lit)).toFixed(1);
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}"/>`,
    `<path d="M${cx} ${cy - r} a${r} ${r} 0 0 1 0 ${2 * r} z" fill="#fff"/>`,
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${r}" fill="${lit > 0.5 ? "#fff" : INK}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="3"/>`,
  ].join("");
}

// ---------------------------------------------------------------- servicios

function servicesBlock(section: Section<ServicesData>): string {
  const out: string[] = [];
  const y = 580;
  out.push(hline(RX0, RX1, y));
  out.push(text(RX0, y + 12, "SERVICIOS", 26));
  const d = section.data;
  if (!d) return out.join("") + missing(RX0, y + 50, "Servicios");
  if (d.length === 0) return out.join("") + text(RX0, y + 50, "Sin servicios configurados", 28);

  const bad = d.filter((s) => !s.up || s.degraded);
  const ok = d.filter((s) => s.up && !s.degraded);
  const summary = section.stale
    ? `sin datos nuevos hace ${Math.max(1, Math.round(section.ageSeconds / 60))} min`
    : bad.length === 0
      ? `${d.length} de ${d.length} OK`
      : `${ok.length} de ${d.length} OK`;
  out.push(text(RX1, y + 12, summary, 26, { anchor: "end" }));

  // Excepciones arriba, grandes. Sin almacenamiento no se sabe desde cuándo falla:
  // se dice "caído" y la hora del dato ya está en la cabecera.
  let yy = y + 46;
  for (const s of bad.slice(0, 2)) {
    out.push(statusMark(RX0, yy + 16, s.up ? "deg" : "down"));
    // Nombre y detalle comparten 490 px: se recortan para que no se pisen.
    const name = s.name.length > 16 ? `${s.name.slice(0, 15)}…` : s.name;
    const meta = !s.up ? (s.detail ?? "caído") : (s.detail ?? "degradado");
    const metaMax = name.length > 12 ? 14 : 20;
    out.push(text(RX0 + 32, yy, name, 28, { bold: true }));
    out.push(text(RX1, yy + 2, meta.length > metaMax ? `${meta.slice(0, metaMax - 1)}…` : meta, 26, { anchor: "end" }));
    yy += 44;
  }
  if (bad.length > 2) {
    out.push(text(RX0 + 32, yy, `+${bad.length - 2} más con problemas`, 26));
    yy += 34;
  }

  // El resto en dos columnas, solo nombre
  const ROW = 36;
  const rows = Math.max(0, Math.min(MAX_SERVICE_ROWS, Math.floor((SOLAR_Y - 24 - yy) / ROW)));
  const shown = ok.slice(0, rows * 2);
  shown.forEach((s, i) => {
    const x = RX0 + (i % 2) * 245;
    const ry = yy + 6 + Math.floor(i / 2) * ROW;
    out.push(statusMark(x, ry + 14, "ok"));
    out.push(text(x + 26, ry, s.name.length > 15 ? `${s.name.slice(0, 14)}…` : s.name, 26));
  });
  if (ok.length > shown.length) {
    // ocupa el lugar de la última celda de la grilla
    const i = shown.length - 1;
    const x = RX0 + (i % 2) * 245;
    const ry = yy + 6 + Math.floor(i / 2) * ROW;
    out.push(`<rect x="${x}" y="${ry - 2}" width="240" height="34" fill="#fff"/>`);
    out.push(text(x, ry, `+${ok.length - shown.length + 1} más OK`, 26));
  }
  return out.join("");
}

function statusMark(x: number, cy: number, state: "ok" | "deg" | "down"): string {
  const r = 8;
  const cx = x + r;
  if (state === "down") {
    return `<g stroke="${INK}" stroke-width="4" stroke-linecap="round"><line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}"/><line x1="${cx - r}" y1="${cy + r}" x2="${cx + r}" y2="${cy - r}"/></g>`;
  }
  if (state === "deg") {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="3"/><path d="M${cx} ${cy - r} a${r} ${r} 0 0 0 0 ${2 * r} z" fill="${INK}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}"/>`;
}

// ---------------------------------------------------------------- solar

function solarBlock(section: Section<SolarData>, series: SeriesPoint[], now: Date, heavyLoad: string | null): string {
  const out: string[] = [];
  const y0 = SOLAR_Y;
  out.push(
    `<rect x="${M}" y="${y0}" width="${PANEL_W - 2 * M}" height="${PANEL_H - M - y0}" rx="16" fill="none" stroke="${INK}" stroke-width="3"/>`,
  );
  out.push(text(M + 24, y0 + 10, "SOLAR", 26));
  const d = section.data;
  if (!d) return out.join("") + missing(M + 24, y0 + 60, "Solar");

  const generating = d.acPowerW >= IDLE_W;
  const stats: Array<[string, string]> = [
    [fmtPower(d.acPowerW), generating ? "paneles" : "paneles (en reposo)"],
    [fmtPower(d.homeConsumptionW), "casa"],
    [fmtPower(Math.abs(d.feedInPowerW)), d.feedInPowerW < 0 ? "de la red" : "a la red"],
  ];
  if (d.solarSharePct != null) stats.push([`${d.solarSharePct}%`, "de hoy, del sol"]);
  const statX = [M + 24, 290, 520, 720];
  stats.forEach(([v, l], i) => {
    out.push(text(statX[i], y0 + 36, v, 50, { bold: true }));
    out.push(text(statX[i], y0 + 90, l, 26));
  });
  const today = [`Hoy ${d.yieldTodayKwh.toFixed(1).replace(".", ",")} kWh`];
  if (heavyLoad) today.push(heavyLoad);
  out.push(text(M + 24, y0 + 124, today.join("  ·  "), 28));

  // Avisos: inversor en falla, o sin reportar mientras genera, o dato viejo.
  const notes: string[] = [];
  if (d.demo) notes.push("datos de ejemplo");
  if (!d.inverterOk && !d.demo) notes.push(`Inversor: ${d.inverterStatusLabel}`);
  if (d.inverterUploadTime && generating) {
    const min = Math.round((now.getTime() - new Date(d.inverterUploadTime).getTime()) / 60000);
    if (min >= UPLOAD_STALE_MIN) notes.push(`sin reportar hace ${min} min`);
  }
  if (section.stale) notes.push(`sin datos nuevos hace ${Math.max(1, Math.round(section.ageSeconds / 60))} min`);
  if (notes.length > 0) {
    const line = notes.join(" · ");
    out.push(text(M + 130, y0 + 10, line.length > 58 ? `${line.slice(0, 57)}…` : line, 24));
  }

  out.push(sparkline(series, PANEL_W - M - 400, PANEL_W - M - 24, y0 + 30, PANEL_H - M - 20));
  return out.join("");
}

// Generación (línea llena) y consumo (punteada), misma escala, como en el kiosk.
function sparkline(series: SeriesPoint[], gx0: number, gx1: number, gy0: number, gy1: number): string {
  const out: string[] = [];
  out.push(text(gx0, gy0 - 8, "generación / consumo de hoy", 24));
  out.push(hline(gx0, gx1, gy1, SPARK_LIGHT));
  if (series.length < 4) return out.join("");

  const first = series[0];
  const last = series[series.length - 1];
  const spanM = Math.max(last.m - first.m, 180);
  const maxW = Math.max(100, ...series.map((p) => Math.max(p.w, p.c)));
  const top = gy0 + 30;
  const x = (m: number) => gx0 + ((m - first.m) / spanM) * (gx1 - gx0);
  const y = (w: number) => gy1 - (w / maxW) * (gy1 - top);
  const pts = (f: (p: SeriesPoint) => number) =>
    series.map((p) => `${x(p.m).toFixed(1)},${y(f(p)).toFixed(1)}`).join(" ");

  out.push(
    `<polyline points="${pts((p) => p.c)}" fill="none" stroke="${SPARK_GRAY}" stroke-width="3" stroke-dasharray="10 8"/>`,
  );
  out.push(`<polyline points="${pts((p) => p.w)}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`);
  return out.join("");
}

// ---------------------------------------------------------------- panel

export function renderPanelSvg(input: PanelInput): string {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${PANEL_H}" viewBox="0 0 ${PANEL_W} ${PANEL_H}" font-family="Roboto">`,
    `<rect width="${PANEL_W}" height="${PANEL_H}" fill="#fff"/>`,
    `<line x1="890" y1="${M}" x2="890" y2="${SOLAR_Y - 24}" stroke="${LIGHT}" stroke-width="2"/>`,
    weatherBlock(input.weather, input.alert),
    dateBlock(input),
    nightBlock(input.night),
    servicesBlock(input.services),
    solarBlock(input.solar, input.series, input.now, input.heavyLoad),
    "</svg>",
  ];
  return parts.join("");
}
