import { deltaE2000, editorColor, isPaletteName, parseColor } from "./colors";
import { parseStyle, toPx, type Declarations } from "./css";
import { defaultDom, ELEMENT_NODE, TEXT_NODE } from "./dom";
import {
  finalizeRuns,
  inlineText,
  inlineToRuns,
  mapStyles,
  runsToInline,
  splitAtDoubleBreaks,
  type Run,
} from "./inline";
import { removeNoise } from "./noise";
import { ReportBuilder } from "./report";
import { LAZY_SRC_ATTRIBUTES, LAZY_SRCSET_ATTRIBUTES, PLACEHOLDER_SRC } from "./rules/noise";
import { ASSUMED_COLUMN_PX, MAPPED_PROPERTIES, MONOSPACE_FONT, NEUTRAL_VALUES } from "./rules/styles";
import {
  ALIGN_CLASSES,
  FIGCAPTION_CLASSES,
  FIGURE_CLASSES,
  MARK_TAGS,
  TAG_CLASSES,
  UNSUPPORTED_MARKS,
} from "./rules/tags";
import { sanitizeTree } from "./sanitize";
import { nearestLevel, resolveTools, type ParserTools } from "./tools";
import type {
  HtmlBlock,
  HtmlInline,
  HtmlStyles,
  HtmlTableCell,
  HtmlTableContent,
  ParseMode,
  ParseOptions,
  ParseResult,
} from "./types";
import { cleanHref, isTrackerUrl, largestSrcsetCandidate, resolveUrl } from "./urls";

type Alignment = "left" | "center" | "right" | "justify";
type Container = "root" | "list" | "quote" | "cell" | "heading";

/** Formatting in effect while walking. `false` cancels an inherited toggle (Docs' `font-weight:400`). */
type Ctx = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
  link?: string;
  pre: boolean;
  size: number;
  align?: Alignment;
  textOnly: boolean;
  container: Container;
  listDepth: number;
  depth: number;
};

type State = {
  mode: ParseMode;
  tools: ParserTools;
  base?: string;
  report: ReportBuilder;
  maxDepth: number;
  /** Characters of body text per font size, to find the source's body size. */
  sizes: Map<number, number>;
  /** Paragraphs that may be styled headings, checked once the body size is known. */
  candidates: WeakMap<HtmlBlock, { chars: number; bold: boolean; minSize: number }>;
};

const KEYWORD_SIZES: Record<string, number> = {
  "xx-small": 9, "x-small": 10, small: 13, medium: 16, large: 18, "x-large": 24, "xx-large": 32, "xxx-large": 48,
};
const FONT_TAG_SIZES = [0, 10, 13, 16, 18, 24, 32, 48];
const CLASS_HEADINGS: Record<string, number> = {
  MsoTitle: 1, MsoSubtitle: 2, MsoHeading1: 1, MsoHeading2: 2, MsoHeading3: 3, MsoHeading4: 4,
  MsoHeading5: 5, MsoHeading6: 6, Heading1: 1, Heading2: 2, Heading3: 3, Heading4: 4, Heading5: 5, Heading6: 6,
};
/** Default link colours of Docs, browsers, Word, Google, Wikipedia and WordPress. */
const LINK_COLORS = ["#1155cc", "#0000ee", "#0563c1", "#0b57d0", "#1a0dab", "#0645ad", "#2271b1"];
const PERMALINK_TEXT = /^\s*(#|¶|§|🔗|link)?\s*$/i;
const PERMALINK_CLASS = /(^|[\s_-])(anchor|anchorjs-link|heading-link|header-anchor|permalink|hash-link|headerlink)($|[\s_-])/i;
const HEADING_TAG = /^h([1-6])$/;

/** Default props BlockNote fills in; left out of the output. */
const BLOCK_PROPS: Record<string, string[]> = {
  paragraph: ["textAlignment", "textColor", "backgroundColor"],
  heading: ["textAlignment", "textColor", "backgroundColor"],
  bulletListItem: ["textAlignment", "textColor", "backgroundColor"],
  numberedListItem: ["textAlignment", "textColor", "backgroundColor"],
  checkListItem: ["textAlignment", "textColor", "backgroundColor"],
  toggleListItem: ["textAlignment", "textColor", "backgroundColor"],
  quote: ["textColor", "backgroundColor"],
};

const lower = (node: Node) => node.nodeName.toLowerCase();
const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
const elementChildren = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === ELEMENT_NODE);

/**
 * Parses HTML into editor blocks plus a fidelity report. Pure: no editor instance, React, or BlockNote
 * runtime needed, so it runs in browsers, Node (with `linkedomDom`), edge runtimes, and workers.
 */
export function parseHTML(html: string, options: ParseOptions = {}): ParseResult {
  const mode = options.mode ?? "clean";
  const report = new ReportBuilder();
  const maxLength = options.maxLength ?? 10 * 1024 * 1024;
  if (html.length > maxLength) {
    html = html.slice(0, maxLength);
    report.warn(`Input longer than ${maxLength} characters was truncated.`);
  }
  const document = (options.dom ?? defaultDom()).parse(html);
  const baseHref = document.querySelector?.("base[href]")?.getAttribute("href") ?? undefined;
  const state: State = {
    mode,
    tools: resolveTools(options.tools),
    base: options.baseUrl ?? (baseHref && /^https?:/i.test(baseHref) ? baseHref : undefined),
    report,
    maxDepth: options.maxDepth ?? 512,
    sizes: new Map(),
    candidates: new WeakMap(),
  };
  const body = document.body ?? document.documentElement;
  if (!body) return { blocks: [], report: report.build(mode, 0) };
  // Before sanitizing, so elements inside removed furniture aren't reported as unsupported.
  report.cleanup = removeNoise(body, html, report, options.clean);
  sanitizeTree(body, report);

  const root = new Sink(state, paragraphMaker(state, {}, true), { synthetic: true });
  const ctx: Ctx = { pre: false, size: 16, textOnly: false, container: "root", listDepth: 0, depth: 0 };
  flow(body, ctx, root, state);
  root.flush();
  let blocks = root.blocks;
  promoteStyledHeadings(blocks, state);
  blocks = clampListDepth(blocks, 6);
  blocks = emptyWhitespaceOnly(blocks);
  if (options.clean?.emptyParagraphs !== "keep") blocks = collapseEmptyParagraphs(blocks, report);
  countFontSizes(blocks, state);
  return { blocks, report: report.build(mode, blocks.length) };
}

// ---------------------------------------------------------------------------------------------
// Sinks collect inline runs and blocks. A flush turns pending runs into a block via `make`.

type Maker = (content: HtmlInline[], runs: Run[]) => HtmlBlock | undefined;

class Sink {
  runs: Run[] = [];
  blocks: HtmlBlock[] = [];
  constructor(
    protected state: State,
    protected make: Maker,
    protected options: { synthetic?: boolean } = {},
  ) {}

  addRun(run: Run) {
    this.runs.push(run);
  }

