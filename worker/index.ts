import type { ApiErr, ApiOk } from "../shared/api-types";
import { cachedFetch } from "./cache";
import { isKnownSource, sources, type Source } from "./sources";

// El TTL vive solo en el Worker: el cliente siempre ve ageSeconds veraz.
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function err(source: string, code: string, message: string): ApiErr {
  return { ok: false, source, error: { code, message }, data: null };
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;

    // Con assets.run_worker_first: ["/api/*"], todo lo demás lo sirve la capa de assets.
    if (!path.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    if (path === "/api/health") {
      return json({ ok: true, now: new Date().toISOString() });
    }

    const id = path.slice("/api/".length);
    if (!isKnownSource(id)) {
      return json(err(id, "UNKNOWN_SOURCE", `Fuente desconocida: ${id}`), 404);
    }

    const source: Source<unknown> = sources[id];
    try {
      const r = await cachedFetch(source.id, source.ttlSeconds, () => source.fetch(env));
      const body: ApiOk<unknown> = {
        ok: true,
        source: source.id,
        updatedAt: new Date(r.updatedAt).toISOString(),
        ageSeconds: Math.round((Date.now() - r.updatedAt) / 1000),
        stale: r.stale,
        data: r.data,
      };
      return json(body);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return json(err(source.id, "UPSTREAM_ERROR", message), 502);
    }
  },
} satisfies ExportedHandler<Env>;
