// Alertas del SMN (Sistema de Alerta Temprana) vía su feed CAP, el estándar de la OMM.
// El índice (ssl.smn.gob.ar/CAP/AR.php) lista las alertas vigentes y enlaza un XML CAP
// por cada una; cada CAP trae un polígono y ningún nombre de zona, así que el filtro
// es geométrico: se conservan las alertas cuyo polígono contiene la casa.
// Público, sin clave. Entre 10 y 20 pedidos por refresco; el TTL (15 min) lo absorbe.

import type { AlertsData, SmnAlert } from "../../shared/api-types";

const INDEX_URL = "https://ssl.smn.gob.ar/CAP/AR.php";
const TIMEOUT_MS = 8_000;
const MAX_ALERTS = 40;

const LEVEL_BY_SEVERITY: Record<string, SmnAlert["level"]> = {
  Moderate: "amarilla",
  Severe: "naranja",
  Extreme: "roja",
};

type Point = [lat: number, lon: number];

/** Área de alerta del SMN según el registro de la OMM (N -21, W -74, S -56, E -53) */
const ARGENTINA = { latMin: -56, latMax: -21, lonMin: -74, lonMax: -53 };

export function insideArgentina([lat, lon]: Point): boolean {
  return lat >= ARGENTINA.latMin && lat <= ARGENTINA.latMax && lon >= ARGENTINA.lonMin && lon <= ARGENTINA.lonMax;
}

export async function fetchAlerts(env: Env): Promise<AlertsData> {
  const home: Point = [parseFloat(env.LATITUDE), parseFloat(env.LONGITUDE)];
  // El SMN solo cubre Argentina: fuera de su área no hay nada que consultar.
  if (!insideArgentina(home)) return [];
  const index = await fetchText(INDEX_URL);
  const links = Array.from(
    new Set(Array.from(index.matchAll(/https?:\/\/ssl\.smn\.gob\.ar\/feeds\/CAP\/[^"'\s<>]+\.xml/g), (m) => m[0])),
  ).slice(0, MAX_ALERTS);

  const caps = await Promise.all(
    links.map((url) =>
      fetchText(url)
        .then((xml) => parseCap(xml))
        .catch((e: unknown) => {
          console.warn(`smn: ${url}:`, e instanceof Error ? e.message : e);
          return null;
        }),
    ),
  );

  const now = Date.now();
  return caps
    .filter((c): c is ParsedCap => c !== null)
    .filter((c) => new Date(c.expires).getTime() > now)
    .filter((c) => c.polygons.some((poly) => pointInPolygon(home, poly)))
    .map(({ polygons: _polygons, ...alert }) => alert)
    .sort((a, b) => levelRank(b.level) - levelRank(a.level) || a.onset.localeCompare(b.onset));
}

interface ParsedCap extends SmnAlert {
  polygons: Point[][];
}

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
};

export function parseCap(xml: string): ParsedCap | null {
  const severity = tag(xml, "severity") ?? "";
  const level = LEVEL_BY_SEVERITY[severity];
  const event = tag(xml, "event") ?? tag(xml, "headline");
  const onset = tag(xml, "onset") ?? tag(xml, "effective") ?? tag(xml, "sent");
  const expires = tag(xml, "expires");
  if (!level || !event || !onset || !expires) return null;

  const polygons = Array.from(xml.matchAll(/<polygon>([\s\S]*?)<\/polygon>/g), (m) =>
    m[1]
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number) as Point)
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)),
  ).filter((poly) => poly.length >= 3);
  if (polygons.length === 0) return null;

  const description = (tag(xml, "description") ?? "").replace(/\s+/g, " ");
  const firstSentence = description.split(/(?<=\.)\s/)[0] ?? "";

  return { event: decodeEntities(event), level, onset, expires, description: decodeEntities(firstSentence), polygons };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Ray casting clásico; alcanza para polígonos de alerta (no cruzan el antimeridiano).
export function pointInPolygon([lat, lon]: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [lat1, lon1] = poly[i];
    const [lat2, lon2] = poly[j];
    const crosses = lat1 > lat || lat2 > lat ? (lat1 > lat) !== (lat2 > lat) : false;
    if (crosses && lon < ((lon2 - lon1) * (lat - lat1)) / (lat2 - lat1) + lon1) inside = !inside;
  }
  return inside;
}

function levelRank(level: SmnAlert["level"]): number {
  return level === "roja" ? 3 : level === "naranja" ? 2 : 1;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "display-kiosk (uso personal, 1 req/15min)" },
  });
  if (!res.ok) throw new Error(`SMN HTTP ${res.status}`);
  return res.text();
}
