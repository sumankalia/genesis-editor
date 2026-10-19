import { isSafeUrl } from "./sanitize";
import { blockAttrs, escapeAttr, escapeText, inline, metaAttrs, plainText, withSwatches, type Props } from "./serialize-inline";
import { embedRegistry } from "./embeds";
import { serializeEmbed, type EmbedEnv } from "./serialize-embed";
import { serializeLinkPreview } from "./serialize-link-preview";
import { serializeFile, serializeMedia, serializeTable } from "./serialize-media";
import { columnWidthOf, normalizeWidths } from "./columns";
import type { HtmlBlock, HtmlTableContent, ToHTMLOptions } from "./types";

const LIST_TAGS: Record<string, "ul" | "ol"> = {
  bulletListItem: "ul",
  checkListItem: "ul",
  numberedListItem: "ol",
};

/**
 * Serializes blocks to semantic HTML that `parseHTML` reads back to the same blocks. Palette colours
 * are written as inline `style` (for other apps) plus `data-*-color` (for an exact round trip).
 * Children of blocks that have no HTML nesting go in a `<div data-genesis-children>` after the block.
 */
export function toHTML(blocks: readonly HtmlBlock[], options: ToHTMLOptions = {}): string {
  const previous = env;
  // No origin: the exporting app's origin isn't known, and generic frames are sandboxed without `allow-same-origin`.
  env = {
    embeds: options.embeds ?? "auto",
    registry: embedRegistry({}, options.embedProviders, { origin: "" }),
    scripts: options.embedScripts ? new Set() : undefined,
  };
  try {
    return withSwatches(options.swatches, () => serializeBlocks(blocks, options.separator ?? "\n"));
  } finally {
    env = previous;
  }
}

let env: EmbedEnv = { embeds: "auto", registry: embedRegistry({}, [], { origin: "" }) };

function serializeBlocks(blocks: readonly HtmlBlock[], separator = ""): string {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; ) {
    const type = blocks[i].type;
    const listTag = LIST_TAGS[type];
    if (!listTag) {
      out.push(serializeBlock(blocks[i++]));
      continue;
    }
    const items: HtmlBlock[] = [];
    while (i < blocks.length && blocks[i].type === type) items.push(blocks[i++]);
    out.push(serializeList(listTag, items));
  }
  return out.join(separator);
}

function serializeList(tag: "ul" | "ol", items: HtmlBlock[]) {
  const first = items[0].props?.start;
  const startAttr = tag === "ol" && typeof first === "number" && first !== 1 ? ` start="${first}"` : "";
  const body = items
    .map((item, i) => {
      const start = item.props?.start;
      const value = i > 0 && typeof start === "number" ? ` value="${start}"` : "";
      const box = item.type === "checkListItem" ? `<input type="checkbox"${item.props?.checked ? " checked" : ""} disabled>` : "";
      const content = inline(item.content);
      const nested = item.children ?? [];
      // Plain HTML reads a heading in an `li` as bold text (§6), so non-list children need the container.
      const plain = nested.every((c) => c.type in LIST_TAGS || c.type === "paragraph");
      const children = !nested.length ? "" : plain ? serializeBlocks(nested) : `<div data-genesis-children>${serializeBlocks(nested)}</div>`;
      // Without a lead paragraph the first child would become the item's own text.
      const lead = !content && children ? "<p></p>" : content;
      return `<li${value}${metaAttrs(item.meta)}${blockAttrs(item.props)}>${box}${lead}${children}</li>`;
    })
    .join("");
  return `<${tag}${startAttr}>${body}</${tag}>`;
}