  flush() {
    if (!this.runs.length) return;
    const groups = this.options.synthetic ? splitAtDoubleBreaks(this.runs) : [this.runs];
    this.runs = [];
    for (const group of groups) {
      const runs = finalizeRuns(group);
      if (!runs) continue;
      for (const run of runs) {
        if (!run.pre || !run.fromBr) this.state.sizes.set(Math.round(run.size), (this.state.sizes.get(Math.round(run.size)) ?? 0) + run.text.length);
      }
      const block = this.make(runsToInline(runs), runs);
      if (block) this.accept(block);
    }
  }

  push(...blocks: HtmlBlock[]) {
    this.flush();
    for (const block of blocks) this.accept(block);
  }

  protected accept(block: HtmlBlock) {
    this.blocks.push(block);
  }

  /** The block a following `data-genesis-children` container belongs to. */
  lastBlock(): HtmlBlock | undefined {
    return this.blocks[this.blocks.length - 1];
  }
}

/** First paragraph-like content becomes the head block; everything after it becomes its children. */
class HeadSink extends Sink {
  head?: HtmlBlock;
  constructor(
    state: State,
    private makeHead: (content: HtmlInline[]) => HtmlBlock,
    private headTakesParagraph: (block: HtmlBlock) => boolean = (b) => b.type === "paragraph",
  ) {
    super(state, (content) => ({ type: "paragraph", content }));
  }

  flush() {
    if (!this.runs.length) return;
    const runs = finalizeRuns(this.runs);
    this.runs = [];
    if (!runs) return;
    const content = runsToInline(runs);
    if (!this.head) this.head = this.makeHead(content);
    else this.child({ type: "paragraph", content });
  }

  protected accept(block: HtmlBlock) {
    if (!this.head && this.headTakesParagraph(block)) {
      this.head = this.makeHead(block.content as HtmlInline[]);
      if (block.children?.length) this.head.children = [...(this.head.children ?? []), ...block.children];
      return;
    }
    if (!this.head) this.head = this.makeHead([]);
    this.child(block);
  }

  private child(block: HtmlBlock) {
    (this.head!.children ??= []).push(block);
  }

  lastBlock() {
    this.flush();
    return this.head?.children?.[this.head.children.length - 1] ?? this.head;
  }

  result() {
    this.flush();
    return this.head;
  }
}

/** Joins everything textual into one heading; other blocks are emitted after it (§6). */
class HeadingSink extends Sink {
  content: HtmlInline[] = [];
  after: HtmlBlock[] = [];
  constructor(state: State) {
    super(state, () => undefined);
  }

  private append(content: HtmlInline[] | undefined) {
    if (!content?.length) return;
    if (this.content.length) this.content = runsToInline([...inlineToRuns(this.content), ...inlineToRuns([{ type: "text", text: " ", styles: {} }]), ...inlineToRuns(content)]);
    else this.content = content;
  }

  flush() {
    if (!this.runs.length) return;
    const runs = finalizeRuns(this.runs);
    this.runs = [];
    if (runs) this.append(runsToInline(runs));
  }

  protected accept(block: HtmlBlock) {
    if (block.type === "paragraph" || block.type === "heading") this.append(block.content as HtmlInline[]);
    else this.after.push(block);
  }
}

/** Table cells hold inline content only: blocks become lines (§3). */
class CellSink extends Sink {
  lines: Run[][] = [];
  constructor(state: State) {
    super(state, () => undefined);
  }

  flush() {
    if (!this.runs.length) return;
    const runs = finalizeRuns(this.runs);
    this.runs = [];
    if (runs) this.lines.push(runs);
  }

  protected accept(block: HtmlBlock) {
    const prefix = block.type === "bulletListItem" || block.type === "checkListItem" ? "• " : block.type === "numberedListItem" ? "1. " : "";
    if (block.type === "image" || block.type === "video" || block.type === "audio") {
      this.state.report.drop(block.type === "image" ? "img" : block.type, "unsupported", String(block.props?.url ?? ""));
    } else if (block.type === "table") {
      for (const row of (block.content as HtmlTableContent).rows) {
        this.lines.push(row.cells.flatMap((cell, i) => [...(i ? inlineToRuns([{ type: "text", text: " ", styles: {} }]) : []), ...inlineToRuns(cell.content)]));
      }
      this.state.report.downgrade("table in table", "text");
    } else if (block.type === "codeBlock") {
      this.lines.push(inlineToRuns(block.content as HtmlInline[], this.state.tools.has("code") ? { code: true } : {}));
    } else if (Array.isArray(block.content)) {
      const runs = inlineToRuns(block.content);
      if (prefix && runs.length) runs.unshift({ ...runs[0], text: prefix, styles: {}, link: undefined });
      this.lines.push(runs);
      if (prefix) this.state.report.downgrade(block.type, "text in table cell");
    }
    for (const child of block.children ?? []) this.accept(child);
  }

  content(): HtmlInline[] {
    this.flush();
    const runs: Run[] = [];
    this.lines.forEach((line, i) => {
      if (i) runs.push({ text: "\n", styles: {}, pre: true, size: 16, sourceBold: false });
      runs.push(...line);
    });
    return runsToInline(runs);
  }
}

// ---------------------------------------------------------------------------------------------
// Walk.

function flow(node: Node, ctx: Ctx, sink: Sink, state: State) {
  for (let child = node.firstChild; child; child = child.nextSibling) visit(child, ctx, sink, state);
}

