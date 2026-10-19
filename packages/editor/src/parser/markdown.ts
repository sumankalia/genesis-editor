import { Marked } from "marked";

import { parseHTMLAsync, type ParseAsyncOptions } from "./async";
import { parseHTML } from "./parse";
import type { ParseOptions, ParseResult } from "./types";

/**
 * Markdown → HTML, then the genesis HTML engine. We never call BlockNote's
 * `tryParseMarkdownToBlocks`; every Markdown import shares paste cleanup, sanitizing, and the report.
 */
const marked = new Marked({ gfm: true, breaks: false, pedantic: false });

const ATX = /^(#{1,6})[ \t]+\S/m;
const FENCE = /^[ \t]{0,3}`{3,}\w*[ \t]*$/m;
const LIST = /^[ \t]{0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+\S/m;
const TASK = /^[ \t]{0,3}(?:[-*+])[ \t]+\[[ xX]\][ \t]+\S/m;
const QUOTE = /^>[ \t]?\S/m;
const RULE = /^(?: {0,3}(?:- *){3,}|(?:\* *){3,}|(?:_ *){3,})[ \t]*$/m;
const LINK_OR_IMAGE = /!?\[(?:[^\]]|\\.)+\]\(\s*<?[^)\s>]+>?/;
const SETEXT = /^\S.+\n[ \t]*[=-]{2,}[ \t]*$/m;
/** Rendered HTML, not a wrapper around Markdown source. */
const STRUCTURAL = /<(h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|hr|img|figure)\b/i;

/** Turns CommonMark/GFM into HTML for `parseHTML`. The HTML engine sanitizes; marked does not. */
export function markdownToHTML(markdown: string): string {
  const source = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return "";
  const html = marked.parse(source, { async: false });
  return (typeof html === "string" ? html : "").trim();
}

/** Parses Markdown by converting it to HTML and running `parseHTML`. */
export function parseMarkdown(markdown: string, options?: ParseOptions): ParseResult {
  return parseHTML(markdownToHTML(markdown), options);
}

/** `parseMarkdown`, then the same image re-hosting as `parseHTMLAsync`. */
export function parseMarkdownAsync(markdown: string, options?: ParseAsyncOptions): Promise<ParseResult> {
  return parseHTMLAsync(markdownToHTML(markdown), options);
}

/**
 * Whether pasted plain text is Markdown rather than a sentence. Headings, lists, quotes, fences,
 * tables, rules, and Markdown links/images count; a lone URL or ordinary prose does not.
 */
export function looksLikeMarkdown(text: string): boolean {
  const source = text.replace(/\r\n?/g, "\n").trim();
  if (source.length < 2) return false;
  if (/^https?:\/\/\S+$/i.test(source)) return false;
  if (ATX.test(source) || FENCE.test(source) || LIST.test(source) || TASK.test(source)) return true;
  if (QUOTE.test(source) || RULE.test(source) || LINK_OR_IMAGE.test(source) || SETEXT.test(source)) return true;
  return isGfmTable(source);
}

/**
 * True when `text/html` is only wrapping Markdown source (a `<div>`, `<pre>`, or `<span>` around
 * the same text). Rendered HTML with headings, lists, or images is left on the HTML path.
 */
export function htmlIsMarkdownSource(html: string, plain: string): boolean {
  if (!plain.trim() || !looksLikeMarkdown(plain)) return false;
  if (STRUCTURAL.test(html)) return false;
  return normalizeWs(htmlToPlain(html)) === normalizeWs(plain);
}

function isGfmTable(source: string): boolean {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/\|/.test(lines[i])) continue;
    if (/^\s*\|?\s*:?-{3,}:?\s*(?:\s*\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) return true;
  }
  return false;
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|pre|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function normalizeWs(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
