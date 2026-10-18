import type { BlockNoteEditor, BlockNoteEditorOptions, PartialBlock } from "@blocknote/core";

import { parseHTML } from "./parser/parse";
import { toHTML } from "./parser/serialize";
import type { FidelityReport, HtmlBlock, ParseMode } from "./parser/types";
import type { ToolSelection } from "./plugins/resolve";

export type HtmlImportOptions = {
  mode?: ParseMode;
  tools?: ToolSelection;
  baseUrl?: string;
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

export function exportHTML(editor: BlockNoteEditor): string {
  return toHTML(editor.document as unknown as HtmlBlock[]);
}

function isEmptyParagraph(block: { type: string; content?: unknown; children: unknown[] }) {
  return block.type === "paragraph" && Array.isArray(block.content) && !block.content.length && !block.children.length;
}

function isInlineParagraph(block: PartialBlock) {
  return (block.type ?? "paragraph") === "paragraph" && Array.isArray(block.content) && !block.children?.length;
}

/**
 * Inserts parsed blocks at the cursor as one undo step. A leading paragraph merges into the
 * current block when that block holds inline content; an empty paragraph is replaced outright.
 */
export function insertBlocks(editor: BlockNoteEditor, blocks: PartialBlock[]) {
  if (!blocks.length) return;
  editor.transact(() => {
    const cursor = editor.getTextCursorPosition().block;
    if (isEmptyParagraph(cursor)) {
      const { insertedBlocks } = editor.replaceBlocks([cursor], blocks);
      editor.setTextCursorPosition(insertedBlocks[insertedBlocks.length - 1], "end");
      return;
    }
    let rest = blocks;
    let anchor = cursor;
    if (isInlineParagraph(blocks[0]) && Array.isArray(cursor.content)) {
      editor.insertInlineContent(blocks[0].content as never);
      rest = blocks.slice(1);
      anchor = editor.getTextCursorPosition().block;
    }
    if (!rest.length) return;
    const inserted = editor.insertBlocks(rest, anchor, "after");
    editor.setTextCursorPosition(inserted[inserted.length - 1], "end");
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
  onImport: (result: HtmlImport) => void,
): PasteHandler {
  return ({ event, editor, defaultPasteHandler }) => {
    const data = event.clipboardData;
    const types = data ? Array.from(data.types) : [];
    if (!data || !types.includes("text/html") || types.includes("blocknote/html") || types.includes("vscode-editor-data")) {
      return defaultPasteHandler();
    }
    const inCode = editor.transact((tr) => Boolean(tr.selection.$from.parent.type.spec.code));
    if (inCode) return defaultPasteHandler();
    const result = importHTML(data.getData("text/html"), getOptions(), sanitize);
    if (!result.blocks.length) return defaultPasteHandler({ prioritizeMarkdownOverHTML: false });
    insertBlocks(editor as unknown as BlockNoteEditor, result.blocks);
    onImport(result);
    return true;
  };
}
