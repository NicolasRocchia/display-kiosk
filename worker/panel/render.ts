// Rasterizado del SVG del panel con resvg (WebAssembly). Separado de los imports de
// assets (./assets.ts) para que el test en Node pueda cargar fuentes y wasm del disco.

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { PANEL_H, PANEL_W } from "./layout.ts";
import { rgbaToGrayPng } from "./png.ts";

export interface RenderAssets {
  /** módulo wasm de resvg: WebAssembly.Module (Worker) o bytes (Node) */
  wasm: WebAssembly.Module | BufferSource;
  fonts: BufferSource[];
}

let wasmReady: Promise<void> | null = null;

function ensureWasm(wasm: RenderAssets["wasm"]): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(wasm).catch((err: unknown) => {
      // resvg tira si se inicializa dos veces en el mismo isolate; eso no es un error.
      if (err instanceof Error && /already/i.test(err.message)) return;
      wasmReady = null;
      throw err;
    });
  }
  return wasmReady;
}

export async function renderSvgToGrayPng(svg: string, assets: RenderAssets): Promise<Uint8Array> {
  await ensureWasm(assets.wasm);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: PANEL_W },
    background: "#ffffff",
    font: {
      fontBuffers: assets.fonts.map((f) => new Uint8Array(f instanceof ArrayBuffer ? f : f.buffer)),
      loadSystemFonts: false,
      defaultFontFamily: "Roboto",
    },
  });
  const image = resvg.render();
  const pixels = image.pixels;
  const { width, height } = image;
  image.free();
  resvg.free();
  if (width !== PANEL_W || height !== PANEL_H) {
    throw new Error(`Render inesperado: ${width}×${height}, se esperaba ${PANEL_W}×${PANEL_H}`);
  }
  return rgbaToGrayPng(pixels, width, height);
}
