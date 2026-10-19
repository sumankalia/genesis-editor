import type { DropReason, HtmlStyles } from "../types";

/**
 * How each element is treated. Anything not listed is `unknown`: unwrapped in `clean` mode,
 * reduced to plain text in `strict` mode.
 *
 * - `drop`: removed with its content.
 * - `block`: mapped by a block handler in `parse.ts`.
 * - `mark`: inline formatting, see `MARK_TAGS`.
 * - `wrapper`: a block-level container; its children are kept and it ends the current paragraph.
 * - `inline`: an inline container; its children are kept in the current paragraph.
 * - `line`: `<br>`.
 *
 * Landmark and noise removal (`nav`, share bars, related links) is layered on top in phase 2.
 */
export type TagClass = "drop" | "block" | "mark" | "wrapper" | "inline" | "line";

export const TAG_CLASSES: Record<string, TagClass> = {
  // Removed with content.
  script: "drop", style: "drop", noscript: "drop", template: "drop", object: "drop", embed: "drop",
  applet: "drop", form: "drop", button: "drop", select: "drop", textarea: "drop", input: "drop",
  option: "drop", datalist: "drop", output: "drop", progress: "drop", meter: "drop", svg: "drop",
  canvas: "drop", math: "drop", map: "drop", link: "drop", meta: "drop", base: "drop", title: "drop",
  head: "drop", dialog: "drop", frame: "drop", frameset: "drop", portal: "drop", slot: "drop",
  // Blocks.
  p: "block", h1: "block", h2: "block", h3: "block", h4: "block", h5: "block", h6: "block",
  ul: "block", ol: "block", li: "block", blockquote: "block", pre: "block", hr: "block",
  table: "block", figure: "block", img: "block", picture: "block", video: "block", audio: "block",
  iframe: "block", details: "block", dl: "block", caption: "block",
  // Inline formatting.
  b: "mark", strong: "mark", i: "mark", em: "mark", cite: "mark", dfn: "mark", var: "mark",
  u: "mark", ins: "mark", s: "mark", del: "mark", strike: "mark", code: "mark", kbd: "mark",
  samp: "mark", tt: "mark", mark: "mark", a: "mark", font: "mark", sub: "mark", sup: "mark",
  // Containers.
  div: "wrapper", section: "wrapper", article: "wrapper", main: "wrapper", header: "wrapper",
  footer: "wrapper", center: "wrapper", address: "wrapper", hgroup: "wrapper", body: "wrapper",
  html: "wrapper", figcaption: "wrapper", summary: "wrapper", dt: "wrapper", dd: "wrapper",
  thead: "wrapper", tbody: "wrapper", tfoot: "wrapper", tr: "wrapper", td: "wrapper", th: "wrapper",
  colgroup: "wrapper", col: "wrapper", source: "drop", track: "drop", area: "drop", wbr: "inline",
  span: "inline", small: "inline", big: "inline", abbr: "inline", acronym: "inline", time: "inline",
  data: "inline", bdi: "inline", bdo: "inline", label: "inline", q: "inline", ruby: "inline",
  rt: "drop", rp: "drop", nobr: "inline",
  nav: "wrapper", aside: "wrapper", menu: "wrapper",
  br: "line",
};

/** Why a `drop` element is dropped, for the report. */
export const DROP_REASONS: Record<string, DropReason> = {
  script: "content", style: "content", noscript: "content", template: "content", link: "content",
  meta: "content", base: "content", title: "content", head: "content",
  source: "content", track: "content", rt: "content", rp: "content", area: "content",
};

/** Styles implied by inline tags. Tools that are off are removed later. */
export const MARK_TAGS: Record<string, HtmlStyles> = {
  b: { bold: true }, strong: { bold: true },
  i: { italic: true }, em: { italic: true }, cite: { italic: true }, dfn: { italic: true }, var: { italic: true },
  u: { underline: true }, ins: { underline: true },
  s: { strike: true }, del: { strike: true }, strike: { strike: true },
  code: { code: true }, kbd: { code: true }, samp: { code: true }, tt: { code: true },
  mark: { backgroundColor: "yellow" },
};

/** Inline tags with no editor equivalent yet: their text is kept and the tag is reported. */
export const UNSUPPORTED_MARKS = new Set(["sub", "sup"]);

/** Class names that set alignment (WordPress, Bootstrap, Tailwind). */
export const ALIGN_CLASSES: Record<string, "left" | "center" | "right" | "justify"> = {
  "has-text-align-center": "center", "has-text-align-right": "right", "has-text-align-left": "left",
  "has-text-align-justify": "justify", aligncenter: "center", alignright: "right", alignleft: "left",
  "text-center": "center", "text-right": "right", "text-justify": "justify", "text-left": "left",
};

/** Class names that make an element behave like `<figure>` / `<figcaption>` (classic WordPress). */
export const FIGURE_CLASSES = new Set(["wp-caption"]);
export const FIGCAPTION_CLASSES = new Set(["wp-caption-text", "wp-element-caption"]);

/** Attributes the sanitizer keeps; everything else (including every `on*` handler) is removed. */
export const ALLOWED_ATTRIBUTES = new Set([
  "href", "src", "srcset", "sizes", "alt", "title", "width", "height", "colspan", "rowspan", "start",
  "value", "type", "checked", "class", "id", "style", "align", "bgcolor", "color", "dir", "lang",
  "role", "aria-level", "aria-checked", "aria-hidden", "hidden", "poster", "download", "cite", "span",
  "face", "size", "target",
]);

/** URL attributes, checked against `SAFE_URL`. */
export const URL_ATTRIBUTES = new Set(["href", "src", "poster", "cite"]);