function visit(node: Node, ctx: Ctx, sink: Sink, state: State) {
  if (node.nodeType === TEXT_NODE) {
    const text = node.nodeValue ?? "";
    if (text) sink.addRun(makeRun(text, ctx, state));
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as Element;
  const tag = lower(el);
  if (ctx.depth >= state.maxDepth) {
    state.report.warn(`Content nested deeper than ${state.maxDepth} levels was dropped.`);
    return;
  }
  const decl = parseStyle(el.getAttribute("style"));
  if (isHidden(el, decl)) {
    state.report.drop(tag, "hidden", el.textContent);
    return;
  }
  const next: Ctx = { ...ctx, depth: ctx.depth + 1 };

  if (ctx.textOnly) {
    if (tag === "br") sink.addRun(makeRun("", next, state, true));
    else flow(el, next, sink, state);
    return;
  }

  const headingLevel = headingLevelOf(el, tag);
  if (headingLevel) return heading(el, headingLevel, decl, next, sink, state);

  if (el.hasAttribute("data-genesis-children")) return nestedChildren(el, next, sink, state);
  const cls = classes(el);
  if (cls.some((c) => FIGURE_CLASSES.has(c))) return figure(el, decl, next, sink, state);
  if (cls.includes("wp-block-file") && fileBlock(el, sink, state)) return;

  const kind = TAG_CLASSES[tag] ?? (tag.includes(":") ? "inline" : undefined);
  switch (kind) {
    case "line":
      sink.addRun(makeRun("", next, state, true));
      return;
    case "mark":
    case "inline":
      return inline(el, tag, decl, next, sink, state);
    case "wrapper":
      reportStyles(el, decl, state);
      sink.flush();
      flow(el, wrapperCtx(el, decl, next, state), sink, state);
      sink.flush();
      if (tag !== "body" && tag !== "html") state.report.unwrap(tag);
      return;
    case "block":
      return block(el, tag, decl, next, sink, state);
    case "drop":
      return;
    default:
      state.report.unwrap(tag);
      if (state.mode === "strict") flow(el, { ...next, textOnly: true }, sink, state);
      else flow(el, next, sink, state);
  }
}

/** `toHTML` writes children of non-list blocks into `<div data-genesis-children>` right after the block. */
function nestedChildren(el: Element, ctx: Ctx, sink: Sink, state: State) {
  sink.flush();
  const sub = new Sink(state, paragraphMaker(state, {}, false), { synthetic: true });
  flow(el, { ...ctx, align: undefined, container: "root" }, sub, state);
  sub.flush();
  const parent = sink.lastBlock();
  if (parent && parent.type !== "table") (parent.children ??= []).push(...sub.blocks);
  else sink.push(...sub.blocks);
}

function isHidden(el: Element, decl: Declarations) {
  if (el.hasAttribute("hidden")) return true;
  if (decl.get("display") === "none" || decl.get("visibility") === "hidden") return true;
  return el.getAttribute("aria-hidden") === "true" && !(el.textContent ?? "").trim() && lower(el) !== "img";
}

function makeRun(text: string, ctx: Ctx, state: State, br = false): Run {
  const { tools } = state;
  const styles: HtmlStyles = {};
  if (ctx.bold && tools.has("bold")) styles.bold = true;
  if (ctx.italic && tools.has("italic")) styles.italic = true;
  if (ctx.underline && tools.has("underline")) styles.underline = true;
  if (ctx.strike && tools.has("strike")) styles.strike = true;
  if (ctx.code && tools.has("code")) styles.code = true;
  if (tools.has("color")) {
    if (ctx.textColor) styles.textColor = ctx.textColor;
    if (ctx.backgroundColor) styles.backgroundColor = ctx.backgroundColor;
  }
  const link = tools.has("link") ? ctx.link : undefined;
  if (link) {
    // Docs, Word and most sites colour links blue; the editor already draws links that way.
    if (styles.textColor?.startsWith("#") && LINK_COLORS.some((c) => deltaE2000(styles.textColor!, c) <= 10)) delete styles.textColor;
  }
  return {
    text,
    styles,
    link,
    pre: ctx.pre,
    br,
    size: ctx.size,
    sourceBold: !!ctx.bold,
  };
}

// ---------------------------------------------------------------------------------------------
// Styles.

function fontSize(value: string | undefined, parent: number) {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (KEYWORD_SIZES[v]) return KEYWORD_SIZES[v];
  if (v === "smaller") return parent * 0.833;
  if (v === "larger") return parent * 1.2;
  if (/em$/.test(v) && !v.endsWith("rem")) return parseFloat(v) * parent;
  if (v.endsWith("%")) return (parseFloat(v) / 100) * parent;
  return toPx(v);
}

function colorValue(value: string | undefined, kind: "text" | "background", state: State): string | null | undefined {
  if (!value) return undefined;
  const token = kind === "background" ? backgroundColorToken(value) : value;
  if (!token || !parseColor(token)) return undefined;
  const color = editorColor(token, kind, state.mode !== "strict");
  return color ?? null;
}

function backgroundColorToken(value: string) {
  if (parseColor(value)) return value;
  const match = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b[a-z]+\b)/i.exec(value.replace(/url\([^)]*\)|[a-z-]*gradient\([^)]*\)/gi, ""));
  return match && parseColor(match[1]) ? match[1] : undefined;
}

function countColor(color: string | null | undefined, state: State) {
  if (!color) return;
  if (color.startsWith("#")) state.report.colors.hex++;
  else state.report.colors.palette++;
}

function reportStyles(el: Element, decl: Declarations, state: State) {
  for (const [prop, value] of decl) {
    if (MAPPED_PROPERTIES.has(prop) || prop === "font-size" || prop.startsWith("--")) continue;
    if (NEUTRAL_VALUES[prop]?.(value.toLowerCase())) continue;
    if (prop === "vertical-align" && /^(super|sub)$/.test(value)) {
      state.report.unsupportedStyle(prop, el);
      continue;
    }
    state.report.unsupportedStyle(prop, el);
  }
}

/** Inline formatting from CSS and presentational attributes. */
function applyInlineCss(el: Element, decl: Declarations, ctx: Ctx, state: State, tag: string) {
  const weight = decl.get("font-weight");
  if (weight) {
    const n = parseInt(weight, 10);
    if (weight === "bold" || weight === "bolder" || n >= 600) ctx.bold = true;
    else if (weight === "normal" || weight === "lighter" || (n > 0 && n < 600)) ctx.bold = false;
  }
  const style = decl.get("font-style");
  if (style) ctx.italic = /italic|oblique/.test(style);
  const decoration = decl.get("text-decoration-line") ?? decl.get("text-decoration");
  if (decoration && tag !== "a") {
    // CSS underline inside a link is link styling (Docs, Word); a `<u>` tag still counts.
    if (/underline/.test(decoration) && !ctx.link) ctx.underline = true;
    if (/line-through/.test(decoration)) ctx.strike = true;
  }
  const family = decl.get("font-family") ?? (tag === "font" ? el.getAttribute("face") ?? undefined : undefined);
  if (family && MONOSPACE_FONT.test(family)) ctx.code = true;
  const color = colorValue(decl.get("color") ?? (tag === "font" ? el.getAttribute("color") ?? undefined : undefined), "text", state);
  const dataText = el.getAttribute("data-text-color");
  if (isPaletteName(dataText)) ctx.textColor = dataText;
  else if (color !== undefined) {
    ctx.textColor = color ?? undefined;
    countColor(color, state);
  }
  const background = colorValue(decl.get("background-color") ?? decl.get("background"), "background", state);
  const dataBackground = el.getAttribute("data-background-color");
  if (isPaletteName(dataBackground)) ctx.backgroundColor = dataBackground;
  else if (background !== undefined) {
    ctx.backgroundColor = background ?? undefined;
    countColor(background, state);
  }
  const size = fontSize(decl.get("font-size"), ctx.size) ?? (tag === "font" ? FONT_TAG_SIZES[Number(el.getAttribute("size"))] : undefined);
  if (size) ctx.size = size;
  const whiteSpace = decl.get("white-space");
  if (whiteSpace) ctx.pre = /^pre/.test(whiteSpace) || whiteSpace === "break-spaces";
}

function alignmentOf(el: Element, decl: Declarations): Alignment | undefined {
  const value = (decl.get("text-align") ?? el.getAttribute("align") ?? "").toLowerCase();
  if (value === "center" || value === "right" || value === "justify" || value === "left") return value;
  if (value === "start") return "left";
  if (value === "end") return "right";
  for (const c of classes(el)) if (ALIGN_CLASSES[c]) return ALIGN_CLASSES[c];
  if (lower(el) === "center") return "center";
  return undefined;
}

function wrapperCtx(el: Element, decl: Declarations, ctx: Ctx, state: State): Ctx {
  const next = { ...ctx };
  applyInlineCss(el, decl, next, state, lower(el));
  next.align = alignmentOf(el, decl) ?? ctx.align;
  return next;
}

