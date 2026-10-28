// Cache de dos capas para respuestas de upstreams.
// Capa 1: mapa en memoria del isolate — primaria; el polling constante del kiosk lo mantiene caliente.
// Capa 2: Cache API best-effort — no-op en *.workers.dev, persiste entre isolates si algún día hay dominio custom.

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

export interface CachedResult<T> {
  data: T;
  updatedAt: number;
  stale: boolean;
}

export interface CacheOptions {
  /** techo de espera sobre una consulta al upstream ya en curso (default INFLIGHT_MAX_WAIT_MS) */
  maxWaitMs?: number;
  /** pausa tras un fallo antes de volver al upstream (default FAILURE_COOLDOWN_MS) */
  failureCooldownMs?: number;
}

const memory = new Map<string, CacheEntry<unknown>>();
const lastFailureAt = new Map<string, number>();
/** consultas al upstream en curso, para no duplicarlas entre requests concurrentes */
const inFlight = new Map<string, Promise<CacheEntry<unknown>>>();

const STALE_MAX_MS = 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 30_000;
// Por encima del timeout de cualquier fuente (8 s) y por debajo del que espera el
// cliente (15 s): el Worker tiene que alcanzar a descartar una consulta colgada y
// responder antes de que el kiosk corte, o el timer muere con la request y no la limpia.
const INFLIGHT_MAX_WAIT_MS = 12_000;

const syntheticUrl = (id: string) => `https://display-cache.internal/${id}`;

async function readPersistent<T>(id: string): Promise<CacheEntry<T> | null> {
  try {
    const res = await caches.default.match(syntheticUrl(id));
    if (!res) return null;
    return await res.json<CacheEntry<T>>();
  } catch {
    return null;
  }
}

async function writePersistent(id: string, entry: CacheEntry<unknown>): Promise<void> {
  try {
    await caches.default.put(
      syntheticUrl(id),
      new Response(JSON.stringify(entry), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${STALE_MAX_MS / 1000}`,
        },
      }),
    );
  } catch {
    // best-effort
  }
}

export async function cachedFetch<T>(
  id: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  options: CacheOptions = {},
): Promise<CachedResult<T>> {
  const { maxWaitMs = INFLIGHT_MAX_WAIT_MS, failureCooldownMs = FAILURE_COOLDOWN_MS } = options;
  const now = Date.now();

  let entry = memory.get(id) as CacheEntry<T> | undefined;
  if (!entry) {
    const persisted = await readPersistent<T>(id);
    if (persisted) {
      entry = persisted;
      memory.set(id, persisted);
    }
  }

  if (entry && now - entry.updatedAt <= ttlSeconds * 1000) {
    return { data: entry.data, updatedAt: entry.updatedAt, stale: false };
  }

  const usable = entry && now - entry.updatedAt <= STALE_MAX_MS ? entry : undefined;

  // Tras un fallo reciente no se toca el upstream: se sirve lo último bueno, y si
  // no hay nada servible se corta acá. El cooldown vale aunque nunca haya habido
  // dato: si no, durante una caída con cache frío cada visita golpea al upstream.
  const failedAt = lastFailureAt.get(id);
  if (failedAt !== undefined && now - failedAt < failureCooldownMs) {
    if (usable) {
      return { data: usable.data, updatedAt: usable.updatedAt, stale: true };
    }
    throw new Error("Upstream caído hace instantes; esperando antes de reintentar");
  }

  try {
    // El timestamp lo pone quien resuelve el fetch, no cada request: así todas
    // las que comparten una consulta reportan la misma antigüedad real del dato.
    const fresh = await dedupe(id, fetcher, maxWaitMs);
    memory.set(id, fresh);
    lastFailureAt.delete(id);
    await writePersistent(id, fresh);
    return { data: fresh.data, updatedAt: fresh.updatedAt, stale: false };
  } catch (err) {
    lastFailureAt.set(id, now);
    if (usable) {
      return { data: usable.data, updatedAt: usable.updatedAt, stale: true };
    }
    throw err;
  }
}

/**
 * Una sola llamada al upstream por fuente aunque lleguen muchas requests juntas.
 * Sin esto, N visitas simultáneas al vencer el TTL disparaban N consultas — con
 * una URL pública eso alcanza para pasarse del límite de la API del inversor.
 */
function dedupe<T>(id: string, fetcher: () => Promise<T>, maxWaitMs: number): Promise<CacheEntry<T>> {
  let running = inFlight.get(id) as Promise<CacheEntry<T>> | undefined;
  if (!running) {
    const started: Promise<CacheEntry<T>> = fetcher()
      .then((data) => ({ data, updatedAt: Date.now() }))
      .finally(() => {
        // Solo si sigue siendo la consulta vigente: si venció el plazo y ya arrancó
        // otra, borrarla acá dejaría a esa otra sin deduplicar.
        if (inFlight.get(id) === started) inFlight.delete(id);
      });
    inFlight.set(id, started);
    running = started;
  }
  return awaitWithDeadline(id, running, maxWaitMs);
}

/**
 * Espera la consulta compartida con un plazo propio de la request que espera.
 *
 * La consulta la inicia una request; si el cliente de esa request corta la conexión
 * (recarga del kiosk, corte de WiFi), Workers cancela su I/O: el fetch y su
 * AbortSignal.timeout mueren con ella y la promesa queda pendiente para siempre.
 * Compartida vía inFlight, dejaba a la fuente colgada para todas las requests
 * siguientes hasta que se reciclara el isolate — así quedaron mudos clima y solar el
 * 2026-09-19 con los upstreams sanos. Por eso el timer es de quien espera, no de
 * quien inició, y al vencer la consulta se descarta para que la próxima vuelva a
 * consultar. Una consulta lenta pero viva se corta igual: no hay forma de
 * distinguirlas, y el costo es un reintento tras el cooldown.
 */
function awaitWithDeadline<T>(
  id: string,
  running: Promise<CacheEntry<T>>,
  maxWaitMs: number,
): Promise<CacheEntry<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (inFlight.get(id) === running) inFlight.delete(id);
      console.warn(`cache: consulta a ${id} sin respuesta en ${maxWaitMs} ms; se descarta`);
      reject(new Error(`Consulta a ${id} sin respuesta en ${Math.round(maxWaitMs / 1000)} s`));
    }, maxWaitMs);
  });
  return Promise.race([running, deadline]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}
