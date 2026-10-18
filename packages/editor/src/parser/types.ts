import type { ToolSelection } from "../plugins/tool-names";
import type { ColorSwatch } from "./colors";
import type { DomAdapter } from "./dom";
import type { EmbedOptions, EmbedProvider } from "./embeds";
import type { GenesisMeta } from "./meta";

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
 * A block in BlockNote's JSON shape, without ids. Props that equal BlockNote's defaults are left out
 * (except a heading's `level`, which is always set), so the output is canonical and loads as
 * `initialContent`, `value`, or `editor.insertBlocks`.
 */
export type HtmlBlock = {
  type: string;
  props?: Record<string, string | number | boolean>;
  content?: HtmlInline[] | HtmlTableContent;
  children?: HtmlBlock[];
  /** Kept source attributes and other metadata (§16). Left out when empty. */
  meta?: GenesisMeta;
};

/**
 * `clean` (default) maps everything the editor supports. `strict` keeps only text from unknown markup and
 * snaps colours to the palette. `preserve` is phase 7.
 */
export type ParseMode = "clean" | "strict";

export type CleanOptions = {
  /** Set to `false` to skip page-furniture removal (main-content scoping, landmarks, scoring). Defaults to `true`. */
  noise?: boolean;
  /** Elements matching, inside, or containing these selectors are never removed as noise. */
  keepSelectors?: string[];
  /** Elements matching these selectors are always removed, even in small pastes. */
  dropSelectors?: string[];
  /**
   * `"collapse"` trims empty paragraphs at the start and end and turns runs of them into one;
   * `"keep"` keeps them all, so the editor's own HTML loads back unchanged. Defaults to `"collapse"`.
   */
  emptyParagraphs?: "collapse" | "keep";
  /** Extra phrases that mark page furniture when they make up most of an element's text. */
  phrases?: string[];
};

export type CleanupSummary = {
  /** Page-furniture sections removed (share bars, related links, navigation…). */
  sections: number;
  /** Why, e.g. `"share"`, `"related"`, `"navigation"`, in the order first seen. */
  labels: string[];
  /** Set when noise removal didn't run: `"small"` for pastes under 3 blocks or 500 characters, `"off"` when disabled. */
  skipped?: "small" | "off";
};

export type ParseOptions = {
  /** `"strict"` also snaps custom colors to the palette, keeps only text inside unknown elements, and drops media whose tool is off instead of linking it. Defaults to `"clean"`. */
  mode?: ParseMode;
  /** The editor's `tools`. Content for disabled tools is downgraded so the result is always editable. */
  tools?: ToolSelection;
  /** Resolves relative `src`/`href`. Falls back to the document's `<base href>`. */
  baseUrl?: string;
  /** DOM to parse with. Defaults to the browser's `DOMParser`; use `linkedomDom` from `genesis-editor/parser/linkedom` on servers. */
  dom?: DomAdapter;
  /** Page-furniture removal (§9 layers 3–5). */
  clean?: CleanOptions;
  /** Stamp top-level blocks with `meta.import` (`at`, `engine`, and `baseUrl` as `origin`). Defaults to `false`. */
  trackProvenance?: boolean;
  /** `data:` images larger than this many bytes are removed and counted in `images.failed`. Defaults to no limit. */
  maxDataImageBytes?: number;
  /** Which iframes become embeds (§8). Defaults to the `"open"` policy. Unknown iframes become links under `"allowlist"`. */
  embeds?: EmbedOptions;
  /** Extra embed providers, tried before the built-ins. A provider named like a built-in replaces it. */
  embedProviders?: readonly EmbedProvider[];
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
    /** Images dropped because no usable URL was found, or inline images over `maxDataImageBytes`. */
    failed: number;
    /** Images copied to the app's storage afterwards (editor re-hosting, `parseHTMLAsync`). */
    rehosted: number;
    /** Images whose re-upload failed; they keep their original URL. */
    rehostFailed: number;
  };
  /** Embeds created: from a provider, generic (sandboxed) iframes, and iframes the policy turned into links. */
  embeds: { provider: number; generic: number; blocked: number };
  /** What noise removal took out. Undo it by parsing again with `clean: { noise: false }`. */
  cleanup: CleanupSummary;
  warnings: string[];
};

export type ParseResult = { blocks: HtmlBlock[]; report: FidelityReport };

export type ToHTMLOptions = {
  /** Separator between top-level blocks. Defaults to `"\n"`. */
  separator?: string;
  /** `"link"` writes embeds as link cards (for email and RSS) instead of iframes. Both read back to the same block. */
  embeds?: "iframe" | "link";
  /** Custom providers, so their embeds are rebuilt on export. Without them, those embeds are written as sandboxed generic iframes. */
  embedProviders?: readonly EmbedProvider[];
  /** Brand swatches (`tools.colors.swatches`), so colours stored by swatch name export as their hex. */
  swatches?: readonly ColorSwatch[];
};
