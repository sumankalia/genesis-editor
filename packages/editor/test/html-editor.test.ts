import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { describe, expect, it, vi } from "vitest";

import { createPasteHandler, exportHTML, importHTML, insertBlocks } from "../src/html";
import { resolveEditorSetup } from "../src/plugins/resolve";
import { sanitizeBlocks, schemaSupport } from "../src/plugins/sanitize";
import type { ToolSelection } from "../src/plugins/resolve";

function mounted(tools?: ToolSelection, initialContent?: PartialBlock[]) {
  const setup = resolveEditorSetup(tools, []);
  const support = schemaSupport(setup.schema);
  const editor = BlockNoteEditor.create({
    schema: setup.schema,
    extensions: setup.extensions,
    initialContent: initialContent as never,
  }) as unknown as BlockNoteEditor;
  editor.mount(document.createElement("div"));
  const sanitize = (blocks: PartialBlock[]) => sanitizeBlocks(blocks, support) as PartialBlock[];
  return { editor, sanitize };
}

function clipboard(data: Record<string, string>) {
  return {
    clipboardData: { types: Object.keys(data), getData: (type: string) => data[type] ?? "" },
  } as unknown as ClipboardEvent;
}

const ARTICLE = `<h2>Title</h2><p>Some <strong>bold</strong> and <a href="https://example.com">a link</a>.</p><ul><li>One</li><li>Two</li></ul>`;

describe("HTML import and export", () => {
  it("loads parsed HTML and serializes it back to the same HTML", () => {
    const { editor, sanitize } = mounted();
    const { blocks, report } = importHTML(ARTICLE, {}, sanitize);
    editor.replaceBlocks(editor.document, blocks);
    expect(report.blocks).toBe(4);
    const html = exportHTML(editor);
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain('<a href="https://example.com">a link</a>');
    const again = importHTML(html, {}, sanitize);
    editor.replaceBlocks(editor.document, again.blocks);
    expect(exportHTML(editor)).toBe(html);
  });

  it("downgrades content for disabled tools", () => {
    const { editor, sanitize } = mounted(["bulletList"]);
    editor.replaceBlocks(editor.document, importHTML(ARTICLE, { tools: ["bulletList"] }, sanitize).blocks);
    expect(editor.document.map((b) => b.type)).toEqual(["paragraph", "paragraph", "bulletListItem", "bulletListItem"]);
    expect(exportHTML(editor)).not.toContain("<strong>");
  });

  it("resolves relative URLs against baseUrl", () => {
    const { sanitize } = mounted();
    const { blocks } = importHTML(`<p><a href="/docs">Docs</a></p>`, { baseUrl: "https://example.com/a/" }, sanitize);
    expect(JSON.stringify(blocks)).toContain("https://example.com/docs");
  });
});

describe("insertBlocks", () => {
  it("replaces an empty paragraph", () => {
    const { editor, sanitize } = mounted();
    insertBlocks(editor, importHTML(ARTICLE, {}, sanitize).blocks);
    expect(editor.document.map((b) => b.type)).toEqual(["heading", "paragraph", "bulletListItem", "bulletListItem"]);
  });

  it("merges a leading paragraph into the current one and adds the rest after it", () => {
    const { editor, sanitize } = mounted(undefined, [{ type: "paragraph", content: "Hello " }]);
    editor.setTextCursorPosition(editor.document[0], "end");
    insertBlocks(editor, importHTML(`<p>world</p><h3>Next</h3>`, {}, sanitize).blocks);
    const [first, second] = editor.document;
    expect(first.content).toEqual([{ type: "text", text: "Hello world", styles: {} }]);
    expect(second.type).toBe("heading");
    expect(editor.getTextCursorPosition().block.id).toBe(second.id);
  });

  it("is a single undo step", () => {
    const { editor, sanitize } = mounted(undefined, [{ type: "paragraph", content: "Keep" }]);
    editor.setTextCursorPosition(editor.document[0], "end");
    insertBlocks(editor, importHTML(ARTICLE, {}, sanitize).blocks);
    expect(editor.document.length).toBeGreaterThan(3);
    editor.undo();
    expect(editor.document.map((b) => b.content)).toEqual([[{ type: "text", text: "Keep", styles: {} }]]);
  });
});

describe("paste handler", () => {
  function setup(tools?: ToolSelection) {
    const { editor, sanitize } = mounted(tools);
    const onImport = vi.fn();
    const handler = createPasteHandler(() => ({ tools }), sanitize, onImport);
    const defaultPasteHandler = vi.fn(() => true);
    const paste = (data: Record<string, string>) =>
      handler({ event: clipboard(data), editor, defaultPasteHandler });
    return { editor, onImport, defaultPasteHandler, paste };
  }

  it("runs external HTML through the engine and reports it", () => {
    const { editor, onImport, defaultPasteHandler, paste } = setup();
    expect(paste({ "text/html": ARTICLE, "text/plain": "Title" })).toBe(true);
    expect(defaultPasteHandler).not.toHaveBeenCalled();
    expect(editor.document[0].type).toBe("heading");
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0].report.blocks).toBe(4);
  });

  it("strips unsafe markup from pasted HTML", () => {
    const { editor, paste } = setup();
    paste({ "text/html": `<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">x</a></p>` });
    const json = JSON.stringify(editor.document);
    expect(json).not.toMatch(/script|javascript|onclick/);
  });

  it("applies the editor's tools to pasted HTML", () => {
    const { editor, paste } = setup(["bold"]);
    paste({ "text/html": ARTICLE });
    expect(editor.document.some((b) => b.type === "heading" || b.type === "bulletListItem")).toBe(false);
  });

  it("leaves BlockNote's own clipboard, VS Code, and plain text to the default handler", () => {
    const { onImport, defaultPasteHandler, paste } = setup();
    paste({ "blocknote/html": "<p>x</p>", "text/html": "<p>x</p>" });
    paste({ "vscode-editor-data": "{}", "text/html": "<pre>x</pre>", "text/plain": "x" });
    paste({ "text/plain": "# Heading" });
    expect(defaultPasteHandler).toHaveBeenCalledTimes(3);
    expect(onImport).not.toHaveBeenCalled();
  });

  it("falls back to the default handler when the HTML has no content", () => {
    const { defaultPasteHandler, paste } = setup();
    paste({ "text/html": "<meta charset='utf-8'><span></span>", "text/plain": "" });
    expect(defaultPasteHandler).toHaveBeenCalledWith({ prioritizeMarkdownOverHTML: false });
  });
});
