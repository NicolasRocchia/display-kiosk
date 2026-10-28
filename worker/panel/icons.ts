// Íconos de clima lineales para e-ink (trazo negro sobre blanco), en un viewBox de
// 64×64. Reemplazan a los emoji de src/lib/wmo.ts, que en escala de grises no se
// leen. Cada ícono es un fragmento SVG; `weatherIcon` lo ubica y escala.

export type IconKind =
  | "sun"
  | "moon"
  | "partly"
  | "partlyNight"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

const S = 'fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"';

// Nube: tres arcos y una base, usada sola o combinada.
const cloud = (dx = 0, dy = 0, k = 1) =>
  `<path transform="translate(${dx} ${dy}) scale(${k})" ${S} d="M18 44 h30 a9 9 0 0 0 1 -18 a13 13 0 0 0 -25 -3 a10 10 0 0 0 -6 21 z"/>`;

const sunRays = (cx: number, cy: number, r: number) => {
  let out = `<circle cx="${cx}" cy="${cy}" r="${r}" ${S}/>`;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 4);
    const y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 10);
    const y2 = cy + Math.sin(a) * (r + 10);
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${S}/>`;
  }
  return out;
};

const moon = (cx: number, cy: number, r: number) =>
  `<path ${S} d="M${cx + r * 0.2} ${cy - r} a${r} ${r} 0 1 0 ${r * 0.8} ${r * 1.6} a${r * 0.75} ${r * 0.75} 0 0 1 -${r * 0.8} -${r * 1.6} z"/>`;

const drops = (n: number, y: number, long = 10) => {
  let out = "";
  const x0 = 32 - ((n - 1) * 10) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 10;
    out += `<line x1="${x}" y1="${y}" x2="${x - 4}" y2="${y + long}" ${S}/>`;
  }
  return out;
};

const ICONS: Record<IconKind, string> = {
  sun: sunRays(32, 32, 12),
  moon: moon(32, 32, 14),
  partly: sunRays(40, 22, 9) + cloud(-6, 4, 0.95),
  partlyNight: moon(42, 22, 9) + cloud(-6, 4, 0.95),
  cloud: cloud(0, 2, 1.05),
  fog:
    cloud(0, -8, 0.9) +
    `<line x1="16" y1="50" x2="48" y2="50" ${S}/><line x1="20" y1="58" x2="44" y2="58" ${S}/>`,
  drizzle: cloud(0, -6, 0.95) + drops(2, 48, 7),
  rain: cloud(0, -6, 0.95) + drops(3, 48, 10),
  snow:
    cloud(0, -6, 0.95) +
    `<g ${S}><line x1="24" y1="50" x2="24" y2="58"/><line x1="20" y1="54" x2="28" y2="54"/><line x1="40" y1="50" x2="40" y2="58"/><line x1="36" y1="54" x2="44" y2="54"/></g>`,
  storm: cloud(0, -8, 0.95) + `<path ${S} d="M34 42 l-6 10 h8 l-6 10"/>`,
};

// Código WMO (Open-Meteo) → ícono. Misma agrupación que las etiquetas de src/lib/wmo.ts.
export function iconForWmo(code: number, isDay: boolean): IconKind {
  if (code === 0) return isDay ? "sun" : "moon";
  if (code === 1 || code === 2) return isDay ? "partly" : "partlyNight";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || code === 80 || code === 81) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 82 || code >= 95) return "storm";
  return "cloud";
}

/** Ícono centrado en (cx, cy) con `size` px de lado. */
export function weatherIcon(kind: IconKind, cx: number, cy: number, size: number): string {
  const k = size / 64;
  return `<g transform="translate(${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)}) scale(${k.toFixed(3)})">${ICONS[kind]}</g>`;
}
