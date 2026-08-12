import type { SolarData } from "../../shared/api-types";
import { demoSolar } from "./demoSolar";

// SolaX Developer Platform (developer.solaxcloud.com) — app propia de solo lectura.
// Host Global IDC; auth client_credentials → access_token (~30 días).
const API_BASE = "https://openapi-eu.solaxcloud.com";
const TIMEOUT_MS = 8_000;
/** margen antes del vencimiento real para renovar el token */
const TOKEN_SAFETY_MS = 60_000;

// Mapa de estados del inversor (mismo esquema que la User API clásica, appendix 8.1)
const OK_STATUSES = new Set(["102", "131", "132", "133"]);

const INVERTER_STATUS: Record<string, string> = {
  "100": "Esperando",
  "101": "Autotest",
  "102": "Normal",
  "103": "Falla recuperable",
  "104": "Falla permanente",
  "105": "Actualizando firmware",
  "106": "Detección EPS",
  "107": "Off-grid",
  "108": "Autotest",
  "109": "Reposo",
  "110": "Standby",
  "111": "PV despierta batería",
  "112": "Detección de generador",
  "113": "Modo generador",
  "114": "Apagado rápido",
  "130": "Modo VPP",
  "131": "TOU autoconsumo",
  "132": "TOU cargando",
  "133": "TOU descargando",
};

// Token y datos del inversor viven en la memoria del isolate: el token dura ~30 días
// y el dispositivo no cambia; un cold start solo cuesta 2 llamadas extra.
let tokenCache: { value: string; expiresAt: number } | null = null;
let deviceCache: { deviceSn: string; plantId: string } | null = null;

interface TokenResponse {
  code: number;
  message?: string;
  result?: { access_token: string; expires_in: number };
}

interface ApiEnvelope<T> {
  code: number;
  message?: string;
  result?: T;
}

interface DeviceRecord {
  deviceSn: string;
  registerNo: string;
  plantId: string;
  ratedPower: number | string | null;
  onlineStatus: number | null;
}

interface PlantRealtime {
  dailyYield: number | null;
  dailyImported: number | null;
  dailyExported: number | null;
}

interface RealtimeRecord {
  deviceStatus: number | string | null;
  dailyYield: number | null;
  totalYield: number | null;
  acPower1: number | null;
  acPower2: number | null;
  acPower3: number | null;
  /** W; negativo = importando de red (verificado contra el flujo de energía de la UI) */
  gridPower: number | null;
  /** ISO 8601 con zona (UTC) — última subida del inversor */
  dataTime: string | null;
  mpptMap: Record<string, number> | null;
}

export async function fetchSolar(env: Env): Promise<SolarData> {
  // Sin credenciales el display igual arranca: datos de ejemplo para probarlo.
  if (!env.SOLAX_CLIENT_ID || !env.SOLAX_CLIENT_SECRET) {
    return demoSolar(env.TIMEZONE);
  }
  const { deviceSn, plantId } = await ensureDevice(env);
  // La telemetría del inversor es lo esencial; los acumulados de planta (import/export
  // del día, para la autosuficiencia) son best-effort y no voltean el widget si fallan.
  const [records, plant] = await Promise.all([
    apiGet<RealtimeRecord[]>(
      env,
      `/openapi/v2/device/realtime_data?snList=${encodeURIComponent(deviceSn)}&deviceType=1&businessType=1`,
    ),
    apiGet<PlantRealtime>(
      env,
      `/openapi/v2/plant/realtime_data?plantId=${encodeURIComponent(plantId)}&businessType=1`,
    ).catch(() => null),
  ]);
  const r = records?.[0];
  if (!r) {
    throw new Error("SolaxCloud no devolvió datos del inversor");
  }
  return normalize(r, plant);
}

