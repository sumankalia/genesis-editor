import { parseStyle, toPx } from "./css";
import { ELEMENT_NODE } from "./dom";
import type { HtmlBlock } from "./types";

const ELEMENT = ELEMENT_NODE;
const MEDIA = "img, picture, figure, video";
const TEXT_BLOCKS = "p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, li";
const HARD_BREAK = /^(table|hr|pre|iframe)$/;
const BLOCK_CHILD = /^(p|div|h[1-6]|ul|ol|blockquote|figure|img|picture)$/;

const lower = (node: Node) => node.nodeName.toLowerCase();
const elementChildren = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === ELEMENT);
const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

/** Equal split that sums to 100 (2 → 50/50, 3 → 33/33/34). */
export function splitWidths(count: number): number[] {
  const n = Math.min(3, Math.max(2, Math.round(count)));
  const base = Math.floor(100 / n);
  const widths = Array.from({ length: n }, () => base);
  widths[n - 1] += 100 - base * n;
  return widths;
}

/** Scale positive widths so they sum to 100, then round with remainder on the last column. */
export function normalizeWidths(values: number[], count: number): number[] {
  const n = Math.min(3, Math.max(2, count));
  const raw = values.slice(0, n).map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  while (raw.length < n) raw.push(0);
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return splitWidths(n);
  const scaled = raw.map((value) => (value / sum) * 100);
  const rounded = scaled.map((value) => Math.max(1, Math.round(value)));
  const drift = 100 - rounded.reduce((a, b) => a + b, 0);
  rounded[n - 1] += drift;
  return rounded.map((value) => Math.min(99, Math.max(1, value)));
}

/** Adjacent-column resize: keep the pair's total, each at least `min`. */
export function resizePair(left: number, right: number, nextLeft: number, min = 15): [number, number] {
  const total = left + right;
  const lo = min;
  const hi = total - min;
  const clamped = Math.min(hi, Math.max(lo, Math.round(nextLeft)));
  return [clamped, total - clamped];
}

export function columnWidthOf(block: HtmlBlock | { props?: Record<string, unknown> } | undefined): number {
  const value = Number(block?.props?.width);
  return Number.isFinite(value) && value > 0 ? value : 50;
}

/**
 * 40/60 when one of two columns is a lone image (the Google Docs wrap). Equal otherwise.
 */
export function layoutWidths(columns: HtmlBlock[]): number[] {
  if (columns.length === 2) {
    const imageOnly = (column: HtmlBlock) => {
      const kids = column.children ?? [];
      return kids.length === 1 && kids[0].type === "image";
    };
    if (imageOnly(columns[0]) && !imageOnly(columns[1])) return [40, 60];
    if (!imageOnly(columns[0]) && imageOnly(columns[1])) return [60, 40];
  }
  return splitWidths(columns.length);
}

