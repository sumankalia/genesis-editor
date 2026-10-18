import { cssColor, isPaletteName } from "./colors";
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

/** Escapes text so the parser's whitespace collapsing gives it back unchanged. */
function escapeInline(text: string, full: string, offset: number) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const at = offset + i;
    if (ch === "\n") out += "<br>";
    else if (ch === "\t") out += '<span style="white-space:pre">\t</span>';
    else if (ch === " " || ch === "\u00a0") {
      const prev = full[at - 1];
      const next = full[at + 1];
      const edge = at === 0 || at === full.length - 1 || prev === " " || prev === "\n" || prev === "\t" || next === "\n";
      out += edge ? "&nbsp;" : " ";
    } else out += escapeChar(ch);
  }
  return out;
}

function styled(html: string, styles: HtmlStyles) {
  if (!html) return html;
  if (styles.code) html = `<code>${html}</code>`;
  if (styles.strike) html = `<s>${html}</s>`;
  if (styles.underline) html = `<u>${html}</u>`;
  if (styles.italic) html = `<em>${html}</em>`;
  if (styles.bold) html = `<strong>${html}</strong>`;
  const color = colorAttrs(styles.textColor, styles.backgroundColor);
  if (color) html = `<span${color}>${html}</span>`;
  return html;
}

export function plainText(content: HtmlBlock["content"]) {
  if (!Array.isArray(content)) return "";
  return content.map((n) => (n.type === "link" ? n.content.map((t) => t.text).join("") : n.text)).join("");
}

export function colorAttrs(text: unknown, background: unknown, extraStyle: string[] = []) {
  const style = [...extraStyle];
  const data: string[] = [];
  if (typeof text === "string" && text !== "default") {
    const css = cssColor(text, "text");
    if (css) style.push(`color:${css}`);
    if (isPaletteName(text)) data.push(` data-text-color="${text}"`);
  }
  if (typeof background === "string" && background !== "default") {
    const css = cssColor(background, "background");
    if (css) style.push(`background-color:${css}`);
    if (isPaletteName(background)) data.push(` data-background-color="${background}"`);
  }
  return (style.length ? ` style="${style.join(";")}"` : "") + data.join("");
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
