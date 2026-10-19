import { cleanSwatches, cssColor, isPaletteName, type ColorSwatch } from "./colors";
import { isFontSize } from "./font-size";
import { isSafeUrl } from "./sanitize";
import type { HtmlBlock, HtmlInline, HtmlInlineImage, HtmlStyles } from "./types";

const IMAGE_CHAR = "\uFFFC";

export type Props = Record<string, string | number | boolean | undefined>;

export function inline(content: HtmlBlock["content"]): string {
  if (!Array.isArray(content)) return "";
  // Images count as one character, so spaces next to them aren't taken for a line's edge.
  const full = (content as HtmlInline[]).map((node) => (node.type === "link" ? node.content.map((t) => t.text).join("") : node.type === "text" ? node.text : IMAGE_CHAR)).join("");
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
    } else if (node.type === "inlineImage") {
      html += inlineImage(node);
      offset += 1;
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
  return content.map((n) => (n.type === "link" ? n.content.map((t) => t.text).join("") : n.type === "text" ? n.text : "")).join("");
}

const str = (value: Props[string]) => (typeof value === "string" ? value : "");
const int = (value: Props[string]) => (typeof value === "number" && value > 0 ? Math.round(value) : undefined);

/**
 * An `<img>`, in an `<a>` when linked. `extra` are attributes written on the `<img>` (srcset, a marker);
 * the result takes the outer element's attributes.
 */
export function imageHtml(url: string, props: Props, extra = "") {
  const alt = str(props.alt) || str(props.name);
  const width = int(props.width);
  const height = int(props.height);
  const preview = int(props.previewWidth);
  const size = (width ? ` width="${width}"` : "") + (height ? ` height="${height}"` : "");
  // Display width as a style, so it isn't read back as the intrinsic width.
  const display = preview && preview !== width ? ` style="width:${preview}px"` : "";
  const href = str(props.href) && isSafeUrl(str(props.href)) ? str(props.href) : "";
  const target = props.openInNewTab === true ? ` target="_blank" rel="noopener noreferrer"` : "";
  // Read back on import, so an image that was already re-hosted isn't copied again.
  const original = /^https?:\/\//i.test(str(props.originalUrl)) && isSafeUrl(str(props.originalUrl)) ? ` data-original-src="${escapeAttr(str(props.originalUrl))}"` : "";
  // The image is on the app's own storage, so loading this HTML again never copies it.
  const hosted = props.hosted === true ? " data-genesis-hosted" : "";
  return (attrs: string) => {
    const img = `<img${href ? "" : attrs} src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${extra}${size}${display}${original}${hosted}>`;
    return href ? `<a${attrs} href="${escapeAttr(href)}"${target}>${img}</a>` : img;
  };
}

/** `data-genesis-inline` keeps it inline when read back outside a table cell. */
function inlineImage(node: HtmlInlineImage) {
  const url = node.props.url;
  if (!url || !isSafeUrl(url, true)) return "";
  return imageHtml(url, node.props, " data-genesis-inline")("");
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
