import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { TextSelection } from "prosemirror-state";
import { describe, expect, it, vi } from "vitest";

import { createPasteHandler, exportHTML, importHTML, insertBlocks, pasteWithoutCleanup } from "../src/html";
import { resolveEditorSetup } from "../src/plugins/resolve";
import { schemaSupport, toEditorBlocks } from "../src/plugins/sanitize";
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
  const sanitize = (blocks: PartialBlock[]) => toEditorBlocks(blocks, support) as PartialBlock[];
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

describe("insertBlocks splits the block at the cursor (§13)", () => {
  function at(content: PartialBlock[], offset: number, to = offset) {
    const { editor, sanitize } = mounted(undefined, content);
    editor.setTextCursorPosition(editor.document[0], "start");
    editor.transact((tr) => {
      const start = tr.selection.from;
      tr.setSelection(TextSelection.create(tr.doc, start + offset, start + to));
    });
    const paste = (html: string) => insertBlocks(editor, importHTML(html, {}, sanitize).blocks);
    const shape = () =>
      editor.document.map((b) => [
        b.type,
        (b.content as { text: string }[]).map((c) => c.text).join(""),
        ...(b.children.length ? [b.children.length] : []),
      ]);
    const caret = () =>
      editor.transact((tr) => [editor.getTextCursorPosition().block.id, tr.selection.$from.parentOffset] as const);
    return { editor, paste, shape, caret };
  }

  it("keeps a single-paragraph paste inline", () => {
    const { paste, shape, caret, editor } = at([{ type: "paragraph", content: "abcd" }], 2);
    paste("<p>x</p>");
    expect(shape()).toEqual([["paragraph", "abxcd"]]);
    expect(caret()).toEqual([editor.document[0].id, 3]);
  });

  it("joins the text after the cursor to the last pasted paragraph", () => {
    const { paste, shape, caret, editor } = at([{ type: "paragraph", content: "abcd" }], 2);
    paste("<p>x</p><p>y</p>");
    expect(shape()).toEqual([["paragraph", "abx"], ["paragraph", "ycd"]]);
    expect(caret()).toEqual([editor.document[1].id, 1]);
  });

  it("keeps the text after the cursor as its own block after a non-paragraph", () => {
    const { paste, shape } = at([{ type: "paragraph", content: "abcd" }], 2);
    paste("<p>x</p><h3>y</h3>");
    expect(shape()).toEqual([["paragraph", "abx"], ["heading", "y"], ["paragraph", "cd"]]);
  });

  it("gives the tail the cursor block's type and props", () => {
    const { paste, shape, editor } = at([{ type: "heading", props: { level: 2 }, content: "Title" }], 2);
    paste("<h3>y</h3><ul><li>z</li></ul>");
    expect(shape()).toEqual([["heading", "Ti"], ["heading", "y"], ["bulletListItem", "z"], ["heading", "tle"]]);
    expect(editor.document[3].props).toMatchObject({ level: 2 });
    expect(new Set(editor.document.map((b) => b.id)).size).toBe(4);
  });

  it("drops the empty half when pasting at the start or end", () => {
    const start = at([{ type: "paragraph", content: "cd" }], 0);
    start.paste("<h3>y</h3><p>z</p>");
    expect(start.shape()).toEqual([["heading", "y"], ["paragraph", "zcd"]]);
    const end = at([{ type: "paragraph", content: "ab" }], 2);
    end.paste("<p>x</p><h3>y</h3>");
    expect(end.shape()).toEqual([["paragraph", "abx"], ["heading", "y"]]);
  });

  it("replaces a selection", () => {
    const { paste, shape } = at([{ type: "paragraph", content: "abcd" }], 1, 3);
    paste("<p>x</p><p>y</p>");
    expect(shape()).toEqual([["paragraph", "ax"], ["paragraph", "yd"]]);
  });

  it("moves the cursor block's children along with the text after the cursor", () => {
    const { paste, shape } = at(
      [{ type: "paragraph", content: "abcd", children: [{ type: "paragraph", content: "child" }] }],
      2,
    );
    paste("<p>x</p><p>y</p>");
    expect(shape()).toEqual([["paragraph", "abx"], ["paragraph", "ycd", 1]]);
  });

  it("is one undo step", () => {
    const { paste, shape, editor } = at([{ type: "paragraph", content: "abcd" }], 2);
    paste("<p>x</p><h3>y</h3>");
    editor.undo();
    expect(shape()).toEqual([["paragraph", "abcd"]]);
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

describe("Undo cleanup", () => {
  const filler = Array.from({ length: 6 }, (_, i) => `<p>Paragraph ${i + 1} has enough ordinary prose to count as real article content for the paste.</p>`).join("");
  const page = `<html><body><nav><a href="/">Home</a></nav><article>${filler}<div class="share social"><a href="/s">Share on X</a></div></article></body></html>`;

  it("re-pastes the same HTML without noise removal, replacing the cleaned paste", () => {
    const { editor, sanitize } = mounted(undefined, [{ type: "paragraph", content: "abcd" }]);
    editor.setTextCursorPosition(editor.document[0], "end");
    const onImport = vi.fn();
    const handler = createPasteHandler(() => ({}), sanitize, onImport);
    handler({ event: clipboard({ "text/html": page }), editor, defaultPasteHandler: () => true });
    const [cleaned, html] = onImport.mock.calls[0];
    expect(cleaned.report.cleanup.sections).toBe(2);
    expect(exportHTML(editor)).not.toMatch(/Home|Share on X/);

    const result = pasteWithoutCleanup(editor, html, {}, sanitize);
    expect(result.report.cleanup.skipped).toBe("off");
    const after = exportHTML(editor);
    expect(after).toMatch(/Home[\s\S]*Paragraph 6[\s\S]*Share on X/);
    expect(after.match(/Paragraph 1 /g)).toHaveLength(1);
    expect(after.startsWith("<p>abcd")).toBe(true);
    editor.undo();
    editor.undo();
    expect(exportHTML(editor)).toBe("<p>abcd</p>");
  });
});
