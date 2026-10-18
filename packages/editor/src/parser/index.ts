export { parseHTML } from "./parse";
export { toHTML } from "./serialize";
export { browserDom, type DomAdapter } from "./dom";
export { isSafeUrl } from "./sanitize";
export { PALETTE, type PaletteName } from "./colors";
export type {
  DropReason,
  FidelityReport,
  HtmlBlock,
  HtmlInline,
  HtmlLink,
  HtmlStyles,
  HtmlTableCell,
  HtmlTableContent,
  HtmlText,
  ParseMode,
  ParseOptions,
  ParseResult,
  ToHTMLOptions,
} from "./types";