/** Block props from the element's own styles: alignment and block colours. */
function blockProps(type: string, el: Element, decl: Declarations, ctx: Ctx, state: State) {
  const allowed = BLOCK_PROPS[type] ?? [];
  const props: Record<string, string | number | boolean> = {};
  const align = alignmentOf(el, decl) ?? ctx.align;
  if (allowed.includes("textAlignment") && align && align !== "left") props.textAlignment = align;
  if (state.tools.has("color")) {
    const dataText = el.getAttribute("data-text-color");
    const text = isPaletteName(dataText) ? dataText : colorValue(decl.get("color"), "text", state);
    if (allowed.includes("textColor") && text && text !== "default") props.textColor = text;
    const dataBackground = el.getAttribute("data-background-color");
    const background = isPaletteName(dataBackground) ? dataBackground : colorValue(decl.get("background-color") ?? decl.get("background"), "background", state);
    if (allowed.includes("backgroundColor") && background && background !== "default") props.backgroundColor = background;
    countColor(typeof text === "string" && !isPaletteName(dataText) ? text : undefined, state);
    countColor(typeof background === "string" && !isPaletteName(dataBackground) ? background : undefined, state);
  }
  return props;
}

/** The context for an element's children when its own colours went to block props. */
function blockChildCtx(el: Element, decl: Declarations, ctx: Ctx, state: State): Ctx {
  const next = { ...ctx };
  const { textColor, backgroundColor } = ctx;
  applyInlineCss(el, decl, next, state, lower(el));
  next.textColor = textColor;
  next.backgroundColor = backgroundColor;
  next.align = undefined;
  return next;
}

function omit<T extends object>(value: T, ...keys: string[]): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as T;
}

function withProps(block: HtmlBlock, props: Record<string, string | number | boolean>) {
  if (Object.keys(props).length) block.props = { ...props, ...block.props };
  return block;
}

// ---------------------------------------------------------------------------------------------
// Inline elements.

function inline(el: Element, tag: string, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  const next = { ...ctx };
  const marks = MARK_TAGS[tag];
  if (marks) {
    state.report.mapped++;
    for (const [key, value] of Object.entries(marks)) (next as Record<string, unknown>)[key] = value;
    const toolFor: Record<string, string> = { bold: "bold", italic: "italic", underline: "underline", strike: "strike", code: "code", backgroundColor: "color" };
    for (const key of Object.keys(marks)) {
      const tool = toolFor[key];
      if (tool && !state.tools.has(tool as never)) state.report.downgrade(tag, "text");
    }
  }
  if (UNSUPPORTED_MARKS.has(tag)) state.report.downgrade(tag, "text");
  if (tag === "a") {
    const href = el.getAttribute("href");
    if (ctx.container === "heading" && isPermalink(el, href)) {
      state.report.drop("a", "noise", "permalink");
      return;
    }
    if (href) {
      const clean = cleanHref(href, state.base);
      if (clean) {
        next.link = clean;
        if (!state.tools.has("link")) state.report.downgrade("a", "text");
      }
    }
  }
  if (tag === "q") sink.addRun(makeRun("“", next, state));
  applyInlineCss(el, decl, next, state, tag);
  reportStyles(el, decl, state);
  flow(el, next, sink, state);
  if (tag === "q") sink.addRun(makeRun("”", next, state));
}

function isPermalink(el: Element, href: string | null) {
  if (href && !href.startsWith("#")) return false;
  if (PERMALINK_CLASS.test(el.getAttribute("class") ?? "") || el.getAttribute("aria-hidden") === "true") return true;
  return PERMALINK_TEXT.test(el.textContent ?? "");
}

// ---------------------------------------------------------------------------------------------
// Blocks.

function paragraphMaker(state: State, props: Record<string, string | number | boolean>, candidate: boolean, container: Container = "root"): Maker {
  return (content, runs) => {
    const block = withProps({ type: "paragraph", content }, props);
    state.report.mapped++;
    if (candidate && container === "root") {
      const text = runs.filter((r) => !r.fromBr).map((r) => r.text).join("");
      state.candidates.set(block, {
        chars: text.trim().length,
        bold: runs.every((r) => r.sourceBold || !r.text.trim()),
        minSize: Math.min(...runs.filter((r) => r.text.trim()).map((r) => r.size)),
      });
    }
    return block;
  };
}

function block(el: Element, tag: string, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  switch (tag) {
    case "p":
    case "caption":
      return paragraph(el, decl, ctx, sink, state);
    case "ul":
    case "ol":
      return list(el, tag, decl, ctx, sink, state);
    case "li":
      return list(el, "ul", decl, ctx, sink, state, [el]);
    case "blockquote":
      return quote(el, decl, ctx, sink, state);
    case "pre":
      return code(el, ctx, sink, state);
    case "hr":
      sink.flush();
      if (state.tools.has("divider")) {
        state.report.mapped++;
        sink.push({ type: "divider" });
      } else state.report.downgrade("hr", "nothing");
      return;
    case "table":
      return table(el, decl, ctx, sink, state);
    case "figure":
      return figure(el, decl, ctx, sink, state);
    case "img":
      return image(el, decl, ctx, sink, state);
    case "picture":
      sink.flush();
      flow(el, ctx, sink, state);
      return;
    case "video":
    case "audio":
      return media(el, tag, ctx, sink, state);
    case "iframe":
      return iframe(el, ctx, sink, state);
    case "details":
      return details(el, decl, ctx, sink, state);
    case "dl":
      return definitionList(el, ctx, sink, state);
  }
}

function paragraph(el: Element, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  sink.flush();
  reportStyles(el, decl, state);
  const props = blockProps("paragraph", el, decl, ctx, state);
  const sub = new Sink(state, paragraphMaker(state, props, true, ctx.container));
  flow(el, blockChildCtx(el, decl, ctx, state), sub, state);
  sub.flush();
  if (!sub.blocks.length && !elementChildren(el).some((c) => lower(c) !== "br" && lower(c) !== "span")) {
    sub.blocks.push(withProps({ type: "paragraph", content: [] }, props));
  }
  sink.push(...sub.blocks);
}

function headingLevelOf(el: Element, tag: string): number | undefined {
  const match = HEADING_TAG.exec(tag);
  if (match) return Number(match[1]);
  if (el.getAttribute("role") === "heading") {
    const level = Number(el.getAttribute("aria-level") ?? 2);
    return Math.min(6, Math.max(1, Number.isFinite(level) ? level : 2));
  }
  for (const c of classes(el)) {
    if (CLASS_HEADINGS[c]) return CLASS_HEADINGS[c];
    if (tag === "p" && c === "title") return 1;
    if (tag === "p" && c === "subtitle") return 2;
  }
  return undefined;
}

function heading(el: Element, level: number, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  reportStyles(el, decl, state);
  // Inside a list item or table cell, a heading is bold text (§6).
  if (ctx.container === "list" || ctx.container === "cell") {
    const next = { ...blockChildCtx(el, decl, ctx, state), bold: true };
    if (ctx.container === "cell") return flow(el, next, sink, state);
    sink.flush();
    const sub = new Sink(state, paragraphMaker(state, {}, false));
    flow(el, next, sub, state);
    sub.flush();
    return sink.push(...sub.blocks);
  }
  sink.flush();
  const props = blockProps("heading", el, decl, ctx, state);
  const sub = new HeadingSink(state);
  flow(el, { ...blockChildCtx(el, decl, ctx, state), container: "heading" }, sub, state);
  sub.flush();
  const text = inlineText(sub.content).trim();
  if (!text) {
    state.report.headings.dropped++;
    return sink.push(...sub.after);
  }
  if (text.length > 300) state.report.warn("longHeading: a heading is longer than 300 characters.");
  sink.push(...makeHeading(sub.content, level, props, state), ...sub.after);
}

