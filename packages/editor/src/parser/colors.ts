/** BlockNote's default palette (`COLORS_DEFAULT`), copied so the parser has no BlockNote runtime import. */
export const PALETTE = {
  gray: { text: "#9b9a97", background: "#ebeced" },
  brown: { text: "#64473a", background: "#e9e5e3" },
  red: { text: "#e03e3e", background: "#fbe4e4" },
  orange: { text: "#d9730d", background: "#f6e9d9" },
  yellow: { text: "#dfab01", background: "#fbf3db" },
  green: { text: "#4d6461", background: "#ddedea" },
  blue: { text: "#0b6e99", background: "#ddebf1" },
  purple: { text: "#6940a5", background: "#eae4f2" },
  pink: { text: "#ad1a72", background: "#f4dfeb" },
} as const;

export type PaletteName = keyof typeof PALETTE;
type Rgb = [number, number, number];

/** Colors within this CIEDE2000 distance of a palette swatch snap to it. */
export const PALETTE_DELTA_E = 3;

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  yellow: "#ffff00", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", gray: "#808080",
  grey: "#808080", silver: "#c0c0c0", maroon: "#800000", navy: "#000080", teal: "#008080",
  olive: "#808000", lime: "#00ff00", aqua: "#00ffff", cyan: "#00ffff", fuchsia: "#ff00ff",
  magenta: "#ff00ff", brown: "#a52a2a", darkred: "#8b0000", darkblue: "#00008b",
  darkgreen: "#006400", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3", gold: "#ffd700", indigo: "#4b0082", violet: "#ee82ee", crimson: "#dc143c",
  tomato: "#ff6347", coral: "#ff7f50", salmon: "#fa8072", khaki: "#f0e68c", beige: "#f5f5dc",
  ivory: "#fffff0", lavender: "#e6e6fa", whitesmoke: "#f5f5f5", dimgray: "#696969",
  dimgrey: "#696969", slategray: "#708090", steelblue: "#4682b4", royalblue: "#4169e1",
  dodgerblue: "#1e90ff", skyblue: "#87ceeb", lightblue: "#add8e6", lightyellow: "#ffffe0",
  lightgreen: "#90ee90", forestgreen: "#228b22", seagreen: "#2e8b57", darkorange: "#ff8c00",
  hotpink: "#ff69b4", deeppink: "#ff1493", chocolate: "#d2691e", sienna: "#a0522d", tan: "#d2b48c",
};

function hexToRgb(hex: string): Rgb | undefined {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  else if (h.length === 8) h = h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(h)) return undefined;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** Parses a CSS color to RGB. Transparent, `inherit`, `currentColor`, and unparsable values give `undefined`. */
export function parseColor(value: string): Rgb | undefined {
  const v = value.trim().toLowerCase();
  if (v.startsWith("#")) {
    if (v.length === 5 && v[4] === "0") return undefined;
    if (v.length === 9 && v.slice(7) === "00") return undefined;
    return hexToRgb(v);
  }
  if (NAMED[v]) return hexToRgb(NAMED[v]);
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(v);
  if (!fn) return undefined;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return undefined;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if (!(alpha > 0.05)) return undefined;
  if (fn[1].startsWith("rgb")) {
    const channels = parts.slice(0, 3).map((p) => (p.endsWith("%") ? (parseFloat(p) * 255) / 100 : parseFloat(p)));
    if (channels.some((c) => Number.isNaN(c))) return undefined;
    return channels.map((c) => Math.max(0, Math.min(255, Math.round(c)))) as Rgb;
  }
  const [h, s, l] = [parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100];
  if ([h, s, l].some((n) => Number.isNaN(n))) return undefined;
  return hslToRgb(((h % 360) + 360) % 360, s, l);
}

export function toHex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function toLab([r, g, b]: Rgb): Rgb {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const labCache = new Map<string, Rgb>();
function lab(hex: string) {
  let value = labCache.get(hex);
  if (!value) {
    value = toLab(hexToRgb(hex)!);
    labCache.set(hex, value);
  }
  return value;
}

/** CIEDE2000 colour difference. */
export function deltaE2000(hexA: string, hexB: string) {
  const [L1, a1, b1] = lab(hexA);
  const [L2, a2, b2] = lab(hexB);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbarp += h1p + h2p < 360 ? 360 : -360;
    hbarp /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** Text colours that mean "default text" (§4). */
const DEFAULT_TEXT = ["#000000", "#111111", "#1f1f1f", "#202124", "#222222", "#333333", "#37352f"];
const DEFAULT_BACKGROUND = ["#ffffff"];
const DEFAULT_DELTA_E = 5;

/**
 * Maps a CSS color to what the editor stores (§4): a palette name within ΔE2000 ≤ 3 of its light-theme
 * value, otherwise lowercase `#rrggbb`. Default-looking colours (near-black text, white backgrounds),
 * transparent and unparsable values give `undefined`. With `allowHex: false` (strict mode) every colour
 * snaps to the nearest palette name.
 */
export function editorColor(value: string, kind: "text" | "background", allowHex = true): string | undefined {
  const rgb = parseColor(value);
  if (!rgb) return undefined;
  const hex = toHex(rgb);
  const defaults = kind === "text" ? DEFAULT_TEXT : DEFAULT_BACKGROUND;
  if (defaults.some((d) => deltaE2000(hex, d) <= DEFAULT_DELTA_E)) return undefined;
  let best: PaletteName = "gray";
  let bestDistance = Infinity;
  for (const name of Object.keys(PALETTE) as PaletteName[]) {
    const distance = deltaE2000(hex, PALETTE[name][kind]);
    if (distance < bestDistance) [best, bestDistance] = [name, distance];
  }
  if (bestDistance <= PALETTE_DELTA_E) return best;
  return allowHex ? hex : nearestByHue(hex);
}

/**
 * Strict mode's fallback: the palette name a person would call the colour. Nearest-ΔE2000 is dominated
 * by lightness and maps pure blue to purple and hot pink backgrounds to green, so this buckets by hue.
 */
function nearestByHue(hex: string): PaletteName {
  const [r, g, b] = hexToRgb(hex)!.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15 || d < 0.08) return "gray";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h >= 345 || h < 15) return l < 0.3 && s < 0.6 ? "brown" : "red";
  if (h < 45) return l < 0.4 ? "brown" : "orange";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 250) return "blue";
  if (h < 320) return "purple";
  return "pink";
}

export function isPaletteName(value: string | null | undefined): value is PaletteName {
  return !!value && Object.prototype.hasOwnProperty.call(PALETTE, value);
}

/** The CSS value for a stored color: palette names map to their hex value. */
export function cssColor(value: string, kind: "text" | "background") {
  return value in PALETTE ? PALETTE[value as PaletteName][kind] : /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}
