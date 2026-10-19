import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { describe, expect, it, vi } from "vitest";

import { createPasteHandler, exportHTML, importHTML } from "../src/html";
import { hasInlineImage, swapInlineImageUrl } from "../src/plugins/inline-image";
import { resolveEditorSetup, type ToolSelection } from "../src/plugins/resolve";
import { schemaSupport, toEditorBlocks } from "../src/plugins/sanitize";
import { BUILT_IN_TOOLS } from "../src/plugins/tool-names";
import type { AnyEditor } from "../src/plugins/types";

const ORIGIN = "https://media.example";
const clipboardHtml = readFileSync(join(__dirname, "fixtures/devto-clipboard.html"), "utf8").replaceAll("{{ORIGIN}}", ORIGIN);

function mounted(tools?: ToolSelection) {
  const setup = resolveEditorSetup(tools, []);
  const support = schemaSupport(setup.schema);
  const editor = BlockNoteEditor.create({ schema: setup.schema, extensions: setup.extensions }) as unknown as BlockNoteEditor;
  editor.mount(document.createElement("div"));
  const sanitize = (blocks: PartialBlock[]) => toEditorBlocks(blocks, support) as PartialBlock[];
  return { editor, sanitize };
}

type Cell = { content: { type: string; props?: Record<string, unknown> }[] };
const cellsOf = (editor: BlockNoteEditor) => {
  const table = editor.document.find((b) => b.type === "table");
  return ((table?.content as unknown as { rows: { cells: Cell[] }[] } | undefined)?.rows ?? []).flatMap((row) => row.cells);
};
const imagesIn = (editor: BlockNoteEditor) => cellsOf(editor).flatMap((cell) => cell.content.filter((n) => n.type === "inlineImage"));

function paste(editor: BlockNoteEditor, sanitize: (b: PartialBlock[]) => PartialBlock[], data: Record<string, string>, tools?: ToolSelection) {
  const onImport = vi.fn();
  const handler = createPasteHandler(() => ({ tools }), sanitize, onImport);
  const event = { clipboardData: { types: Object.keys(data), getData: (type: string) => data[type] ?? "" } } as unknown as ClipboardEvent;
  const handled = handler({ event, editor, defaultPasteHandler: () => false } as never);
  return { handled, onImport };
}

describe("pasting browser-copied HTML with images in table cells", () => {
  it("keeps every image in its cell", () => {
    const { editor, sanitize } = mounted();
    const { handled, onImport } = paste(editor, sanitize, { "text/html": clipboardHtml, "text/plain": "Last month I spoke…" });
    expect(handled).toBe(true);
    expect(onImport).toHaveBeenCalledTimes(1);
    const images = imagesIn(editor);
    expect(images).toHaveLength(6);
    expect(images[1].props).toMatchObject({ url: `${ORIGIN}/examples/dunes.png`, alt: "A closer look", width: 799, height: 533 });
    expect(images[4].props).toMatchObject({ href: "https://example.com/talk" });
    expect(editor.document.map((b) => b.type)).toEqual(["paragraph", "table", "heading", "image", "paragraph"]);
  });

  it("exports <td><img> and loads it back the same", () => {
    const { editor, sanitize } = mounted();
    paste(editor, sanitize, { "text/html": clipboardHtml });
    const html = exportHTML(editor);
    expect(html.match(/<td><img [^>]*data-genesis-inline/g)).toHaveLength(5);
    expect(html).toContain('<td><a href="https://example.com/talk"><img');
    const other = mounted();
    other.editor.replaceBlocks(other.editor.document, importHTML(html, {}, other.sanitize).blocks);
    expect(exportHTML(other.editor)).toBe(html);
  });

  it("swaps a re-hosted URL into every copy of the image, outside the undo history", () => {
    const { editor, sanitize } = mounted();
    paste(editor, sanitize, { "text/html": clipboardHtml });
    const from = `${ORIGIN}/examples/lake.png`;
    expect(hasInlineImage(editor as unknown as AnyEditor, from)).toBe(true);
    expect(swapInlineImageUrl(editor as unknown as AnyEditor, from, "https://cdn.app/lake.png")).toBe(3);
    expect(hasInlineImage(editor as unknown as AnyEditor, from)).toBe(false);
    const swapped = imagesIn(editor).filter((n) => n.props?.url === "https://cdn.app/lake.png");
    expect(swapped.every((n) => n.props?.originalUrl === from && n.props?.hosted === true)).toBe(true);
    editor.undo();
    expect(imagesIn(editor)).toHaveLength(0);
  });

  it("without the image tool, cells keep a link to the image", () => {
    const tools = BUILT_IN_TOOLS.filter((t) => t !== "image");
    const { editor, sanitize } = mounted(tools);
    paste(editor, sanitize, { "text/html": clipboardHtml }, tools);
    expect(imagesIn(editor)).toHaveLength(0);
    expect(cellsOf(editor)[0].content[0]).toMatchObject({ type: "link", href: `${ORIGIN}/examples/lake.png` });
  });

  it("the sanitizer turns stray inline images into their alt text when the schema has none", () => {
    const { editor, sanitize } = mounted(BUILT_IN_TOOLS.filter((t) => t !== "image"));
    const blocks = sanitize([{ type: "paragraph", content: [{ type: "inlineImage", props: { url: "https://a.test/x.png", alt: "Logo" } }] } as never]);
    editor.replaceBlocks(editor.document, blocks);
    expect(editor.document[0].content).toEqual([{ type: "text", text: "Logo", styles: {} }]);
  });
});
