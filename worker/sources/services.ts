import type { ServiceCheck, ServicesData } from "../../shared/api-types";

const TIMEOUT_MS = 5_000;

interface MonitorTarget {
  name: string;
  url: string;
  /** "http" (default): up = respuesta 2xx/3xx · "statuspage": interpreta el JSON de una Atlassian Statuspage */
  type?: "http" | "statuspage";
}

export async function fetchServices(env: Env): Promise<ServicesData> {
  let targets: MonitorTarget[];
  try {
    targets = JSON.parse(env.MONITOR_URLS);
  } catch {
    throw new Error("MONITOR_URLS no es JSON válido");
  }
  if (!Array.isArray(targets)) {
    throw new Error("MONITOR_URLS debe ser un array de {name, url, type?}");
  }
  return Promise.all(targets.map(check));
}

// Nunca rechaza: un servicio caído es un resultado válido, no un error de la fuente.
async function check(t: MonitorTarget): Promise<ServiceCheck> {
  const base: ServiceCheck = {
    name: t.name,
    url: t.url,
    up: false,
    degraded: false,
    detail: null,
    httpStatus: null,
    latencyMs: null,
  };
  const started = Date.now();
  try {
    const res = await fetch(t.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "display-kiosk-monitor" },
    });
    base.httpStatus = res.status;
    base.latencyMs = Date.now() - started;
    if (t.type === "statuspage") {
      return await interpretStatuspage(base, res);
    }
    base.up = res.ok;
    return base;
  } catch {
    return base;
  }
}

// Formato Atlassian Statuspage (/api/v2/status.json):
// { status: { indicator: "none"|"minor"|"major"|"critical", description: "..." } }
async function interpretStatuspage(base: ServiceCheck, res: Response): Promise<ServiceCheck> {
  if (!res.ok) {
    return base;
  }
  try {
    const j = await res.json<{ status?: { indicator?: string; description?: string } }>();
    const indicator = j.status?.indicator ?? "none";
    base.up = indicator === "none" || indicator === "minor";
    base.degraded = indicator === "minor";
    if (indicator !== "none") {
      base.detail = j.status?.description ?? indicator;
    }
    return base;
  } catch {
    return base;
  }
}