async function ensureToken(env: Env): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }
  const res = await fetch(`${API_BASE}/openapi/auth/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SOLAX_CLIENT_ID,
      client_secret: env.SOLAX_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json<TokenResponse>();
  if (!res.ok || body.code !== 0 || !body.result?.access_token) {
    throw new Error(`Solax auth: ${body.message ?? `HTTP ${res.status}`}`);
  }
  tokenCache = {
    value: body.result.access_token,
    expiresAt: Date.now() + body.result.expires_in * 1000 - TOKEN_SAFETY_MS,
  };
  return tokenCache.value;
}

// code 10000 = éxito. Ante cualquier otro resultado se renueva el token y se
// reintenta una única vez (cubre token vencido/revocado sin conocer el código exacto).
async function apiGet<T>(env: Env, path: string, retried = false): Promise<T> {
  const token = await ensureToken(env);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let body: ApiEnvelope<T>;
  try {
    body = await res.json<ApiEnvelope<T>>();
  } catch {
    throw new Error(`SolaxCloud HTTP ${res.status}: respuesta no-JSON`);
  }
  if (res.ok && body.code === 10000 && body.result !== undefined) {
    return body.result;
  }
  if (!retried) {
    tokenCache = null;
    return apiGet<T>(env, path, true);
  }
  throw new Error(`SolaxCloud: ${body.message ?? `código ${body.code}`}`);
}

async function ensureDevice(env: Env): Promise<{ deviceSn: string; plantId: string }> {
  if (deviceCache) {
    return deviceCache;
  }
  const page = await apiGet<{ records?: DeviceRecord[] }>(
    env,
    "/openapi/v2/device/page_device_info?deviceType=1&businessType=1",
  );
  const first = page.records?.[0];
  if (!first?.deviceSn) {
    throw new Error("La cuenta no tiene inversores asociados");
  }
  deviceCache = { deviceSn: first.deviceSn, plantId: first.plantId };
  return deviceCache;
}

function normalize(r: RealtimeRecord, plant: PlantRealtime | null): SolarData {
  const code = String(r.deviceStatus ?? "");
  const acPowerW = (r.acPower1 ?? 0) + (r.acPower2 ?? 0) + (r.acPower3 ?? 0);
  const gridPowerW = r.gridPower ?? 0;

  // Autosuficiencia del día: consumo = generado − exportado + importado;
  // % solar = (consumo − importado) / consumo. Verificado contra la UI de SolaxCloud.
  let homeConsumptionTodayKwh: number | null = null;
  let solarSharePct: number | null = null;
  if (plant && plant.dailyYield !== null && plant.dailyImported !== null && plant.dailyExported !== null) {
    const consumption = plant.dailyYield - plant.dailyExported + plant.dailyImported;
    homeConsumptionTodayKwh = Math.round(consumption * 100) / 100;
    if (consumption > 0.05) {
      const pct = ((consumption - plant.dailyImported) / consumption) * 100;
      solarSharePct = Math.min(100, Math.max(0, Math.round(pct)));
    }
  }

  return {
    acPowerW,
    yieldTodayKwh: r.dailyYield ?? 0,
    yieldTotalKwh: r.totalYield ?? 0,
    feedInPowerW: gridPowerW,
    // casa = lo que generan los paneles menos lo que sale a red (o más lo que entra)
    homeConsumptionW: Math.max(0, Math.round(acPowerW - gridPowerW)),
    homeConsumptionTodayKwh,
    solarSharePct,
    pv1PowerW: r.mpptMap?.MPPT1Power ?? null,
    pv2PowerW: r.mpptMap?.MPPT2Power ?? null,
    // Sin implementar: en esta API la batería es otro deviceType, con su propia
    // consulta. Si tenés una, ese es el lugar para sumarla.
    batterySoc: null,
    batteryPowerW: null,
    batteryStatus: null,
    inverterStatusCode: code,
    inverterStatusLabel: INVERTER_STATUS[code] ?? `Estado ${code || "?"}`,
    inverterOk: OK_STATUSES.has(code),
    inverterUploadTime: r.dataTime,
    demo: false,
  };
}
