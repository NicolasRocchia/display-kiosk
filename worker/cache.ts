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

  // Tras un fallo reciente no se reintenta el upstream: se sirve stale directo.
  const failedAt = lastFailureAt.get(id);
  if (failedAt !== undefined && now - failedAt < FAILURE_COOLDOWN_MS && entry) {
    return { data: entry.data, updatedAt: entry.updatedAt, stale: true };
  }

  try {
    const data = await fetcher();
    memory.set(id, { data, updatedAt: now });
    lastFailureAt.delete(id);
    await writePersistent(id, { data, updatedAt: now });
    return { data, updatedAt: now, stale: false };
  } catch (err) {
    lastFailureAt.set(id, now);
    if (entry && now - entry.updatedAt <= STALE_MAX_MS) {
      return { data: entry.data, updatedAt: entry.updatedAt, stale: true };
    }
    throw err;
  }
}
