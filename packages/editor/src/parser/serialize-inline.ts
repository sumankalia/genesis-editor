import { cleanSwatches, cssColor, isPaletteName, type ColorSwatch } from "./colors";
import { isFontSize } from "./font-size";
import { isSafeUrl } from "./sanitize";
import type { HtmlBlock, HtmlInline, HtmlStyles } from "./types";

export type Props = Record<string, string | number | boolean | undefined>;

export function inline(content: HtmlBlock["content"]): string {
  if (!Array.isArray(content)) return "";
  const texts = content.flatMap((node) => (node.type === "link" ? node.content : [node]));
  const full = texts.map((t) => t.text).join("");
  let offset = 0;
  const text = (node: { text: string; styles: HtmlStyles }) => {
    const html = styled(escapeInline(node.text, full, offset), node.styles);
    offset += node.text.length;
    return html;
  };
  let html = "";
  for (const node of content as HtmlInline[]) {
    if (node.type === "link") {
      const inner = node.content.map(text).join("");
      html += isSafeUrl(node.href) ? `<a href="${escapeAttr(node.href)}">${inner}</a>` : inner;
    } else html += text(node);
  }
  // The parser drops a final line break, as browsers do; a second one keeps the trailing newline.
  return full.endsWith("\n") ? `${html}<br>` : html;
}

const SPACE = /[ \u00a0\t\n]/;

/**
 * Escapes text so the parser's whitespace collapsing gives it back unchanged. Spaces it would
 * collapse or trim (doubled, or at a line's edge) go in a `white-space:pre-wrap` span: the parser
 * collapses `&nbsp;` next to other whitespace, as pasted HTML uses it as padding.
 */
function escapeInline(text: string, full: string, offset: number) {
  let out = "";
  let kept = "";
  const flush = () => {
    if (kept) out += `<span style="white-space:pre-wrap">${kept}</span>`;
    kept = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const at = offset + i;
    if (ch === " " || ch === "\u00a0") {
      const edge = at === 0 || at === full.length - 1 || SPACE.test(full[at - 1]) || SPACE.test(full[at + 1]);
      if (edge) {
        kept += " ";
        continue;
      }
    }
    flush();
    if (ch === "\n") out += "<br>";
    else if (ch === "\t") out += '<span style="white-space:pre">\t</span>';
    else out += escapeChar(ch === "\u00a0" ? " " : ch);
  }
  flush();
  return out;
}

function styled(html: string, styles: HtmlStyles) {
  if (!html) return html;
  if (styles.code) html = `<code>${html}</code>`;
  if (styles.strike) html = `<s>${html}</s>`;
  if (styles.underline) html = `<u>${html}</u>`;
  if (styles.italic) html = `<em>${html}</em>`;
  if (styles.bold) html = `<strong>${html}</strong>`;
  const size = !styles.code && isFontSize(styles.fontSize) ? styles.fontSize : undefined;
  const attrs = colorAttrs(styles.textColor, styles.backgroundColor, size ? [`font-size:${size}`] : []);
  if (attrs) html = `<span${attrs}${size ? ` data-font-size="${size}"` : ""}>${html}</span>`;
  return html;
}

export function plainText(content: HtmlBlock["content"]) {
  if (!Array.isArray(content)) return "";
  return content.map((n) => (n.type === "link" ? n.content.map((t) => t.text).join("") : n.text)).join("");
}

let swatches: ColorSwatch[] = [];

/** Runs `fn` with the swatches `toHTML` was given. */
export function withSwatches<T>(list: readonly ColorSwatch[] | undefined, fn: () => T): T {
  const previous = swatches;
  swatches = cleanSwatches(list);
  try {
    return fn();
  } finally {
    swatches = previous;
  }
}

const named = (value: string) => isPaletteName(value) || swatches.some((s) => s.name === value);

export function colorAttrs(text: unknown, background: unknown, extraStyle: string[] = []) {
  const style = [...extraStyle];
  const data: string[] = [];
  if (typeof text === "string" && text !== "default") {
    const css = cssColor(text, "text", swatches);
    if (css) style.push(`color:${css}`);
    if (css && named(text)) data.push(` data-text-color="${text}"`);
  }
  if (typeof background === "string" && background !== "default") {
    const css = cssColor(background, "background", swatches);
    if (css) style.push(`background-color:${css}`);
    if (css && named(background)) data.push(` data-background-color="${background}"`);
  }
  return (style.length ? ` style="${style.join(";")}"` : "") + data.join("");
}

const META_ATTRS = ["id", "lang", "dir"] as const;

/** The only engine meta HTML export writes (§16): `id`, `lang`, `dir`. */
export function metaAttrs(meta: HtmlBlock["meta"]) {
  const attrs = meta?.attrs;
  if (!attrs) return "";
  return META_ATTRS.filter((key) => typeof attrs[key] === "string" && attrs[key])
    .map((key) => ` ${key}="${escapeAttr(attrs[key])}"`)
    .join("");
}

export function blockAttrs(props: Props | undefined) {
  if (!props) return "";
  const align = props.textAlignment;
  const extra = typeof align === "string" && /^(center|right|justify)$/.test(align) ? [`text-align:${align}`] : [];
  return colorAttrs(props.textColor, props.backgroundColor, extra);
}

function escapeChar(ch: string) {
  return ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch;
}

export function escapeText(text: string) {
  return text.replace(/[&<>]/g, escapeChar);
}

export function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
