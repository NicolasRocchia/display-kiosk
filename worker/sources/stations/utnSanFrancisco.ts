import type { StationSnapshot } from "./index";

// Estación meteorológica de la UTN Facultad Regional San Francisco (Córdoba, AR).
// Misma API que consume su web pública: https://climatologia.sanfrancisco.utn.edu.ar/tiempo/
// Sirve de ejemplo de adaptador; activar con LOCAL_STATION="utn-san-francisco".
const URL_API = "https://meteorologia.sanfrancisco.utn.edu.ar/apiv2.php";
const TIMEOUT_MS = 8_000;
/** snapshot más viejo que esto = estación colgada → se descarta y manda Open-Meteo */
const MAX_AGE_MIN = 45;

interface UtnRaw {
  fecha?: string; // "10/08/26"
  hora?: string; // "12:30"
  temperatura?: string; // "12,2 °C"
  sensacion_termica?: string;
  humedad?: string; // "48 % "
  velocidad_viento?: string; // "14,5 km/h"
  direccion_viento?: string; // "E"
  lluvia?: string;
  lluvia_mensual?: string;
  lluvia_anual?: string;
  radiacion?: string; // "679 W/m²"
}

export async function fetchUtnSanFrancisco(timeZone: string): Promise<StationSnapshot> {
  const res = await fetch(URL_API, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "display-kiosk (uso personal, 1 req/10min)" },
  });
  if (!res.ok) {
    throw new Error(`Estación UTN HTTP ${res.status}`);
  }
  const raw = await res.json<UtnRaw>();

  assertFresh(raw, timeZone);

  const tempC = parseNum(raw.temperatura);
  const humidityPct = parseNum(raw.humedad);
  if (tempC === null || humidityPct === null) {
    throw new Error("Estación UTN: snapshot incompleto");
  }
  return {
    tempC,
    feelsLikeC: parseNum(raw.sensacion_termica) ?? tempC,
    humidityPct,
    windKmh: parseNum(raw.velocidad_viento) ?? 0,
    windDir: raw.direccion_viento?.trim() || null,
    rainTodayMm: parseNum(raw.lluvia),
    rainMonthMm: parseNum(raw.lluvia_mensual),
    rainYearMm: parseNum(raw.lluvia_anual),
    radiationWm2: parseNum(raw.radiacion),
  };
}

/** Los valores vienen como texto es-AR con unidad: "12,2 °C" → 12.2 */
function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// El snapshot trae "fecha" dd/MM/yy y "hora" H:mm en hora local de la estación.
function assertFresh(raw: UtnRaw, timeZone: string): void {
  if (!raw.fecha || !raw.hora) return; // sin timestamp no se puede juzgar: se acepta
  const [d, m, y] = raw.fecha.split("/").map((p) => parseInt(p, 10));
  const [hh, mm] = raw.hora.split(":").map((p) => parseInt(p, 10));
  if ([d, m, y, hh, mm].some((n) => !Number.isFinite(n))) return;

  // "ahora" en la zona de la estación, como minutos de un calendario naive
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const nowMin =
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) / 60000;
  const snapMin = Date.UTC(2000 + y, m - 1, d, hh, mm) / 60000;
  if (Math.abs(nowMin - snapMin) > MAX_AGE_MIN) {
    throw new Error("Estación UTN: snapshot viejo (estación colgada)");
  }
}