/** A heading block, or a bold paragraph when headings are off. Whole-heading bold is dropped (§6). */
function makeHeading(content: HtmlInline[], level: number, props: Record<string, string | number | boolean>, state: State, extra: Record<string, boolean> = {}): HtmlBlock[] {
  const allBold = content.length > 0 && content.every((n) => (n.type === "link" ? n.content.every((t) => t.styles.bold) : n.styles.bold || !n.text.trim()));
  const plain = allBold ? mapStyles(content, (s) => omit(s, "bold")) : content;
  if (!state.tools.has("heading")) {
    state.report.downgrade(`h${level}`, "bold paragraph");
    const bold = state.tools.has("bold") ? mapStyles(plain, (s) => ({ ...s, bold: true })) : plain;
    return [withProps({ type: "paragraph", content: bold }, props)];
  }
  state.report.mapped++;
  const allowed = nearestLevel(level, state.tools.headingLevels);
  return [withProps({ type: "heading", props: { level: allowed, ...extra }, content: plain }, props)];
}

function listItemType(li: Element, ordered: boolean): { type: string; checked?: boolean } {
  const role = li.getAttribute("role");
  if (role === "checkbox" || li.hasAttribute("aria-checked")) return { type: "checkListItem", checked: li.getAttribute("aria-checked") === "true" };
  if (li.hasAttribute("data-checked")) return { type: "checkListItem", checked: li.getAttribute("data-checked") === "true" };
  const box = firstCheckbox(li);
  if (box) return { type: "checkListItem", checked: box.hasAttribute("checked") };
  return { type: ordered ? "numberedListItem" : "bulletListItem" };
}

function firstCheckbox(li: Element): Element | undefined {
  for (const child of elementChildren(li)) {
    const tag = lower(child);
    if (tag === "input" && child.getAttribute("type")?.toLowerCase() === "checkbox") return child;
    if (tag === "label" || tag === "p" || tag === "span") {
      const inner = elementChildren(child).find((c) => lower(c) === "input");
      if (inner) return inner;
    }
    if (tag === "ul" || tag === "ol") return undefined;
  }
  return undefined;
}

const LIST_TOOLS: Record<string, "bulletList" | "numberedList" | "checkList" | "toggleList"> = {
  bulletListItem: "bulletList", numberedListItem: "numberedList", checkListItem: "checkList", toggleListItem: "toggleList",
};

/** Converts a block whose tool is off into a paragraph, keeping its children. */
function admitItem(block: HtmlBlock, state: State): HtmlBlock {
  const tool = LIST_TOOLS[block.type];
  if (!tool || state.tools.has(tool)) return block;
  state.report.downgrade(block.type, "paragraph");
  const props = omit(block.props ?? {}, "start", "checked");
  return { ...block, type: "paragraph", props: Object.keys(props).length ? props : undefined };
}

function list(el: Element, tag: string, decl: Declarations, ctx: Ctx, sink: Sink, state: State, items?: Element[]) {
  sink.flush();
  reportStyles(el, decl, state);
  const ordered = tag === "ol";
  const start = ordered ? Number(el.getAttribute("start") ?? 1) : 1;
  const out: HtmlBlock[] = [];
  const itemCtx: Ctx = { ...ctx, container: "list", listDepth: ctx.listDepth + 1, align: undefined };
  let first = true;
  for (const child of items ?? Array.from(el.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      if (!(child.nodeValue ?? "").trim()) continue;
    }
    if (child.nodeType !== ELEMENT_NODE && child.nodeType !== TEXT_NODE) continue;
    const childTag = lower(child);
    if (child.nodeType === ELEMENT_NODE && (childTag === "ul" || childTag === "ol")) {
      // Docs puts nested lists beside the items, not inside them.
      const nested = new Sink(state, () => undefined);
      list(child as Element, childTag, parseStyle((child as Element).getAttribute("style")), itemCtx, nested, state);
      const parent = out[out.length - 1];
      if (parent) (parent.children ??= []).push(...nested.blocks);
      else out.push(...nested.blocks);
      continue;
    }
    if (child.nodeType === ELEMENT_NODE && isHidden(child as Element, parseStyle((child as Element).getAttribute("style")))) {
      state.report.drop(childTag, "hidden", child.textContent);
      continue;
    }
    const li = child as Element;
    const isLi = child.nodeType === ELEMENT_NODE && childTag === "li";
    const liDecl = isLi ? parseStyle(li.getAttribute("style")) : new Map<string, string>();
    const { type, checked } = isLi ? listItemType(li, ordered) : { type: ordered ? "numberedListItem" : "bulletListItem", checked: undefined };
    const props: Record<string, string | number | boolean> = isLi ? blockProps(type, li, liDecl, itemCtx, state) : {};
    if (type === "checkListItem" && checked) props.checked = true;
    const value = isLi ? Number(li.getAttribute("value")) : NaN;
    if (type === "numberedListItem") {
      if (Number.isFinite(value) && value > 0 && value !== 1) props.start = value;
      else if (first && start !== 1 && Number.isFinite(start)) props.start = start;
    }
    first = false;
    const head = new HeadSink(state, (content) => withProps({ type, content }, props));
    if (isLi) flow(li, blockChildCtx(li, liDecl, itemCtx, state), head, state);
    else visit(child, itemCtx, head, state);
    const item = head.result() ?? withProps({ type, content: [] }, props);
    state.report.mapped++;
    out.push(admitItem(item, state));
  }
  sink.push(...out);
}

function quote(el: Element, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  sink.flush();
  reportStyles(el, decl, state);
  const props = blockProps("quote", el, decl, ctx, state);
  const enabled = state.tools.has("quote");
  const head = new HeadSink(state, (content) => withProps({ type: enabled ? "quote" : "paragraph", content }, enabled ? props : {}));
  flow(el, { ...blockChildCtx(el, decl, ctx, state), container: "quote" }, head, state);
  const result = head.result();
  if (!result) return;
  if (enabled) state.report.mapped++;
  else state.report.downgrade("blockquote", "paragraph");
  sink.push(result);
}

function preText(node: Node): string {
  let text = "";
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === TEXT_NODE) text += child.nodeValue ?? "";
    else if (child.nodeType === ELEMENT_NODE) {
      const tag = lower(child);
      if (tag === "br") text += "\n";
      else if (TAG_CLASSES[tag] === "drop") continue;
      else {
        const inner = preText(child);
        text += inner;
        if ((tag === "div" || tag === "p" || tag === "li") && !inner.endsWith("\n")) text += "\n";
      }
    }
  }
  return text;
}

