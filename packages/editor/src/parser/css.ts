export type Declarations = ReadonlyMap<string, string>;

const EMPTY: Declarations = new Map();
const cache = new Map<string, Declarations>();
const CACHE_LIMIT = 5000;

/** Parses a `style` attribute. Memoized: Google Docs and Word repeat the same long strings on every span. */
export function parseStyle(style: string | null | undefined): Declarations {
  if (!style) return EMPTY;
  const cached = cache.get(style);
  if (cached) return cached;
  const declarations = new Map<string, string>();
  for (const part of style.replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, "")
      .trim();
    if (prop && value) declarations.set(prop, value);
  }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(style, declarations);
  return declarations;
}

/** CSS length to px. `%` resolves against `percentOf`; `em`/`rem` against 16px. */
export function toPx(value: string | null | undefined, percentOf?: number): number | undefined {
  if (!value) return undefined;
  const match = /^(-?[\d.]+)\s*(px|pt|em|rem|%|in|cm|mm)?$/i.exec(value.trim());
  if (!match) return undefined;
  const n = parseFloat(match[1]);
  if (Number.isNaN(n)) return undefined;
  switch ((match[2] ?? "px").toLowerCase()) {
    case "px":
      return n;
    case "pt":
      return (n * 4) / 3;
    case "em":
    case "rem":
      return n * 16;
    case "in":
      return n * 96;
    case "cm":
      return (n * 96) / 2.54;
    case "mm":
      return (n * 96) / 25.4;
    case "%":
      return percentOf === undefined ? undefined : (n / 100) * percentOf;
  }
  return undefined;
}