function cellText(el: Element) {
  const clone = el.cloneNode(true) as Element;
  for (const media of Array.from(clone.querySelectorAll(MEDIA))) media.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** A cell whose notable content is a heading, a list, several blocks, or a long paragraph. */
export function isSubstantialTextCell(el: Element): boolean {
  if (el.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']")) return true;
  if (el.querySelector("ul, ol, blockquote")) return true;
  const blocks = elementChildren(el).filter((child) => BLOCK_CHILD.test(lower(child)));
  const text = cellText(el);
  if (blocks.length >= 2 && text.length >= 40) return true;
  return text.length >= 80;
}

/** A cell that holds media and is not itself a text column. */
export function isImageCell(el: Element): boolean {
  return Boolean(el.querySelector("img, picture, video")) && !isSubstantialTextCell(el);
}

export function tableCellElements(tr: Element) {
  return elementChildren(tr).filter((child) => lower(child) === "td" || lower(child) === "th");
}

function colgroupWidths(table: Element, count: number): number[] | undefined {
  const cols = elementChildren(table).flatMap((child) =>
    lower(child) === "colgroup" ? elementChildren(child) : lower(child) === "col" ? [child] : [],
  );
  if (!cols.length) return undefined;
  const values: number[] = [];
  for (const col of cols) {
    const span = Math.max(1, Number(col.getAttribute("span")) || 1);
    const decl = parseStyle(col.getAttribute("style"));
    const raw = decl.get("width") ?? col.getAttribute("width") ?? undefined;
    const percent = raw && /%$/.test(raw) ? parseFloat(raw) : toPx(raw);
    for (let i = 0; i < span; i++) values.push(percent && percent > 0 ? percent : 0);
  }
  return values.length >= count ? values.slice(0, count) : undefined;
}

export function widthsFromTable(table: Element, cells: Element[], count: number): number[] {
  const marked = table.getAttribute("data-genesis-column-widths");
  if (marked) {
    const nums = marked.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length) return normalizeWidths(nums, count);
  }
  const cols = colgroupWidths(table, count);
  if (cols?.some((n) => n > 0)) return normalizeWidths(cols, count);
  const cellWidths = cells.map((cell) => {
    const decl = parseStyle(cell.getAttribute("style"));
    const raw = decl.get("width") ?? cell.getAttribute("width") ?? undefined;
    if (raw && /%$/.test(raw)) return parseFloat(raw);
    return toPx(raw) ?? 0;
  });
  if (cellWidths.some((n) => n > 0)) return normalizeWidths(cellWidths, count);
  return splitWidths(count);
}

export type LayoutTable = {
  cells: Element[];
  widths: number[];
  marked: boolean;
};

/**
 * A 1-row, 2–3 cell table that is either our exported columns (`data-genesis-columns`)
 * or an image|text layout (not a data table or an image grid).
 */
export function layoutTable(table: Element, rows: { tr: Element }[]): LayoutTable | null {
  if (rows.length !== 1) return null;
  const cells = tableCellElements(rows[0].tr);
  if (cells.length < 2 || cells.length > 3) return null;
  const marked = table.hasAttribute("data-genesis-columns") || classes(table).includes("genesis-columns");
  if (marked) return { cells, widths: widthsFromTable(table, cells, cells.length), marked: true };
  const images = cells.filter(isImageCell).length;
  const texts = cells.filter(isSubstantialTextCell).length;
  if (images < 1 || texts < 1) return null;
  return { cells, widths: widthsFromTable(table, cells, cells.length), marked: false };
}

export function floatSide(el: Element): "left" | "right" | undefined {
  const decl = parseStyle(el.getAttribute("style"));
  const css = (decl.get("float") ?? "").toLowerCase();
  if (css === "left" || css === "right") return css;
  const align = (el.getAttribute("align") ?? "").toLowerCase();
  if (align === "left" || align === "right") return align;
  return undefined;
}

function isFloatedMedia(el: Element): "left" | "right" | undefined {
  const tag = lower(el);
  if (tag === "img" || tag === "picture" || tag === "figure") return floatSide(el) ?? (tag === "figure" ? floatSide(elementChildren(el).find((c) => lower(c) === "img") ?? el) : undefined);
  const inner = el.querySelector?.("img, picture, figure");
  return inner ? floatSide(inner) ?? floatSide(el) : floatSide(el);
}

function isHardBreak(node: Node): boolean {
  if (node.nodeType !== ELEMENT) return false;
  const el = node as Element;
  if (HARD_BREAK.test(lower(el))) return true;
  const clear = parseStyle(el.getAttribute("style")).get("clear") ?? "";
  return Boolean(clear) && clear !== "none";
}

function notableChild(el: Element): Element | undefined {
  return elementChildren(el).find((child) => {
    if (lower(child) === "br") return false;
    if (child.nodeType === ELEMENT && !(child.textContent ?? "").trim() && !child.querySelector("img, picture, figure, video")) return false;
    return true;
  });
}

export type FloatRun = {
  media: Element;
  side: "left" | "right";
  /** Nodes in the parent, starting at the floated media (or its wrapper) through the last wrapped sibling. */
  nodes: Node[];
};

/**
 * A floated image/figure (or a wrapper that is only that image) plus following siblings until a
 * table, divider, another float, or a clear. Needs at least one following text-ish sibling, or
 * substantial text in the same wrapper as the image.
 */
export function floatLayoutRun(start: Node, parent: Node | null): FloatRun | null {
  if (!parent || start.nodeType !== ELEMENT) return null;
  const el = start as Element;
  const tag = lower(el);
  const direct = isFloatedMedia(el);
  const inner = !direct && (tag === "p" || tag === "div" || tag === "span") ? notableChild(el) : undefined;
  const innerSide = inner ? isFloatedMedia(inner) : undefined;
  const side = direct ?? innerSide;
  if (!side) return null;
  const media = direct ? (tag === "img" || tag === "picture" || tag === "figure" ? el : (el.querySelector("img, picture, figure") as Element | null) ?? el) : inner!;

  const sameWrapperText = !direct && isSubstantialTextCell(el);
  const nodes: Node[] = [start];
  if (!sameWrapperText) {
    for (let sib = start.nextSibling; sib; sib = sib.nextSibling) {
      if (sib.nodeType === ELEMENT && isHardBreak(sib)) break;
      if (sib.nodeType === ELEMENT && floatSide(sib as Element)) break;
      if (sib.nodeType === ELEMENT && isFloatedMedia(sib as Element)) break;
      if (sib.nodeType === ELEMENT && (sib as Element).querySelector?.("img, picture") && !isSubstantialTextCell(sib as Element) && !floatSide(sib as Element)) {
        // A full-width image starts a new block, not the wrap.
        if (lower(sib as Element) === "img" || lower(sib as Element) === "figure" || lower(sib as Element) === "picture") break;
      }
      nodes.push(sib);
    }
  }

  const hasFollow = nodes.length > 1 || sameWrapperText;
  if (!hasFollow) return null;
  const restText = nodes.slice(1).some((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim().length > 0 || (node.nodeType === ELEMENT && (node as Element).querySelector?.(TEXT_BLOCKS)));
  if (!sameWrapperText && !restText) return null;
  return { media, side, nodes };
}

export function emptyParagraph(): HtmlBlock {
  return { type: "paragraph", content: [] };
}

export function columnBlock(width: number, children: HtmlBlock[]): HtmlBlock {
  return { type: "column", props: { width }, children: children.length ? children : [emptyParagraph()] };
}

export function columnListBlock(columns: HtmlBlock[]): HtmlBlock {
  return { type: "columnList", children: columns };
}
