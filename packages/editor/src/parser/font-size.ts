/** The sizes the `fontSize` tool offers, in px (§5). 16 is the default and stores no mark. */
export const FONT_SIZES = [6, 8, 10, 12, 14, 16, 18, 20] as const;

export const DEFAULT_FONT_SIZE = 16;

/** Whether `value` is a stored font size: one of the steps other than the default, as `"14px"`. */
export function isFontSize(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d+px$/.test(value)) return false;
  const px = parseInt(value, 10);
  return px !== DEFAULT_FONT_SIZE && (FONT_SIZES as readonly number[]).includes(px);
}

/**
 * The step for an effective size in px: clamped to 6–20, then the nearest step, rounding ties up.
 * `size` is `undefined` for the default.
 */
export function snapFontSize(px: number): { size?: string; clamped: boolean } {
  const min = FONT_SIZES[0];
  const max = FONT_SIZES[FONT_SIZES.length - 1];
  const clamped = px < min - 0.5 || px > max + 0.5;
  const value = Math.max(min, Math.min(max, px));
  let best: number = FONT_SIZES[0];
  for (const step of FONT_SIZES) if (Math.abs(step - value) <= Math.abs(best - value)) best = step;
  return { size: best === DEFAULT_FONT_SIZE ? undefined : `${best}px`, clamped };
}

/** The next step up or down from a stored size (`undefined` = default), or the same size at either end. */
export function stepFontSize(current: string | undefined, direction: 1 | -1): string | undefined {
  const px = isFontSize(current) ? parseInt(current, 10) : DEFAULT_FONT_SIZE;
  const index = FONT_SIZES.indexOf(px as (typeof FONT_SIZES)[number]);
  const next = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, index + direction))];
  return next === DEFAULT_FONT_SIZE ? undefined : `${next}px`;
}