function codeLanguage(el: Element): string | undefined {
  const candidates = [el, ...elementChildren(el).filter((c) => lower(c) === "code")];
  for (const node of candidates) {
    const data = node.getAttribute("data-lang") ?? node.getAttribute("data-language");
    if (data) return data.toLowerCase();
    const cls = classes(node);
    for (const c of cls) {
      const match = /^(?:language|lang)-(.+)$/.exec(c);
      if (match) return match[1].toLowerCase();
    }
    const hljs = cls.indexOf("hljs");
    if (hljs >= 0 && cls[hljs + 1]) return cls[hljs + 1].toLowerCase();
  }
  return undefined;
}

function code(el: Element, ctx: Ctx, sink: Sink, state: State) {
  sink.flush();
  const text = preText(el).replace(/\u00a0/g, " ").replace(/\n+$/, "");
  const language = codeLanguage(el);
  if (state.tools.has("codeBlock")) {
    state.report.mapped++;
    const block: HtmlBlock = { type: "codeBlock", content: text ? [{ type: "text", text, styles: {} }] : [] };
    if (language && language !== "text" && /^[a-z0-9+#._-]{1,30}$/.test(language)) block.props = { language };
    return sink.push(block);
  }
  state.report.downgrade("pre", "code paragraph");
  const styles: HtmlStyles = state.tools.has("code") ? { code: true } : {};
  sink.push({ type: "paragraph", content: text ? [{ type: "text", text, styles }] : [] });
}

// Tables -------------------------------------------------------------------------------------

function tableRows(table: Element) {
  const rows: { tr: Element; head: boolean }[] = [];
  for (const child of elementChildren(table)) {
    const tag = lower(child);
    if (tag === "tr") rows.push({ tr: child, head: false });
    else if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
      for (const tr of elementChildren(child)) if (lower(tr) === "tr") rows.push({ tr, head: tag === "thead" });
    }
  }
  return rows;
}

function table(el: Element, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  sink.flush();
  reportStyles(el, decl, state);
  const rows = tableRows(el);
  const cellsOf = (tr: Element) => elementChildren(tr).filter((c) => lower(c) === "td" || lower(c) === "th");
  const single = rows.length === 1 && cellsOf(rows[0].tr).length === 1;
  if (el.getAttribute("role") === "presentation" || single || rows.length === 0) {
    state.report.unwrap("table(layout)");
    for (const { tr } of rows) for (const cell of cellsOf(tr)) {
      flow(cell, wrapperCtx(cell, parseStyle(cell.getAttribute("style")), ctx, state), sink, state);
      sink.flush();
    }
    return;
  }

  const grid: boolean[][] = [];
  const outRows: { cells: HtmlTableCell[] }[] = [];
  let columns = 0;
  const cellCtx: Ctx = { ...ctx, container: "cell", align: undefined };
  rows.forEach(({ tr }, r) => {
    grid[r] ??= [];
    const cells: HtmlTableCell[] = [];
    let c = 0;
    for (const cell of cellsOf(tr)) {
      while (grid[r][c]) c++;
      const colspan = Math.max(1, Math.min(50, Number(cell.getAttribute("colspan")) || 1));
      const rowspan = Math.max(1, Math.min(rows.length - r, Number(cell.getAttribute("rowspan")) || 1));
      for (let dr = 0; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) (grid[r + dr] ??= [])[c + dc] = true;
      c += colspan;
      const cellDecl = parseStyle(cell.getAttribute("style"));
      reportStyles(cell, cellDecl, state);
      const sub = new CellSink(state);
      flow(cell, blockChildCtx(cell, cellDecl, cellCtx, state), sub, state);
      const props: HtmlTableCell["props"] = {};
      if (colspan > 1) props.colspan = colspan;
      if (rowspan > 1) props.rowspan = rowspan;
      const align = alignmentOf(cell, cellDecl);
      if (align && align !== "left") props.textAlignment = align;
      if (state.tools.has("color")) {
        const dataBg = cell.getAttribute("data-background-color");
        const bg = isPaletteName(dataBg) ? dataBg : colorValue(cellDecl.get("background-color") ?? cellDecl.get("background") ?? cell.getAttribute("bgcolor") ?? undefined, "background", state);
        if (bg) props.backgroundColor = bg;
        const dataFg = cell.getAttribute("data-text-color");
        const fg = isPaletteName(dataFg) ? dataFg : colorValue(cellDecl.get("color"), "text", state);
        if (fg) props.textColor = fg;
      }
      cells.push({ type: "tableCell", props, content: sub.content() });
    }
    columns = Math.max(columns, grid[r].length);
    outRows.push({ cells });
  });
  // Pad ragged rows so the grid is rectangular.
  outRows.forEach((row, r) => {
    const filled = grid[r].filter(Boolean).length;
    for (let i = filled; i < columns; i++) row.cells.push({ type: "tableCell", props: {}, content: [] });
  });

  const captions = elementChildren(el).filter((c) => lower(c) === "caption");
  const after: HtmlBlock[] = [];
  for (const caption of captions) {
    const sub = new Sink(state, paragraphMaker(state, {}, false));
    flow(caption, ctx, sub, state);
    sub.flush();
    after.push(...sub.blocks);
  }

  if (!state.tools.has("table")) {
    state.report.downgrade("table", "paragraphs");
    const paragraphs = outRows
      .filter((row) => row.cells.some((cell) => cell.content.some((node) => /\S/.test(node.type === "text" ? node.text : node.content.map((t) => t.text).join("")))))
      .map((row) => ({
        type: "paragraph",
        content: runsToInline(row.cells.flatMap((cell, i) => [...(i ? inlineToRuns([{ type: "text", text: "\t", styles: {} }]) : []), ...inlineToRuns(cell.content)])),
      }));
    return sink.push(...paragraphs, ...after);
  }

  let headerRows = 0;
  while (headerRows < rows.length && (rows[headerRows].head || cellsOf(rows[headerRows].tr).every((c) => lower(c) === "th"))) headerRows++;
  if (headerRows === rows.length) headerRows = Math.min(headerRows, 1);
  const bodyRows = rows.slice(headerRows);
  const headerCols = bodyRows.length > 0 && bodyRows.every(({ tr }) => lower(cellsOf(tr)[0] ?? tr) === "th") ? 1 : 0;

  const content: HtmlTableContent = { type: "tableContent", columnWidths: columnWidths(el, rows[0]?.tr, columns, cellsOf), rows: outRows };
  if (headerRows) content.headerRows = headerRows;
  if (headerCols) content.headerCols = headerCols;
  state.report.mapped++;
  sink.push({ type: "table", content }, ...after);
}

function columnWidths(table: Element, firstRow: Element | undefined, columns: number, cellsOf: (tr: Element) => Element[]) {
  const widths: (number | undefined)[] = [];
  const width = (el: Element) => {
    const px = toPx(parseStyle(el.getAttribute("style")).get("width") ?? el.getAttribute("width") ?? undefined);
    return px && px > 0 ? Math.round(px) : undefined;
  };
  const cols = elementChildren(table).flatMap((c) => (lower(c) === "colgroup" ? elementChildren(c) : lower(c) === "col" ? [c] : []));
  if (cols.length) {
    for (const col of cols) for (let i = 0; i < Math.max(1, Number(col.getAttribute("span")) || 1); i++) widths.push(width(col));
  } else if (firstRow) {
    for (const cell of cellsOf(firstRow)) {
      const span = Number(cell.getAttribute("colspan")) || 1;
      for (let i = 0; i < span; i++) widths.push(span === 1 ? width(cell) : undefined);
    }
  }
  const result = Array.from({ length: columns }, (_, i) => widths[i]);
  return result;
}

// Media --------------------------------------------------------------------------------------

/** The best URL for an image: the largest srcset candidate, then lazy-load attributes, then `src`. */
function imageSource(img: Element) {
  const srcsets = [...LAZY_SRCSET_ATTRIBUTES.map((a) => img.getAttribute(a)), img.getAttribute("srcset")];
  const picture = img.parentNode && lower(img.parentNode) === "picture" ? (img.parentNode as Element) : undefined;
  if (picture) srcsets.push(...elementChildren(picture).map((source) => source.getAttribute("srcset")));
  for (const srcset of srcsets) {
    const candidate = largestSrcsetCandidate(srcset);
    if (candidate && !PLACEHOLDER_SRC.test(candidate)) return candidate;
  }
  for (const attr of LAZY_SRC_ATTRIBUTES) {
    const value = img.getAttribute(attr);
    if (value && !PLACEHOLDER_SRC.test(value)) return value;
  }
  const src = img.getAttribute("src");
  return src && !PLACEHOLDER_SRC.test(src) ? src : undefined;
}

function mediaUrl(raw: string | undefined, state: State) {
  if (!raw) return undefined;
  const { url, relative, resolved } = resolveUrl(raw, state.base);
  if (resolved) state.report.images.resolved++;
  if (relative) state.report.images.unresolved++;
  if (!/^(https?:|data:image\/|\/|\.|[^:]*$)/i.test(url)) return undefined;
  return url;
}

function isPixel(img: Element, decl: Declarations) {
  const w = toPx(decl.get("width") ?? img.getAttribute("width") ?? undefined);
  const h = toPx(decl.get("height") ?? img.getAttribute("height") ?? undefined);
  return (w !== undefined && w <= 2 && (h === undefined || h <= 2)) || (h !== undefined && h <= 2 && w !== undefined && w <= 2) || w === 0 || h === 0;
}

function image(el: Element, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  const raw = imageSource(el);
  if (isPixel(el, decl) || (raw && isTrackerUrl(raw))) {
    state.report.drop("img", "tracking", raw);
    return;
  }
  state.report.images.total++;
  const url = mediaUrl(raw, state);
  if (!url) {
    state.report.images.failed++;
    return;
  }
  const alt = (el.getAttribute("alt") ?? el.getAttribute("title") ?? "").trim();
  const props: Record<string, string | number | boolean> = { url };
  if (alt) props.name = alt;
  const width = toPx(decl.get("width"), ASSUMED_COLUMN_PX) ?? toPx(el.getAttribute("width"));
  if (width && width > 2) props.previewWidth = Math.round(width);
  const align = alignmentOf(el, decl) ?? ctx.align;
  if (align && align !== "left" && align !== "justify") props.textAlignment = align;
  if (ctx.link) state.report.downgrade("image link", "image");
  sink.flush();
  emitMedia({ type: "image", props }, "image", alt || url, ctx, sink, state);
}

function media(el: Element, tag: "video" | "audio" | string, ctx: Ctx, sink: Sink, state: State) {
  const source = el.getAttribute("src") ?? elementChildren(el).find((c) => lower(c) === "source" && c.getAttribute("src"))?.getAttribute("src") ?? undefined;
  const url = source ? resolveUrl(source, state.base).url : undefined;
  if (!url || !/^(https?:|\/|\.)/i.test(url)) {
    state.report.drop(tag, "unsupported");
    return;
  }
  sink.flush();
  const props: Record<string, string | number | boolean> = { url };
  const title = el.getAttribute("title");
  if (title) props.name = title;
  if (tag === "video") {
    const width = toPx(el.getAttribute("width"));
    if (width && width > 2) props.previewWidth = Math.round(width);
    if (ctx.align && ctx.align !== "left" && ctx.align !== "justify") props.textAlignment = ctx.align;
  }
  emitMedia({ type: tag, props }, tag as "video" | "audio", title || url, ctx, sink, state);
}

/** Emits a media block, or a link paragraph (dropped in strict mode) when its tool is off (§11). */
function emitMedia(block: HtmlBlock, tool: "image" | "video" | "audio", label: string, ctx: Ctx, sink: Sink, state: State) {
  if (state.tools.has(tool)) {
    state.report.mapped++;
    return sink.push(block);
  }
  if (state.mode === "strict") {
    state.report.downgrade(block.type, "nothing");
    return;
  }
  state.report.downgrade(block.type, "link paragraph");
  sink.push(linkParagraph(String(block.props!.url), label, state));
}

function linkParagraph(url: string, label: string, state: State): HtmlBlock {
  const text = { type: "text" as const, text: label, styles: {} };
  const content: HtmlInline[] = state.tools.has("link") && /^https?:/.test(url) ? [{ type: "link", href: url, content: [text] }] : [text];
  return { type: "paragraph", content };
}

function iframe(el: Element, ctx: Ctx, sink: Sink, state: State) {
  const src = el.getAttribute("src");
  const url = src ? resolveUrl(src, state.base).url : undefined;
  if (!url || !/^https:/i.test(url) || isTrackerUrl(url)) {
    state.report.drop("iframe", url && isTrackerUrl(url) ? "tracking" : "embed", url);
    return;
  }
  sink.flush();
  state.report.downgrade("iframe", "link paragraph");
  const title = el.getAttribute("title")?.trim();
  sink.push(linkParagraph(url, title || url, state));
}

function figure(el: Element, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  sink.flush();
  reportStyles(el, decl, state);
  const isCaption = (c: Element) => lower(c) === "figcaption" || classes(c).some((x) => FIGCAPTION_CLASSES.has(x));
  const captions = elementChildren(el).filter(isCaption);
  const download = elementChildren(el).find((c) => lower(c) === "a" && c.hasAttribute("download") && c.getAttribute("href"));
  const caption = captions.map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  const figCtx = wrapperCtx(el, decl, ctx, state);
  if (download && state.tools.has("file")) {
    const url = cleanHref(download.getAttribute("href")!, state.base);
    if (url) {
      const props: Record<string, string | number | boolean> = { url };
      const text = (download.textContent ?? "").trim();
      const name = download.getAttribute("download") || (text !== download.getAttribute("href") ? text : "");
      if (name) props.name = name;
      if (caption) props.caption = caption;
      state.report.mapped++;
      return sink.push({ type: "file", props });
    }
  }
  const sub = new Sink(state, paragraphMaker(state, {}, false));
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === ELEMENT_NODE && isCaption(child as Element)) continue;
    visit(child, figCtx, sub, state);
  }
  sub.flush();
  const mediaBlock = [...sub.blocks].reverse().find((b) => b.type === "image" || b.type === "video" || b.type === "audio");
  if (mediaBlock && caption) mediaBlock.props = { ...mediaBlock.props, caption };
  sink.push(...sub.blocks);
  if (!mediaBlock && caption) {
    for (const c of captions) {
      const capSink = new Sink(state, paragraphMaker(state, {}, false));
      flow(c, figCtx, capSink, state);
      capSink.flush();
      sink.push(...capSink.blocks);
    }
  }
}

