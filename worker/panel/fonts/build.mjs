// Genera fonts.ts con las fuentes del panel en base64.
// Vite (plugin de Cloudflare) ignora las `rules` de wrangler y convierte un import
// de .ttf en una URL de asset, no en bytes; por eso las fuentes viajan dentro del
// bundle como texto. Los .subset.ttf son Roboto recortada a Latin-1 + símbolos
// (grados, ², flechas) con pyftsubset (fonttools): ~30 KB cada una contra 300 KB.
//
// Regenerar:  node worker/panel/fonts/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const b64 = (name) => readFileSync(join(dir, name)).toString("base64");

const out = `// Generado por build.mjs — no editar a mano. Roboto (Apache 2.0, ver LICENSE-Roboto.txt).
export const ROBOTO_REGULAR_B64 = "${b64("Roboto-Regular.subset.ttf")}";
export const ROBOTO_BOLD_B64 = "${b64("Roboto-Bold.subset.ttf")}";
`;
writeFileSync(join(dir, "fonts.ts"), out);
console.log("fonts.ts escrito");
