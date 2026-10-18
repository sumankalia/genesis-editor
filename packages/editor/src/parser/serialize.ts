import { blockAttrs, escapeAttr, escapeText, inline, plainText, type Props } from "./serialize-inline";
import { serializeFile, serializeMedia, serializeTable } from "./serialize-media";
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
  return serializeBlocks(blocks, options.separator ?? "\n");
}

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
      const children = item.children?.length ? serializeBlocks(item.children) : "";
      // Without a lead paragraph the first child would become the item's own text.
      const lead = !content && children ? "<p></p>" : content;
      return `<li${value}${blockAttrs(item.props)}>${box}${lead}${children}</li>`;
    })
    .join("");
  return `<${tag}${startAttr}>${body}</${tag}>`;
}

function serializeBlock(block: HtmlBlock): string {
  const props = (block.props ?? {}) as Props;
  const children = block.children?.length ? serializeBlocks(block.children) : "";
  const nested = children ? `<div data-genesis-children>${children}</div>` : "";
  switch (block.type) {
    case "paragraph":
      return `<p${blockAttrs(props)}>${inline(block.content)}</p>${nested}`;
    case "heading": {
      const level = Math.min(6, Math.max(1, typeof props.level === "number" ? Math.round(props.level) : 1));
      const heading = `<h${level}${blockAttrs(props)}>${inline(block.content)}</h${level}>`;
      return props.isToggleable ? `<details open><summary>${heading}</summary>${children}</details>` : heading + nested;
    }
    case "toggleListItem":
      return `<details open${blockAttrs(props)}><summary>${inline(block.content)}</summary>${children}</details>`;
    case "quote":
      return `<blockquote${blockAttrs(props)}><p>${inline(block.content)}</p>${children}</blockquote>`;
    case "codeBlock": {
      const language = typeof props.language === "string" && props.language !== "text" ? ` class="language-${escapeAttr(props.language)}"` : "";
      return `<pre><code${language}>${escapeText(plainText(block.content))}</code></pre>${nested}`;
    }
    case "divider":
      return `<hr>${nested}`;
    case "table":
      return serializeTable(block.content as HtmlTableContent | undefined) + nested;
    case "image":
    case "video":
    case "audio":
      return serializeMedia(block.type, props) + nested;
    case "file":
      return serializeFile(props) + nested;
    default:
      return `<p>${inline(block.content)}</p>${nested}`;
  }
}
