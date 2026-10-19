import { createBlockSpec } from "@blocknote/core";
import { Columns2, Columns3 } from "lucide-react";

import { columnWidthOf, resizePair, splitWidths } from "../parser/columns";
import { ToolbarButton } from "./toolbar-button";
import type { AnyEditor, AnyPartialBlock, SlashMenuItem } from "./types";

type LooseBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content: unknown;
  children: LooseBlock[];
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function isolate(node: HTMLElement) {
  for (const type of ["keydown", "keypress", "beforeinput", "input", "mousedown", "paste", "drop"]) {
    node.addEventListener(type, (event) => event.stopPropagation());
  }
}

function applyColumnWidth(dom: HTMLElement, width: number) {
  const outer = dom.closest(".bn-block-outer") as HTMLElement | null;
  if (!outer) return false;
  outer.style.flexGrow = String(Math.max(1, width));
  outer.style.flexShrink = "1";
  outer.style.flexBasis = "0px";
  outer.style.minWidth = "0";
  return true;
}

function locate(blocks: LooseBlock[], id: string, ancestors: LooseBlock[] = []): { block: LooseBlock; ancestors: LooseBlock[] } | null {
  for (const block of blocks) {
    if (block.id === id) return { block, ancestors };
    const kids = block.children ?? [];
    if (kids.length) {
      const found = locate(kids, id, [...ancestors, block]);
      if (found) return found;
    }
  }
  return null;
}

function isEmptyParagraph(block: { type: string; content?: unknown; children?: unknown[] }) {
  if (block.type !== "paragraph") return false;
  if (block.children?.length) return false;
  const content = block.content;
  if (!content) return true;
  if (typeof content === "string") return !content.trim();
  if (!Array.isArray(content)) return false;
  return content.every((part) => typeof part === "string" ? !part.trim() : !(part as { text?: string }).text?.trim());
}

export function emptyColumns(count: 2 | 3): AnyPartialBlock {
  const widths = splitWidths(count);
  return {
    type: "columnList",
    children: widths.map((width) => ({
      type: "column",
      props: { width },
      children: [{ type: "paragraph" }],
    })),
  };
}

/** Insert 2 or 3 columns. Nested columns are inserted after the ancestor list, not inside a column. */
export function insertColumns(editor: AnyEditor, count: 2 | 3 = 2) {
  if (!("columnList" in editor.schema.blockSchema)) return;
  const list = emptyColumns(count);
  const cursor = editor.getTextCursorPosition().block as unknown as LooseBlock;
  const found = locate(editor.document as unknown as LooseBlock[], cursor.id);
  const ancestorList = found?.ancestors.find((block) => block.type === "columnList");
  if (ancestorList) {
    editor.insertBlocks([list], ancestorList, "after");
    return;
  }
  if (isEmptyParagraph(cursor)) editor.replaceBlocks([cursor.id], [list] as never);
  else editor.insertBlocks([list], cursor, "after");
}

function attachResize(dom: HTMLElement, block: LooseBlock, editor: AnyEditor) {
  const handle = el("div", "genesis-column-resize");
  handle.title = "Resize columns";
  handle.dataset.testid = "column-resize";
  isolate(handle);
  handle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const outer = dom.closest(".bn-block-outer") as HTMLElement | null;
    const next = outer?.nextElementSibling as HTMLElement | null;
    if (!outer || !next) return;
    const leftId = block.id;
    const rightContent = next.querySelector("[data-content-type='column']");
    const rightId =
      (rightContent?.closest("[data-id]")?.getAttribute("data-id") || rightContent?.getAttribute("data-id") || "").trim();
    const leftBlock = editor.getBlock(leftId) as unknown as LooseBlock | undefined;
    const rightBlock = rightId ? (editor.getBlock(rightId) as unknown as LooseBlock | undefined) : undefined;
    if (!leftBlock || !rightBlock || rightBlock.type !== "column") return;
    const startLeft = columnWidthOf(leftBlock);
    const startRight = columnWidthOf(rightBlock);
    const pair = outer.getBoundingClientRect().width + next.getBoundingClientRect().width;
    const origin = outer.getBoundingClientRect().left;
    const apply = (clientX: number) => {
      const ratio = pair > 0 ? (clientX - origin) / pair : 0.5;
      const [left, right] = resizePair(startLeft, startRight, ratio * (startLeft + startRight));
      outer.style.flexGrow = String(left);
      next.style.flexGrow = String(right);
      return [left, right] as const;
    };
    const onMove = (move: MouseEvent) => apply(move.clientX);
    const onUp = (up: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const [left, right] = apply(up.clientX);
      editor.updateBlock(leftId, { props: { width: left } } as never);
      editor.updateBlock(rightBlock.id, { props: { width: right } } as never);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
  dom.append(handle);
}

function renderColumnList() {
  const dom = el("div", "genesis-column-list");
  dom.dataset.testid = "genesis-columns";
  return { dom };
}

function renderColumn(block: LooseBlock, editor: AnyEditor) {
  const dom = el("div", "genesis-column");
  const width = columnWidthOf(block);
  let tries = 0;
  const apply = () => {
    if (applyColumnWidth(dom, width) || tries++ > 20) return;
    requestAnimationFrame(apply);
  };
  apply();
  if (editor.isEditable) attachResize(dom, block, editor);
  return { dom };
}

export const columnListSpec = createBlockSpec(
  {
    type: "columnList",
    propSchema: {},
    content: "none",
  },
  {
    render: () => renderColumnList(),
  },
)();

export const columnSpec = createBlockSpec(
  {
    type: "column",
    propSchema: {
      width: { default: 50 },
    },
    content: "none",
  },
  {
    render: (block, editor) => renderColumn(block as unknown as LooseBlock, editor as unknown as AnyEditor),
  },
)();

export const columnsSlashItems: SlashMenuItem[] = [
  {
    key: "columns",
    title: "Columns",
    subtext: "Two columns, side by side",
    aliases: ["column", "two columns", "2 columns", "layout", "wrap"],
    group: "Basic blocks",
    icon: <Columns2 size={18} />,
    onItemClick: (editor) => insertColumns(editor, 2),
  },
  {
    key: "columns3",
    title: "3 columns",
    subtext: "Three columns, side by side",
    aliases: ["three columns", "3 column", "triple"],
    group: "Basic blocks",
    icon: <Columns3 size={18} />,
    onItemClick: (editor) => insertColumns(editor, 3),
  },
];

export function ColumnsButton() {
  return (
    <ToolbarButton
      label="Columns"
      icon={<Columns2 size={16} />}
      onClick={(editor) => insertColumns(editor, 2)}
      isSelected={(editor) => {
        const cursor = editor.getTextCursorPosition().block as unknown as LooseBlock;
        return Boolean(locate(editor.document as unknown as LooseBlock[], cursor.id)?.ancestors.some((block) => block.type === "columnList"));
      }}
    />
  );
}