/** WordPress's file block: a link to the file plus a separate "Download" button linking to the same URL. */
function fileBlock(el: Element, sink: Sink, state: State) {
  const link = Array.from(el.querySelectorAll("a[href]")).find((a) => !classes(a).includes("wp-block-file__button"));
  const url = link && cleanHref(link.getAttribute("href")!, state.base);
  if (!url) return false;
  sink.flush();
  const name = (link.textContent ?? "").trim();
  if (state.tools.has("file")) {
    state.report.mapped++;
    sink.push({ type: "file", props: name ? { url, name } : { url } });
  } else {
    state.report.downgrade("file", "link paragraph");
    sink.push(linkParagraph(url, name || url, state));
  }
  return true;
}

function details(el: Element, decl: Declarations, ctx: Ctx, sink: Sink, state: State) {
  sink.flush();
  reportStyles(el, decl, state);
  const summary = elementChildren(el).find((c) => lower(c) === "summary");
  const inner: Ctx = { ...blockChildCtx(el, decl, ctx, state), container: "root" };
  const body = new Sink(state, paragraphMaker(state, {}, false));
  for (let child = el.firstChild; child; child = child.nextSibling) if (child !== summary) visit(child, inner, body, state);
  body.flush();
  const headingEl = summary && elementChildren(summary).find((c) => headingLevelOf(c, lower(c)));
  let head: HtmlBlock;
  if (headingEl && state.tools.has("heading")) {
    const sub = new HeadingSink(state);
    flow(headingEl, { ...inner, container: "heading" }, sub, state);
    sub.flush();
    const headingProps = blockProps("heading", headingEl, parseStyle(headingEl.getAttribute("style")), ctx, state);
    [head] = makeHeading(sub.content, headingLevelOf(headingEl, lower(headingEl))!, headingProps, state, { isToggleable: true });
  } else {
    const sub = new HeadingSink(state);
    if (summary) flow(summary, inner, sub, state);
    sub.flush();
    head = admitItem(withProps({ type: "toggleListItem", content: sub.content }, blockProps("toggleListItem", el, decl, ctx, state)), state);
    if (head.type === "toggleListItem") state.report.mapped++;
  }
  if (body.blocks.length) head.children = body.blocks;
  sink.push(head);
}

