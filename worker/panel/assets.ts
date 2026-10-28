// Assets del panel empaquetados en el Worker.
// - El .wasm de resvg entra como módulo WebAssembly (el plugin de Cloudflare para
//   Vite lo soporta de forma nativa).
// - Las fuentes van en base64 dentro de fonts.ts (generado por fonts/build.mjs):
//   un import de .ttf en Vite da una URL de asset, no bytes, y las `rules` de
//   wrangler se ignoran bajo Vite.
// Solo este archivo las conoce: el resto del panel recibe los bytes por parámetro.

import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { ROBOTO_BOLD_B64, ROBOTO_REGULAR_B64 } from "./fonts/fonts.ts";
import type { RenderAssets } from "./render.ts";

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const panelAssets: RenderAssets = {
  wasm: resvgWasm,
  fonts: [fromBase64(ROBOTO_REGULAR_B64), fromBase64(ROBOTO_BOLD_B64)],
};
