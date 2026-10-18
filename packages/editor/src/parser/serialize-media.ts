import { isSafeUrl } from "./sanitize";
import { blockAttrs, escapeAttr, escapeText, inline, type Props } from "./serialize-inline";
import type { HtmlTableCell, HtmlTableContent } from "./types";

export function serializeTable(content: HtmlTableContent | undefined) {
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
  return `<table>${colgroup}${head ? `<thead>${head}</thead>` : ""}${body ? `<tbody>${body}</tbody>` : ""}</table>`;
}

function serializeCell(cell: HtmlTableCell, header: boolean) {
  const tag = header ? "th" : "td";
  const p = cell.props ?? {};
  const spans = (p.colspan && p.colspan > 1 ? ` colspan="${p.colspan}"` : "") + (p.rowspan && p.rowspan > 1 ? ` rowspan="${p.rowspan}"` : "");
  return `<${tag}${spans}${blockAttrs(p)}>${inline(cell.content)}</${tag}>`;
}

function figure(inner: string, props: Props) {
  const caption = typeof props.caption === "string" && props.caption ? `<figcaption>${escapeText(props.caption)}</figcaption>` : "";
  const align = blockAttrs({ textAlignment: props.textAlignment });
  return caption || align ? `<figure${align}>${inner}${caption}</figure>` : inner;
}

export function serializeMedia(type: "image" | "video" | "audio", props: Props) {
  const url = typeof props.url === "string" && props.url && isSafeUrl(props.url, true) ? props.url : undefined;
  if (!url) return "";
  const name = typeof props.name === "string" ? props.name : "";
  const width = typeof props.previewWidth === "number" && type !== "audio" ? ` width="${Math.round(props.previewWidth)}"` : "";
  if (type === "image") return figure(`<img src="${escapeAttr(url)}" alt="${escapeAttr(name)}"${width}>`, props);
  const title = name ? ` title="${escapeAttr(name)}"` : "";
  return figure(`<${type} src="${escapeAttr(url)}" controls${title}${width}></${type}>`, props);
}

export function serializeFile(props: Props) {
  const url = typeof props.url === "string" && props.url && isSafeUrl(props.url) ? props.url : undefined;
  if (!url) return "";
  const name = typeof props.name === "string" ? props.name : "";
  const caption = typeof props.caption === "string" && props.caption ? `<figcaption>${escapeText(props.caption)}</figcaption>` : "";
  return `<figure><a href="${escapeAttr(url)}" download="${escapeAttr(name)}">${escapeText(name || url)}</a>${caption}</figure>`;
}
