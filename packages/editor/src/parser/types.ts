import type { ToolSelection } from "../plugins/tool-names";
import type { DomAdapter } from "./dom";

/** Inline styles in BlockNote's shape: toggles are `true`, colors are a palette name or `#rrggbb`. */
export type HtmlStyles = {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
  textColor?: string;
  backgroundColor?: string;
};

export type HtmlText = { type: "text"; text: string; styles: HtmlStyles };
export type HtmlLink = { type: "link"; href: string; content: HtmlText[] };
export type HtmlInline = HtmlText | HtmlLink;

export type HtmlTableCell = {
  type: "tableCell";
  props: {
    colspan?: number;
    rowspan?: number;
    textAlignment?: "center" | "right" | "justify";
    textColor?: string;
    backgroundColor?: string;
  };
  content: HtmlInline[];
};

export type HtmlTableContent = {
  type: "tableContent";
  columnWidths: (number | undefined)[];
  headerRows?: number;
  headerCols?: number;
  rows: { cells: HtmlTableCell[] }[];
};

/**
 * A block in BlockNote's JSON shape, without ids. Props that equal BlockNote's defaults are left out,
 * so the output is canonical and loads as `initialContent`, `value`, or `editor.insertBlocks`.
 */
export type HtmlBlock = {
  type: string;
  props?: Record<string, string | number | boolean>;
  content?: HtmlInline[] | HtmlTableContent;
  children?: HtmlBlock[];
};

/**
 * `clean` (default) maps everything the editor supports. `strict` keeps only text from unknown markup and
 * snaps colours to the palette. `preserve` is phase 7.
 */
export type ParseMode = "clean" | "strict";

export type ParseOptions = {
  mode?: ParseMode;
  /** The editor's `tools`. Content for disabled tools is downgraded so the result is always editable. */
  tools?: ToolSelection;
  /** Resolves relative `src`/`href`. Falls back to the document's `<base href>`. */
  baseUrl?: string;
  /** DOM to parse with. Defaults to the browser's `DOMParser`; use `linkedomDom` from `genesis-editor/parser/linkedom` on servers. */
  dom?: DomAdapter;
  /** Longer input is truncated, with a warning. Defaults to 10 MB. */
  maxLength?: number;
  /** Deeper elements are ignored, with a warning. Defaults to 512. */
  maxDepth?: number;
};

export type DropReason = "content" | "noise" | "hidden" | "tracking" | "unsupported" | "embed" | "unsafe";

export type FidelityReport = {
  mode: ParseMode;
  /** 0–1: the share of mapped source elements, counting downgrades as half and lost visual styles as a tenth. */
  score: number;
  /** Top-level blocks produced. */
  blocks: number;
  /** Elements removed, with their content, and a short text preview of the first one. */
  dropped: { tag: string; reason: DropReason; count: number; preview?: string }[];
  /** Wrapper elements removed while keeping their content. */
  unwrapped: { tag: string; count: number }[];
  /** CSS properties that have no equivalent in the editor. `visual` ones lower the score. */
  unsupportedStyles: { prop: string; count: number; visual: boolean }[];
  /** Content converted to a simpler form, e.g. because its tool is off. */
  downgrades: { from: string; to: string; count: number }[];
  colors: { palette: number; hex: number };
  headings: { promoted: number; dropped: number };
  images: {
    total: number;
    /** Relative URLs made absolute with `baseUrl` or `<base href>`. */
    resolved: number;
    /** Relative URLs left as they are because there was no base URL. */
    unresolved: number;
    /** Images dropped because no usable URL was found. */
    failed: number;
  };
  warnings: string[];
};

export type ParseResult = { blocks: HtmlBlock[]; report: FidelityReport };

export type ToHTMLOptions = {
  /** Separator between top-level blocks. Defaults to `"\n"`. */
  separator?: string;
};
