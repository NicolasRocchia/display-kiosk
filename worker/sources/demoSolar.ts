import type { SolarData } from "../../shared/api-types";

// Datos de ejemplo para probar el display sin una cuenta de SolaxCloud.
// Se activa solo cuando faltan los secrets; genera una curva solar realista
// según la hora local (determinística: la serie del sparkline queda suave).

const SUNRISE_MIN = 7 * 60 + 30;
const SUNSET_MIN = 18 * 60 + 30;
/** pico de generación al mediodía, en W */
const PEAK_W = 3000;
/** consumo base de la casa (heladera, standby), en W */
const BASE_LOAD_W = 320;

export function demoSolar(timeZone: string): SolarData {
  const minuteOfDay = localMinuteOfDay(timeZone);
  const acPowerW = Math.round(solarCurve(minuteOfDay) * cloudFactor(minuteOfDay));
  const homeConsumptionW = Math.round(BASE_LOAD_W + householdLoad(minuteOfDay));
  // Instalación con inyección 0: la red cubre lo que los paneles no alcanzan.
  const gridPowerW = Math.round(acPowerW - homeConsumptionW);

  const generatedSoFar = energySoFarKwh(minuteOfDay);
  const consumedSoFar = 0.35 * (minuteOfDay / 60) + 1.2;
  const importedSoFar = Math.max(0, consumedSoFar - generatedSoFar * 0.92);
  const solarSharePct =
    consumedSoFar > 0.05
      ? Math.min(100, Math.max(0, Math.round(((consumedSoFar - importedSoFar) / consumedSoFar) * 100)))
      : null;

  return {
    acPowerW,
    yieldTodayKwh: Math.round(generatedSoFar * 10) / 10,
    yieldTotalKwh: 1284.6,
    feedInPowerW: gridPowerW,
    homeConsumptionW,
    homeConsumptionTodayKwh: Math.round(consumedSoFar * 100) / 100,
    solarSharePct,
    pv1PowerW: acPowerW,
    pv2PowerW: 0,
    batterySoc: null,
    batteryPowerW: null,
    batteryStatus: null,
    inverterStatusCode: "102",
    inverterStatusLabel: "Normal",
    inverterOk: true,
    inverterUploadTime: null,
    demo: true,
  };
}

/** Campana entre la salida y la puesta del sol; 0 de noche. */
function solarCurve(minuteOfDay: number): number {
  if (minuteOfDay <= SUNRISE_MIN || minuteOfDay >= SUNSET_MIN) return 0;
  const progress = (minuteOfDay - SUNRISE_MIN) / (SUNSET_MIN - SUNRISE_MIN);
  return PEAK_W * Math.sin(progress * Math.PI);
}

/** Nubes: ondas lentas superpuestas, sin azar (misma hora → mismo valor). */
function cloudFactor(minuteOfDay: number): number {
  const slow = Math.sin(minuteOfDay / 47);
  const fast = Math.sin(minuteOfDay / 13);
  return 0.82 + 0.12 * slow + 0.06 * fast;
}

/** Picos de consumo a la mañana y a la noche. */
function householdLoad(minuteOfDay: number): number {
  const morning = 900 * Math.exp(-(((minuteOfDay - 8 * 60) / 90) ** 2));
  const evening = 1400 * Math.exp(-(((minuteOfDay - 21 * 60) / 120) ** 2));
  const noise = 120 * Math.abs(Math.sin(minuteOfDay / 7));
  return morning + evening + noise;
}

/** Integra la campana desde el amanecer hasta ahora (kWh). */
function energySoFarKwh(minuteOfDay: number): number {
  let total = 0;
  for (let m = SUNRISE_MIN; m < Math.min(minuteOfDay, SUNSET_MIN); m += 15) {
    total += (solarCurve(m) * cloudFactor(m) * 15) / 60;
  }
  return total / 1000;
}

function localMinuteOfDay(timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return get("hour") * 60 + get("minute");
}
