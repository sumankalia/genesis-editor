/**
 * HTML that arrives JSON-encoded: copied from an API response, a DevTools panel, a log, or a `.json`
 * file. Parsed as is, its `\n`, `\t` and `\"` escapes show up as literal text and break attributes
 * (`alt=\"x\"`). `decodeEscapedHTML` recognizes three shapes:
 *
 * - a JSON string literal, quotes included: `"<p>a</p>\n<p>b</p>"`;
 * - a JSON array or object holding HTML strings, e.g. `[{ "HTML": "<p>…</p>" }]` (their HTML, in order);
 * - the inside of a JSON string, without quotes: `<p class=\"x\">a<\/p>\n<p>b</p>`.
 *
 * The last shape is also valid HTML, so it's decoded only when the escapes are structural: an
 * escaped attribute quote, an escaped `/` or `<`, or newlines and tabs that sit only between tags
 * and never inside code. HTML that merely mentions `\n` (`<code>\n</code>`) is left alone, as is
 * anything with a raw newline or an unescaped `"`, which a JSON string can't contain.
 */

const HAS_TAG = /<[a-z][\w-]*[\s/>]|<!--|<!doctype/i;
const STRONG = /=\\"|<\\\/|\\u00(?:3c|3e|26|22)/i;
const ESCAPE = /\\(?:["\\/bfnrt]|u[\da-fA-F]{4})/;
const WHITESPACE_ESCAPES = /\\[ntr]/g;
const CODE = /<(pre|code|kbd|samp|tt|textarea|script|style|xmp|listing)\b[^>]*>([\s\S]*?)<\\?\/\1\s*>/gi;
/** Whitespace, escaped or not, between a tag's `>` and the next `<`. */
const BETWEEN_TAGS = /(<[^<>]*>)((?:\s|\\[ntr])+)(?=<(\\?\/)?)/g;
const MAX_ROUNDS = 3;

function looksLikeHTML(text: string) {
  return HAS_TAG.test(text);
}

function htmlStrings(value: unknown, out: string[], depth = 0) {
  if (depth > 8) return;
  if (typeof value === "string") {
    if (looksLikeHTML(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) htmlStrings(item, out, depth + 1);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) htmlStrings(item, out, depth + 1);
  }
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Newline and tab escapes only between tags, none inside code, and not an element's whole content (`<p>\n</p>`). */
function structuralWhitespace(text: string) {
  for (const match of text.matchAll(CODE)) if (ESCAPE.test(match[2])) return false;
  let structural = 0;
  const total = text.match(WHITESPACE_ESCAPES)?.length ?? 0;
  for (const match of text.matchAll(BETWEEN_TAGS)) {
    const escapes = match[2].match(WHITESPACE_ESCAPES)?.length ?? 0;
    if (!escapes) continue;
    const opening = !/^<[/!?]|\/>$/.test(match[1]);
    if (opening && match[3] !== undefined) return false;
    structural += escapes;
  }
  return structural >= 2 && structural === total;
}

function decodeOnce(input: string): string | null {
  const text = input.trim();
  const first = text[0];
  if (first === '"' || first === "[" || first === "{") {
    const value = parseJSON(text);
    if (value === undefined) return null;
    const found: string[] = [];
    htmlStrings(value, found);
    return found.length ? found.join("\n") : null;
  }
  if (!ESCAPE.test(text) || !(looksLikeHTML(text) || /\\u003c/i.test(text))) return null;
  if (!STRONG.test(text.replace(CODE, "")) && !structuralWhitespace(text)) return null;
  const value = parseJSON(`"${text}"`);
  return typeof value === "string" && looksLikeHTML(value) ? value : null;
}

/** The HTML inside JSON-encoded input, or `null` when the input isn't JSON-encoded HTML. */
export function decodeEscapedHTML(input: string): string | null {
  let html: string | null = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const next = decodeOnce(html ?? input);
    if (next === null) break;
    html = next;
  }
  return html;
}
