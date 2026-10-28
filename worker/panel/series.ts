// Serie solar del día para el panel e-ink. Es el equivalente de src/lib/solarSeries.ts
// (que vive en el localStorage del kiosk) pero acumulada en memoria del Worker: el
// Kindle no ejecuta nada, así que la curva la tiene que recordar el servidor.
//
// Vive en el isolate: si Cloudflare lo recicla, la curva arranca de cero y se rearma
// con las muestras siguientes (una por pedido del panel, ~5 min). Es un compromiso
// deliberado: KV se descartó en este repo (ver CLAUDE.md) y un Durable Object es
// más maquinaria de la que amerita una curva decorativa.

export interface SeriesPoint {
  /** minuto del día (0-1439), en la zona horaria del panel */
  m: number;
  /** potencia AC generada, W */
  w: number;
  /** consumo del hogar, W */
  c: number;
}

let currentDay = "";
let series: SeriesPoint[] = [];

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha y minuto del día de un instante, en la zona horaria dada. */
export function localParts(d: Date, timeZone: string): { day: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = Number(get("hour")) % 24; // Intl puede devolver "24" a medianoche
  return {
    day: `${get("year")}-${pad(Number(get("month")))}-${pad(Number(get("day")))}`,
    minute: hour * 60 + Number(get("minute")),
  };
}

/**
 * Registra una muestra (idempotente por minuto) y devuelve la serie del día.
 * Igual que el kiosk: de noche Solax sirve el snapshot congelado del atardecer
 * anterior, así que si el uploadTime no es de hoy la muestra se descarta.
 */
export function recordSample(
  uploadIso: string | null,
  watts: number,
  consumptionW: number,
  timeZone: string,
  now = new Date(),
): SeriesPoint[] {
  const today = localParts(now, timeZone);
  if (today.day !== currentDay) {
    currentDay = today.day;
    series = [];
  }

  const upload = uploadIso ? new Date(uploadIso) : now;
  const uploadValid = !Number.isNaN(upload.getTime());
  const uploadParts = uploadValid ? localParts(upload, timeZone) : today;

  if (uploadParts.day === today.day && uploadParts.minute <= today.minute) {
    const m = uploadParts.minute;
    if (!series.some((p) => p.m === m)) {
      series.push({ m, w: Math.max(0, Math.round(watts)), c: Math.max(0, Math.round(consumptionW)) });
      series.sort((a, b) => a.m - b.m);
    }
  }
  return series;
}

/** Solo para tests. */
export function resetSeries(): void {
  currentDay = "";
  series = [];
}