function definitionList(el: Element, ctx: Ctx, sink: Sink, state: State) {
  sink.flush();
  const out: HtmlBlock[] = [];
  const terms = (node: Element): Element[] => elementChildren(node).flatMap((c) => (lower(c) === "div" ? terms(c) : [c]));
  for (const item of terms(el)) {
    const tag = lower(item);
    const sub = new Sink(state, paragraphMaker(state, {}, false));
    flow(item, tag === "dt" ? { ...ctx, bold: true } : ctx, sub, state);
    sub.flush();
    if (tag === "dd" && out.length) (out[out.length - 1].children ??= []).push(...sub.blocks);
    else out.push(...sub.blocks);
  }
  state.report.mapped++;
  sink.push(...out);
}

// ---------------------------------------------------------------------------------------------
// Post-processing.

/** §6: a standalone, uniformly bold, larger-than-body paragraph becomes h2–h4 (never h1). */
function promoteStyledHeadings(blocks: HtmlBlock[], state: State) {
  if (!state.tools.has("heading")) return;
  const body = dominantSize(state);
  blocks.forEach((block, i) => {
    const info = state.candidates.get(block);
    if (!info || block.type !== "paragraph") return;
    const text = inlineText(block.content as HtmlInline[]).trim();
    if (!info.bold || info.chars === 0 || info.chars > 120 || /[.:;,]$/.test(text) || text.includes("\n")) return;
    const ratio = info.minSize / body;
    const level = ratio >= 2 ? 2 : ratio >= 1.5 ? 3 : ratio >= 1.25 ? 4 : 0;
    if (!level) return;
    const [heading] = makeHeading(block.content as HtmlInline[], level, {}, state);
    if (block.props) heading.props = { ...block.props, ...heading.props };
    blocks[i] = heading;
    state.report.headings.promoted++;
  });
}

function dominantSize(state: State) {
  let best = 16;
  let bestChars = -1;
  for (const [size, chars] of state.sizes) if (chars > bestChars) [best, bestChars] = [size, chars];
  return best || 16;
}

/** Font sizes other than the body size are lost until the `fontSize` tool exists (phase 5). */
function countFontSizes(_blocks: HtmlBlock[], state: State) {
  const body = dominantSize(state);
  for (const [size, chars] of state.sizes) {
    if (Math.abs(size - body) > 1 && chars > 0) state.report.unsupportedStyle("font-size", { size });
  }
}

/** Lists deeper than `max` levels are moved up to the deepest allowed level (§3). */
/** Whitespace-only content is canonically empty (§3), whichever path produced it; code keeps its whitespace. */
function emptyWhitespaceOnly(blocks: HtmlBlock[]): HtmlBlock[] {
  return blocks.map((block) => {
    let next = block;
    const content = block.content;
    if (block.type !== "codeBlock" && Array.isArray(content) && content.length) {
      const text = content.map((node) => (node.type === "text" ? node.text : node.content.map((t) => t.text).join(""))).join("");
      if (!/\S/.test(text.replace(/\u00a0/g, " "))) next = { ...block, content: [] };
    }
    return block.children?.length ? { ...next, children: emptyWhitespaceOnly(block.children) } : next;
  });
}

function isEmptyParagraph(block: HtmlBlock) {
  const content = block.content;
  return block.type === "paragraph" && (!content || (Array.isArray(content) && !content.length)) && !block.children?.length;
}

/** Trims empty paragraphs at the edges of each block list and collapses runs of them into one. */
function collapseEmptyParagraphs(blocks: HtmlBlock[], report: ReportBuilder): HtmlBlock[] {
  const out: HtmlBlock[] = [];
  for (const block of blocks) {
    const empty = isEmptyParagraph(block);
    if (empty && (!out.length || isEmptyParagraph(out[out.length - 1]))) {
      report.drop("p", "noise");
      continue;
    }
    out.push(block.children?.length ? { ...block, children: collapseEmptyParagraphs(block.children, report) } : block);
  }
  while (out.length && isEmptyParagraph(out[out.length - 1])) {
    out.pop();
    report.drop("p", "noise");
  }
  return out;
}

function clampListDepth(blocks: HtmlBlock[], max: number, depth = 1): HtmlBlock[] {
  const out: HtmlBlock[] = [];
  for (const block of blocks) {
    const isItem = block.type in LIST_TOOLS;
    if (block.children?.length) {
      if (isItem && depth >= max) {
        const hoisted = clampListDepth(block.children, max, depth);
        out.push(omit(block, "children"), ...hoisted);
        continue;
      }
      block.children = clampListDepth(block.children, max, isItem ? depth + 1 : depth);
    }
    out.push(block);
  }
  return out;
}
