import type { Block, BlockNoteEditor, BlockNoteEditorOptions, PartialBlock } from "@blocknote/core";
import { TextSelection } from "prosemirror-state";

import { embedForUrl, type EmbedOptions, type EmbedProvider } from "./parser/embeds";
import { metaFromProps } from "./parser/meta";
import { parseHTML } from "./parser/parse";
import { toHTML } from "./parser/serialize";
import { escapeAttr, escapeText } from "./parser/serialize-inline";
import type { CleanOptions, FidelityReport, HtmlBlock, ParseMode } from "./parser/types";
import { convertBareEmbedLinks, embedRegistryOf } from "./plugins/embed";
import type { ToolSelection } from "./plugins/resolve";

export type HtmlImportOptions = {
  mode?: ParseMode;
  tools?: ToolSelection;
  baseUrl?: string;
  clean?: CleanOptions;
  trackProvenance?: boolean;
  maxDataImageBytes?: number;
  embeds?: EmbedOptions;
  embedProviders?: readonly EmbedProvider[];
};

export type HtmlImport = { blocks: PartialBlock[]; report: FidelityReport };

export function importHTML(
  html: string,
  options: HtmlImportOptions,
  sanitize: (blocks: PartialBlock[]) => PartialBlock[],
): HtmlImport {
  const { blocks, report } = parseHTML(html, options);
  return { blocks: sanitize(blocks as PartialBlock[]), report };
}

export function exportHTML(editor: BlockNoteEditor, embedProviders?: readonly EmbedProvider[]): string {
  return toHTML(metaFromProps(editor.document) as unknown as HtmlBlock[], { embedProviders });
}

function isEmptyParagraph(block: { type: string; content?: unknown; children: unknown[] }) {
  return block.type === "paragraph" && Array.isArray(block.content) && !block.content.length && !block.children.length;
}

function isInlineParagraph(block: PartialBlock) {
  return (block.type ?? "paragraph") === "paragraph" && Array.isArray(block.content) && !block.children?.length;
}

function hasText(block: { content?: unknown }) {
  return Array.isArray(block.content) && block.content.length > 0;
}

// Set here because BlockNote only assigns ids once the outer transaction is dispatched.
function newBlockId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Splits the block at the cursor like Enter does, keeping its type and props, and returns the
 * two halves. Children stay with the second half, as with ProseMirror's own split.
 */
function splitAtCursor(editor: BlockNoteEditor) {
  editor.transact((tr) => {
    if (!tr.selection.empty) tr.deleteSelection();
    const $pos = tr.selection.$from;
    const content = $pos.parent;
    const container = $pos.node($pos.depth - 1);
    tr.split($pos.pos, 2, [
      { type: container.type, attrs: { ...container.attrs, id: newBlockId() } },
      { type: content.type, attrs: content.attrs },
    ]);
    tr.setSelection(TextSelection.create(tr.doc, $pos.pos));
  });
  const head = editor.getTextCursorPosition().block;
  const tail = editor.getTextCursorPosition().nextBlock!;
  return { head, tail };
}

/**
 * Inserts parsed blocks at the cursor as one undo step (§13). A single paragraph goes in inline.
 * Otherwise the block at the cursor is split: a leading paragraph joins the text before the
 * cursor, and the text after it joins the last pasted block when that's a paragraph, or else
 * stays a block of the cursor block's type and props. The cursor ends after the pasted content.
 * An empty paragraph at the cursor is replaced outright. Returns the blocks inserted as blocks (an
 * inline paste returns none).
 */
