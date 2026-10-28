// Codificador PNG de 8 bits en escala de grises. resvg devuelve RGBA; el Kindle
// pinta el PNG con `eips -g`, que espera grayscale de 8 bits. Convertimos acá para
// que el dispositivo no tenga que interpretar nada: un canal, sin alfa, sin paleta.
// Deflate con CompressionStream (disponible en Workers y en Node ≥ 18).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as unknown as ArrayBuffer]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** RGBA (premultiplicado o no, da igual sobre fondo blanco) → PNG gris de 8 bits. */
export async function rgbaToGrayPng(rgba: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  // Una fila = byte de filtro (0) + width bytes de luminancia.
  const raw = new Uint8Array(height * (width + 1));
  for (let yy = 0; yy < height; yy++) {
    const rowStart = yy * (width + 1);
    raw[rowStart] = 0;
    for (let xx = 0; xx < width; xx++) {
      const i = (yy * width + xx) * 4;
      const a = rgba[i + 3] / 255;
      // Luminancia Rec. 601 compuesta sobre blanco
      const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      raw[rowStart + 1 + xx] = Math.round(lum * a + 255 * (1 - a));
    }
  }

  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}
