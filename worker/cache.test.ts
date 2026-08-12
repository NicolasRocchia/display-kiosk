// Tests del cache del Worker. Se corren con `npm test` (Node 22 ejecuta
// TypeScript directamente, sin framework ni dependencias extra).
import { cachedFetch } from "./cache.ts";

// La Cache API de Workers no existe en Node: se stubea para probar la lógica.
(globalThis as unknown as { caches: unknown }).caches = {
  default: { match: async () => undefined, put: async () => {} },
};

let fallos = 0;

function check(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "  ok  " : " FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
}

// --- Deduplicación de requests concurrentes -------------------------------
// El caso que motivó el arreglo: con una URL pública, N visitas simultáneas al
// vencer el TTL disparaban N consultas al inversor y se pasaban de su límite.
let consultas = 0;
const upstreamLento = async () => {
  consultas++;
  await new Promise((r) => setTimeout(r, 60));
  return { valor: consultas };
};

const resultados = await Promise.all(
  Array.from({ length: 20 }, () => cachedFetch("dedupe", 60, upstreamLento)),
);
check("20 requests concurrentes → una sola consulta al upstream", consultas === 1, `consultas=${consultas}`);
check(
  "todas reportan la misma antigüedad del dato",
  new Set(resultados.map((r) => r.updatedAt)).size === 1,
);

const previas = consultas;
await cachedFetch("dedupe", 60, upstreamLento);
check("dentro del TTL no se vuelve al upstream", consultas === previas);

// --- Cooldown con cache frío ----------------------------------------------
// Antes el cooldown solo aplicaba si ya había un dato bueno: durante una caída
// con cache vacío, cada visita golpeaba al upstream sin freno.
let intentos = 0;
const upstreamCaido = async () => {
  intentos++;
  throw new Error("upstream caído");
};

for (let i = 0; i < 5; i++) {
  await cachedFetch("caido", 60, upstreamCaido).catch(() => {});
}
check("upstream caído sin dato previo → el cooldown corta los reintentos", intentos === 1, `intentos=${intentos}`);

// --- Dato viejo servido ante un fallo -------------------------------------
let n = 0;
const intermitente = async () => {
  n++;
  if (n === 1) return { valor: "bueno" };
  throw new Error("caído");
};

await cachedFetch("stale", 0, intermitente);
// Sin esta pausa ambas llamadas caen en el mismo milisegundo y, con TTL 0, la
// segunda ve el dato como fresco: la que fallaba era la prueba, no el cache.
await new Promise((r) => setTimeout(r, 5));
const servido = await cachedFetch("stale", 0, intermitente);
check(
  "ante un fallo con dato previo, se sirve el último bueno marcado como viejo",
  servido.stale === true && (servido.data as { valor: string }).valor === "bueno",
);

console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} test(s) en rojo.`);
process.exit(fallos === 0 ? 0 : 1);
