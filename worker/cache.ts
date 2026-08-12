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

const memory = new Map<string, CacheEntry<unknown>>();
const lastFailureAt = new Map<string, number>();
/** consultas al upstream en curso, para no duplicarlas entre requests concurrentes */
const inFlight = new Map<string, Promise<unknown>>();

const STALE_MAX_MS = 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 30_000;

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
): Promise<CachedResult<T>> {
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
  if (failedAt !== undefined && now - failedAt < FAILURE_COOLDOWN_MS) {
    if (usable) {
      return { data: usable.data, updatedAt: usable.updatedAt, stale: true };
    }
    throw new Error("Upstream caído hace instantes; esperando antes de reintentar");
  }

  try {
    const data = await dedupe(id, fetcher);
    memory.set(id, { data, updatedAt: now });
    lastFailureAt.delete(id);
    await writePersistent(id, { data, updatedAt: now });
    return { data, updatedAt: now, stale: false };
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
function dedupe<T>(id: string, fetcher: () => Promise<T>): Promise<T> {
  const running = inFlight.get(id) as Promise<T> | undefined;
  if (running) {
    return running;
  }
  const started = fetcher().finally(() => inFlight.delete(id));
  inFlight.set(id, started);
  return started;
}
