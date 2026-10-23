import { createBlockSpec, createExtension, type ExtensionFactoryInstance } from "@blocknote/core";
import { Columns2, Columns3 } from "lucide-react";
import { Plugin, PluginKey } from "prosemirror-state";

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

const WIDTH_STYLE_ID = "genesis-column-widths";

/** Widths live on our node (`data-width`); the outer's flex-grow is a :has() rule. Mutating
 * BlockNote's `.bn-block-outer` is a ProseMirror mutation and remounts the document. */
function ensureWidthStyles() {
  if (typeof document === "undefined" || document.getElementById(WIDTH_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = WIDTH_STYLE_ID;
  const rules = Array.from({ length: 99 }, (_, i) => {
    const n = i + 1;
    return `.genesis-editor .bn-block-outer:has(> .bn-block > [data-content-type="column"][data-width="${n}"]){flex-grow:${n}}`;
  });
  style.textContent = rules.join("");
  document.head.append(style);
}

function setColumnWidth(dom: HTMLElement, width: number) {
  dom.dataset.width = String(Math.max(1, Math.min(99, Math.round(width))));
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

function siblingsOf(editor: AnyEditor, block: LooseBlock): LooseBlock[] {
  const found = locate(editor.document as unknown as LooseBlock[], block.id);
  if (!found) return [];
  if (!found.ancestors.length) return editor.document as unknown as LooseBlock[];
  return found.ancestors[found.ancestors.length - 1].children ?? [];
}

function nextSibling(editor: AnyEditor, block: LooseBlock): LooseBlock | undefined {
  const siblings = siblingsOf(editor, block);
  const index = siblings.findIndex((item) => item.id === block.id);
  return index >= 0 ? siblings[index + 1] : undefined;
}

function liveBlock(editor: AnyEditor, block: { id: string }): LooseBlock | undefined {
  return editor.getBlock(block.id) as unknown as LooseBlock | undefined;
}

/** A full-width paragraph after this columnList, created if the list is the last sibling. */
function ensureFullWidthAfter(editor: AnyEditor, list: LooseBlock): LooseBlock {
  const current = liveBlock(editor, list) ?? list;
  const next = nextSibling(editor, current);
  if (next && next.type !== "column" && next.type !== "columnList") return next;
  const inserted = editor.insertBlocks([{ type: "paragraph" }], current, "after");
  return inserted[0] as unknown as LooseBlock;
}

function focusFirstCell(editor: AnyEditor, list: LooseBlock) {
  const live = liveBlock(editor, list) ?? list;
  const first = live.children?.[0]?.children?.[0];
  if (first) editor.setTextCursorPosition(first, "start");
}

/** Insert 2 or 3 columns. Nested columns are inserted after the ancestor list, not inside a column. */
export function insertColumns(editor: AnyEditor, count: 2 | 3 = 2) {
  if (!("columnList" in editor.schema.blockSchema)) return;
  const list = emptyColumns(count);
  const cursor = editor.getTextCursorPosition().block as unknown as LooseBlock;
  const found = locate(editor.document as unknown as LooseBlock[], cursor.id);
  const ancestorList = found?.ancestors.find((block) => block.type === "columnList");
  const created = ancestorList
    ? (editor.insertBlocks([list], ancestorList, "after")[0] as unknown as LooseBlock)
    : isEmptyParagraph(cursor)
      ? ((editor.replaceBlocks([cursor.id], [list] as never) as { insertedBlocks: LooseBlock[] }).insertedBlocks[0] as LooseBlock)
      : (editor.insertBlocks([list], cursor, "after")[0] as unknown as LooseBlock);
  if (!created) return;
  ensureFullWidthAfter(editor, created);
  focusFirstCell(editor, created);
}

/**
 * Enter on the empty last block of a column leaves the section: a full-width paragraph
 * after the `columnList`. Other Enter presses stay inside the column (any nested blocks).
 */
export function exitColumnOnEnter(editor: AnyEditor): boolean {
  if (!editor.isEditable) return false;
  const cursor = editor.getTextCursorPosition().block as unknown as LooseBlock;
  const found = locate(editor.document as unknown as LooseBlock[], cursor.id);
  const list = found?.ancestors.find((block) => block.type === "columnList");
  const column = found?.ancestors.find((block) => block.type === "column");
  if (!list || !column) return false;

  const columnList = liveBlock(editor, list) ?? list;
  const columnBlock = liveBlock(editor, column) ?? column;
  const kids = columnBlock.children ?? [];
  const last = kids[kids.length - 1];
  if (!last || last.id !== cursor.id) return false;

  const isLastColumn = (columnList.children ?? []).at(-1)?.id === column.id;
  if (!isLastColumn) return false;

  const after = ensureFullWidthAfter(editor, columnList);

  if (isEmptyParagraph(cursor) && kids.length > 1) editor.removeBlocks([cursor.id]);
  editor.setTextCursorPosition(after, "start");
  return true;
}

function clickBelowColumns(editor: AnyEditor, event: MouseEvent): boolean {
  if (!editor.isEditable) return false;
  const root = editor.domElement;
  if (!root?.contains(event.target as Node)) return false;
  const lists = [...root.querySelectorAll('[data-content-type="columnList"]')];
  for (const node of lists) {
    const outer = node.closest(".bn-block-outer") as HTMLElement | null;
    if (!outer) continue;
    const rect = outer.getBoundingClientRect();
    if (event.clientY <= rect.bottom + 2) continue;
    const next = outer.nextElementSibling as HTMLElement | null;
    if (next && event.clientY >= next.getBoundingClientRect().top) continue;
    const id = (outer.getAttribute("data-id") || outer.querySelector("[data-id]")?.getAttribute("data-id") || "").trim();
    const list = id ? (editor.getBlock(id) as unknown as LooseBlock | undefined) : undefined;
    if (!list || list.type !== "columnList") continue;
    const after = ensureFullWidthAfter(editor, list);
    editor.setTextCursorPosition(after, "start");
    event.preventDefault();
    return true;
  }
  return false;
}

function attachResize(dom: HTMLElement, block: LooseBlock, editor: AnyEditor) {
  if (dom.querySelector(":scope > .genesis-column-resize")) return;
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
    const rightContent = next.querySelector("[data-content-type='column']") as HTMLElement | null;
    const rightId =
      (rightContent?.closest("[data-id]")?.getAttribute("data-id") || rightContent?.getAttribute("data-id") || "").trim();
    const leftBlock = editor.getBlock(leftId) as unknown as LooseBlock | undefined;
    const rightBlock = rightId ? (editor.getBlock(rightId) as unknown as LooseBlock | undefined) : undefined;
    if (!leftBlock || !rightBlock || rightBlock.type !== "column" || !rightContent) return;
    const startLeft = columnWidthOf(leftBlock);
    const startRight = columnWidthOf(rightBlock);
    const pair = outer.getBoundingClientRect().width + next.getBoundingClientRect().width;
    const origin = outer.getBoundingClientRect().left;
    const apply = (clientX: number) => {
      const ratio = pair > 0 ? (clientX - origin) / pair : 0.5;
      const [left, right] = resizePair(startLeft, startRight, ratio * (startLeft + startRight));
      setColumnWidth(dom, left);
      setColumnWidth(rightContent, right);
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
  ensureWidthStyles();
  const dom = el("div", "genesis-column");
  setColumnWidth(dom, columnWidthOf(block));
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

/** Click in the empty space below a column section continues full-width after it. */
export function columnsSectionExtension(): ExtensionFactoryInstance {
  return createExtension(({ editor }: { editor: AnyEditor }) => ({
    key: "genesis-columns-section",
    prosemirrorPlugins: [
      new Plugin({
        key: new PluginKey("genesis-columns-section"),
        props: {
          handleKeyDown(_view, event) {
            if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false;
            return exitColumnOnEnter(editor);
          },
          handleClick(_view, _pos, event) {
            return clickBelowColumns(editor, event);
          },
        },
      }),
    ],
  }))();
}

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
