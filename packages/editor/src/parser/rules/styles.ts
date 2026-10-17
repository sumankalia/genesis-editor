/**
 * CSS properties the parser maps (see `applyInlineCss` / `blockProps` in `parse.ts`). Everything else
 * is reported as unsupported: `visual` properties change how text looks and lower the score; layout
 * properties don't.
 */
export const MAPPED_PROPERTIES = new Set([
  "font-weight", "font-style", "text-decoration", "text-decoration-line", "color", "background-color",
  "background", "text-align", "font-family", "display", "visibility", "width",
]);

export const VISUAL_PROPERTIES = new Set([
  "font-size", "letter-spacing", "text-transform", "text-shadow", "font-variant", "vertical-align",
  "word-spacing", "font-stretch", "text-decoration-color", "text-decoration-style", "opacity",
  "border", "border-left", "border-bottom", "border-top", "border-right",
]);

/** Values that mean "nothing special" and are never reported. */
export const NEUTRAL_VALUES: Record<string, (value: string) => boolean> = {
  "vertical-align": (v) => v === "baseline" || v === "top" || v === "middle",
  "font-variant": (v) => v === "normal",
  "font-variant-ligatures": () => true,
  "font-variant-caps": (v) => v === "normal",
  "font-variant-numeric": (v) => v === "normal",
  "font-variant-east-asian": (v) => v === "normal",
  "font-variant-position": (v) => v === "normal",
  "text-transform": (v) => v === "none",
  "letter-spacing": (v) => v === "normal" || parseFloat(v) === 0,
  "word-spacing": (v) => v === "normal" || parseFloat(v) === 0,
  "text-shadow": (v) => v === "none",
  "opacity": (v) => parseFloat(v) === 1,
  "border": (v) => v === "none" || v === "0",
};

/** Families that mean inline code. */
export const MONOSPACE_FONT = /\b(monospace|courier|consolas|menlo|monaco|source code pro|roboto mono|fira code|fira mono|jetbrains mono|sf mono|ubuntu mono|lucida console|inconsolata|dejavu sans mono)\b/i;

/** Column width that `%` widths resolve against. */
export const ASSUMED_COLUMN_PX = 700;