function serializeBlock(block: HtmlBlock): string {
  const props = (block.props ?? {}) as Props;
  const attrs = metaAttrs(block.meta);
  const children = block.children?.length ? serializeBlocks(block.children) : "";
  const nested = children ? `<div data-genesis-children>${children}</div>` : "";
  switch (block.type) {
    case "paragraph":
      return `<p${attrs}${blockAttrs(props)}>${inline(block.content)}</p>${nested}`;
    case "heading": {
      const level = Math.min(6, Math.max(1, typeof props.level === "number" ? Math.round(props.level) : 1));
      const heading = `<h${level}${attrs}${blockAttrs(props)}>${inline(block.content)}</h${level}>`;
      return props.isToggleable ? `<details open><summary>${heading}</summary>${children}</details>` : heading + nested;
    }
    case "toggleListItem":
      return `<details open${attrs}${blockAttrs(props)}><summary>${inline(block.content)}</summary>${children}</details>`;
    case "quote":
      return `<blockquote${attrs}${citeAttr(props.cite)}${blockAttrs(props)}><p>${inline(block.content)}</p>${serializeQuoteChildren(block.children ?? [])}</blockquote>`;
    case "codeBlock": {
      const language = typeof props.language === "string" && props.language !== "text" ? ` class="language-${escapeAttr(props.language)}"` : "";
      return `<pre${attrs}><code${language}>${escapeText(plainText(block.content))}</code></pre>${nested}`;
    }
    case "divider":
      return `<hr${attrs}>${nested}`;
    case "table":
      return serializeTable(block.content as HtmlTableContent | undefined, attrs) + nested;
    case "image":
    case "video":
    case "audio":
      return serializeMedia(block.type, props, attrs) + nested;
    case "file":
      return serializeFile(props, attrs) + nested;
    case "embed":
      return serializeEmbed(props, attrs, env) + nested;
    case "linkPreview":
      return serializeLinkPreview(props, attrs) + nested;
    case "columnList":
      return serializeColumnList(block);
    case "column":
      return serializeBlocks(block.children ?? []);
    default:
      return `<p${attrs}>${inline(block.content)}</p>${nested}`;
  }
}

/**
 * Email-safe presentation table. `data-genesis-columns` is how parseHTML reads it back as columns
 * rather than a data table; Gmail and Word keep `<table role="presentation">`.
 */
function serializeColumnList(block: HtmlBlock): string {
  const columns = (block.children ?? []).filter((child) => child.type === "column").slice(0, 3);
  if (columns.length < 2) return serializeBlocks(columns.flatMap((column) => column.children ?? []));
  const widths = normalizeWidths(columns.map(columnWidthOf), columns.length);
  const marked = widths.join(",");
  const colgroup = `<colgroup>${widths.map((width) => `<col style="width:${width}%">`).join("")}</colgroup>`;
  const cells = columns
    .map((column, i) => {
      const pad = i < columns.length - 1 ? "padding:0 12px 0 0;" : "padding:0;";
      const body = serializeBlocks(column.children ?? []) || "<p></p>";
      return `<td style="width:${widths[i]}%;vertical-align:top;${pad}">${body}</td>`;
    })
    .join("");
  const meta = metaAttrs(block.meta);
  return `<table data-genesis-columns="${columns.length}" data-genesis-column-widths="${escapeAttr(marked)}" role="presentation" style="width:100%;border-collapse:collapse;table-layout:fixed"${meta}>${colgroup}<tbody><tr>${cells}</tr></tbody></table>`;
}

const isAttribution = (block: HtmlBlock) => block.type === "paragraph" && block.meta?.source?.tag === "cite";

/** Quote children in order, with attribution paragraphs as `<cite>`. */
function serializeQuoteChildren(children: readonly HtmlBlock[]) {
  let html = "";
  let run: HtmlBlock[] = [];
  const flush = () => {
    if (run.length) html += serializeBlocks(run);
    run = [];
  };
  for (const child of children) {
    if (!isAttribution(child)) {
      run.push(child);
      continue;
    }
    flush();
    html += `<cite${metaAttrs(child.meta)}>${inline(child.content)}</cite>`;
    if (child.children?.length) run.push(...child.children);
  }
  flush();
  return html;
}

function citeAttr(cite: Props["cite"]) {
  return typeof cite === "string" && cite && isSafeUrl(cite) ? ` cite="${escapeAttr(cite)}"` : "";
}
