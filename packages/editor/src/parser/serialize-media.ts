import { isSafeUrl } from "./sanitize";
import { blockAttrs, escapeAttr, escapeText, inline, plainText, type Props } from "./serialize-inline";
import type { HtmlInline, HtmlTableCell, HtmlTableContent } from "./types";

export function serializeTable(content: HtmlTableContent | undefined, attrs = "") {
  if (!content?.rows?.length) return "";
  const widths = content.columnWidths ?? [];
  const colgroup = widths.some((w) => typeof w === "number")
    ? `<colgroup>${widths.map((w) => (typeof w === "number" ? `<col style="width:${Math.round(w)}px">` : "<col>")).join("")}</colgroup>`
    : "";
  const headerRows = content.headerRows ?? 0;
  const headerCols = content.headerCols ?? 0;
  const row = (cells: HtmlTableCell[], header: boolean) => `<tr>${cells.map((cell, c) => serializeCell(cell, header || c < headerCols)).join("")}</tr>`;
  const head = content.rows.slice(0, headerRows).map((r) => row(r.cells, true)).join("");
  const body = content.rows.slice(headerRows).map((r) => row(r.cells, false)).join("");
  return `<table${attrs}>${colgroup}${head ? `<thead>${head}</thead>` : ""}${body ? `<tbody>${body}</tbody>` : ""}</table>`;
}

function serializeCell(cell: HtmlTableCell, header: boolean) {
  const tag = header ? "th" : "td";
  const p = cell.props ?? {};
  const spans = (p.colspan && p.colspan > 1 ? ` colspan="${p.colspan}"` : "") + (p.rowspan && p.rowspan > 1 ? ` rowspan="${p.rowspan}"` : "");
  return `<${tag}${spans}${blockAttrs(p)}>${inline(cell.content)}</${tag}>`;
}

/** Wraps media in a `<figure>` when it has a caption or alignment; `attrs` go on the outermost element. */
function figure(media: (attrs: string) => string, props: Props, attrs: string) {
  const text = typeof props.caption === "string" ? props.caption : "";
  const caption = text ? `<figcaption>${richCaption(props.captionRich, text) ?? escapeText(text)}</figcaption>` : "";
  const align = blockAttrs({ textAlignment: props.textAlignment });
  if (caption || align) return `<figure${attrs}${align}>${media("")}${caption}</figure>`;
  return media(attrs);
}

/** `captionRich` as HTML, only while its text still matches `caption` (the caption may have been edited since). */
function richCaption(json: Props["captionRich"], caption: string) {
  if (typeof json !== "string" || !json) return undefined;
  try {
    const content = JSON.parse(json) as HtmlInline[];
    return Array.isArray(content) && plainText(content) === caption ? inline(content) : undefined;
  } catch {
    return undefined;
  }
}

const str = (value: Props[string]) => (typeof value === "string" ? value : "");
const int = (value: Props[string]) => (typeof value === "number" && value > 0 ? Math.round(value) : undefined);

function image(url: string, props: Props) {
  const alt = str(props.alt) || str(props.name);
  const srcset = str(props.srcset) && !str(props.originalUrl) ? ` srcset="${escapeAttr(str(props.srcset))}"${str(props.sizes) ? ` sizes="${escapeAttr(str(props.sizes))}"` : ""}` : "";
  const width = int(props.width);
  const height = int(props.height);
  const preview = int(props.previewWidth);
  const size = (width ? ` width="${width}"` : "") + (height ? ` height="${height}"` : "");
  // Display width as a style, so it isn't read back as the intrinsic width.
  const display = preview && preview !== width ? ` style="width:${preview}px"` : "";
  const href = str(props.href) && isSafeUrl(str(props.href)) ? str(props.href) : "";
  // Read back on import, so an image that was already re-hosted isn't copied again.
  const original = /^https?:\/\//i.test(str(props.originalUrl)) && isSafeUrl(str(props.originalUrl)) ? ` data-original-src="${escapeAttr(str(props.originalUrl))}"` : "";
  // The image is on the app's own storage, so loading this HTML again never copies it.
  const hosted = props.hosted === true ? " data-genesis-hosted" : "";
  return (attrs: string) => {
    const img = `<img${href ? "" : attrs} src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${srcset}${size}${display}${original}${hosted}>`;
    return href ? `<a${attrs} href="${escapeAttr(href)}">${img}</a>` : img;
  };
}

export function serializeMedia(type: "image" | "video" | "audio", props: Props, attrs = "") {
  const url = typeof props.url === "string" && props.url && isSafeUrl(props.url, true) ? props.url : undefined;
  if (!url) return "";
  const name = typeof props.name === "string" ? props.name : "";
  const width = typeof props.previewWidth === "number" && type !== "audio" ? ` width="${Math.round(props.previewWidth)}"` : "";
  if (type === "image") return figure(image(url, props), props, attrs);
  const title = name ? ` title="${escapeAttr(name)}"` : "";
  return figure((a) => `<${type}${a} src="${escapeAttr(url)}" controls${title}${width}></${type}>`, props, attrs);
}

export function serializeFile(props: Props, attrs = "") {
  const url = typeof props.url === "string" && props.url && isSafeUrl(props.url) ? props.url : undefined;
  if (!url) return "";
  const name = typeof props.name === "string" ? props.name : "";
  const caption = typeof props.caption === "string" && props.caption ? `<figcaption>${escapeText(props.caption)}</figcaption>` : "";
  return `<figure${attrs}><a href="${escapeAttr(url)}" download="${escapeAttr(name)}">${escapeText(name || url)}</a>${caption}</figure>`;
}