export function insertBlocks(editor: BlockNoteEditor, blocks: PartialBlock[]): Block[] {
  if (!blocks.length) return [];
  return editor.transact(() => {
    const cursor = editor.getTextCursorPosition().block;
    if (isEmptyParagraph(cursor) && editor.transact((tr) => tr.selection.empty)) {
      const { insertedBlocks } = editor.replaceBlocks([cursor], blocks);
      editor.setTextCursorPosition(insertedBlocks[insertedBlocks.length - 1], "end");
      return insertedBlocks as Block[];
    }
    const inline = Array.isArray(cursor.content);
    if (inline && blocks.length === 1 && isInlineParagraph(blocks[0])) {
      editor.insertInlineContent(blocks[0].content as never);
      return [];
    }
    if (!inline) {
      const inserted = editor.insertBlocks(blocks, cursor, "after");
      editor.setTextCursorPosition(inserted[inserted.length - 1], "end");
      return inserted as Block[];
    }

    const { head, tail } = splitAtCursor(editor);
    let rest = blocks;
    if (isInlineParagraph(blocks[0])) {
      editor.setTextCursorPosition(head, "end");
      editor.insertInlineContent(blocks[0].content as never);
      rest = blocks.slice(1);
    }
    const anchor = editor.getBlock(head.id)!;
    const inserted = editor.insertBlocks(rest, anchor, "after");
    if (!hasText(anchor) && !anchor.children.length) editor.removeBlocks([anchor]);

    const last = inserted[inserted.length - 1];
    const after = editor.getBlock(tail.id)!;
    editor.setTextCursorPosition(last, "end");
    if (!hasText(after) && !after.children.length) {
      editor.removeBlocks([after]);
    } else if (last.type === "paragraph" && Array.isArray(last.content) && hasText(after)) {
      const caret = editor.transact((tr) => tr.selection.from);
      editor.updateBlock(last, {
        content: [...(last.content as never[]), ...(after.content as never[])],
        children: [...last.children, ...after.children] as never,
      });
      editor.removeBlocks([after]);
      editor.transact((tr) => tr.setSelection(TextSelection.create(tr.doc, caret)));
    }
    return inserted as Block[];
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches BlockNote's own option type
type PasteHandler = NonNullable<BlockNoteEditorOptions<any, any, any>["pasteHandler"]>;

/**
 * External `text/html` goes through the engine. BlockNote's own clipboard (`blocknote/html`),
 * VS Code snippets, plain text, files, and pastes into code blocks keep the default handling.
 */
export function createPasteHandler(
  getOptions: () => HtmlImportOptions,
  sanitize: (blocks: PartialBlock[]) => PartialBlock[],
  onImport: (result: HtmlImport, html: string, inserted: Block[]) => void,
): PasteHandler {
  return ({ event, editor, defaultPasteHandler }) => {
    const data = event.clipboardData;
    const types = data ? Array.from(data.types) : [];
    if (!data || types.includes("blocknote/html") || types.includes("vscode-editor-data")) return defaultPasteHandler();
    let html = types.includes("text/html") ? data.getData("text/html") : "";
    if (!html) {
      // A provider URL copied from the address bar arrives as plain text; it goes in as a link first.
      const url = types.includes("text/plain") ? data.getData("text/plain").trim() : "";
      const embeds = "embed" in editor.schema.blockSchema;
      if (!embeds || !/^https?:\/\/\S+$/.test(url) || !embedForUrl(url, embedRegistryOf(editor))) return defaultPasteHandler();
      html = `<p><a href="${escapeAttr(url)}">${escapeText(url)}</a></p>`;
    }
    const inCode = editor.transact((tr) => Boolean(tr.selection.$from.parent.type.spec.code));
    if (inCode) return defaultPasteHandler();
    const result = importHTML(html, getOptions(), sanitize);
    if (!result.blocks.length) return defaultPasteHandler({ prioritizeMarkdownOverHTML: false });
    const target = editor as unknown as BlockNoteEditor;
    const inserted = insertBlocks(target, result.blocks);
    const converted = convertBareEmbedLinks(target, [...inserted, target.getTextCursorPosition().block]);
    result.report.embeds.provider += converted.length;
    onImport(result, html, inserted);
    return true;
  };
}

/**
 * "Undo cleanup": reverts a paste and pastes the same HTML again without noise removal.
 * Only valid right after the paste, while it is still the last undo step.
 */
export function pasteWithoutCleanup(
  editor: BlockNoteEditor,
  html: string,
  options: HtmlImportOptions,
  sanitize: (blocks: PartialBlock[]) => PartialBlock[],
): HtmlImport & { inserted: Block[] } {
  const result = importHTML(html, { ...options, clean: { ...options.clean, noise: false } }, sanitize);
  editor.undo();
  return { ...result, inserted: insertBlocks(editor, result.blocks) };
}
