import { BlockNoteEditor, getDefaultSlashMenuItems, type PartialBlock } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { parseHTML, toHTML, type HtmlBlock, type ParseOptions } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import { columnBlock, columnListBlock, layoutWidths, normalizeWidths, resizePair, splitWidths } from "../src/parser/columns";
import { exitColumnOnEnter, insertColumns } from "../src/plugins/columns";
import { mergeSlashItems, resolveEditorSetup } from "../src/plugins/resolve";
import { sanitizeBlocks, schemaSupport } from "../src/plugins/sanitize";
import type { AnyEditor } from "../src/plugins/types";

const parse = (html: string, tools?: ParseOptions["tools"]) => parseHTML(html, { dom: linkedomDom, tools });
const t = (text: string, styles = {}) => ({ type: "text" as const, text, styles });

const LAYOUT = `<h2>Summer drop</h2><p>A product image beside its copy.</p>
<table><tr>
  <td><img src="https://x.test/lake.png" alt="A mountain lake" width="640" height="427"></td>
  <td><h3>Mountain lake</h3><p>Each column holds the same blocks as the rest of the document.</p><p>Not a table of images.</p></td>
</tr></table>`;

describe("width helpers", () => {
  it("splits 2 and 3 columns so they sum to 100", () => {
    expect(splitWidths(2)).toEqual([50, 50]);
    expect(splitWidths(3)).toEqual([33, 33, 34]);
    expect(normalizeWidths([40, 60], 2)).toEqual([40, 60]);
    expect(resizePair(40, 60, 25)).toEqual([25, 75]);
    expect(resizePair(40, 60, 5)[0]).toBe(15);
  });

  it("uses 40/60 when one of two columns is a lone image", () => {
    const image = { type: "column", props: { width: 50 }, children: [{ type: "image", props: { url: "https://x.test/a.png" } }] };
    const text = { type: "column", props: { width: 50 }, children: [{ type: "heading", props: { level: 3 }, content: [t("Hi")] }] };
    expect(layoutWidths([image, text] as HtmlBlock[])).toEqual([40, 60]);
    expect(layoutWidths([text, image] as HtmlBlock[])).toEqual([60, 40]);
  });
});

describe("parse layout tables and floats", () => {
  it("turns an image|heading+body table into columns", () => {
    const { blocks } = parse(LAYOUT);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "columnList"]);
    const list = blocks[2];
    expect(list.children).toHaveLength(2);
    expect(list.children![0].type).toBe("column");
    expect(list.children![0].children?.map((c) => c.type)).toEqual(["image"]);
    expect(list.children![1].children?.map((c) => c.type)).toEqual(["heading", "paragraph", "paragraph"]);
    expect(list.children![0].props?.width).toBe(40);
    expect(list.children![1].props?.width).toBe(60);
  });

  it("keeps a one-row image plus short caption as a table", () => {
    const { blocks } = parse('<table><tr><td><img src="https://a.test/x.png" alt="X" width="320" height="200"></td><td>b</td></tr></table>');
    expect(blocks.map((b) => b.type)).toEqual(["table"]);
  });

  it("keeps an image grid as a table", () => {
    const { blocks } = parse('<table><tr><td><img src="https://a.test/a.png"></td><td><img src="https://a.test/b.png"></td></tr></table>');
    expect(blocks.map((b) => b.type)).toEqual(["table"]);
  });

  it("still unwraps presentation tables that are only short text", () => {
    expect(parse('<table role="presentation"><tr><td><p>a</p></td><td><p>b</p></td></tr></table>').blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
  });

  it("wraps a floated image and following copy", () => {
    const html = `<p>Lead</p><img src="https://x.test/lake.png" alt="Lake" style="float:left"><h3>Mountain lake</h3><p>Each column holds the same blocks as the rest of the document.</p>`;
    const { blocks } = parse(html);
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "columnList"]);
    const cols = blocks[1].children!;
    expect(cols[0].children?.map((c) => c.type)).toEqual(["image"]);
    expect(cols[1].children?.map((c) => c.type)).toEqual(["heading", "paragraph"]);
  });

  it("keeps blocks after a column section full-width", () => {
    const { blocks } = parse(`${LAYOUT}<p>After the section.</p><h2>Next chapter</h2>`);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "columnList", "paragraph", "heading"]);
    expect(blocks[3]).toMatchObject({ type: "paragraph", content: [t("After the section.")] });
  });

  it("does not pour later siblings into a float wrap", () => {
    const html = `<p>Lead</p><img src="https://x.test/lake.png" alt="Lake" style="float:left"><h3>Mountain lake</h3><p>Beside the image.</p><p>Full width after.</p><h2>Next</h2>`;
    const { blocks } = parse(html);
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "columnList", "paragraph", "heading"]);
    expect(blocks[2]).toMatchObject({ type: "paragraph", content: [t("Full width after.")] });
  });

  it("caps a float wrap so later paragraphs stay full-width", () => {
    const html = `<img src="https://x.test/lake.png" alt="Lake" style="float:left"><p>One.</p><p>Two.</p><p>Three full width.</p>`;
    const { blocks } = parse(html);
    expect(blocks.map((b) => b.type)).toEqual(["columnList", "paragraph"]);
    expect(blocks[0].children?.[1].children?.map((c) => c.type)).toEqual(["paragraph", "paragraph"]);
    expect(blocks[1]).toMatchObject({ type: "paragraph", content: [t("Three full width.")] });
  });

  it("flattens layout HTML when the columns tool is off", () => {
    const { blocks } = parse(LAYOUT, ["heading", "image", "table"]);
    expect(blocks.some((b) => b.type === "columnList")).toBe(false);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "image", "heading", "paragraph", "paragraph"]);
  });
});

describe("HTML export", () => {
  it("round-trips as an email-safe presentation table", () => {
    const { blocks } = parse(LAYOUT);
    const html = toHTML(blocks);
    expect(html).toContain('data-genesis-columns="2"');
    expect(html).toContain("role=\"presentation\"");
    expect(html).toContain("data-genesis-column-widths=");
    const again = parse(html).blocks;
    expect(again.map((b) => b.type)).toEqual(blocks.map((b) => b.type));
    expect(again[2].children?.map((c) => c.props?.width)).toEqual(blocks[2].children?.map((c) => c.props?.width));
    expect(toHTML(again)).toBe(html);
  });

  it("round-trips a column section of any blocks, then a full-width paragraph", () => {
    const blocks: HtmlBlock[] = [
      columnListBlock([
        columnBlock(50, [
          { type: "paragraph", content: [t("Left")] },
          { type: "bulletListItem", content: [t("Item")] },
        ]),
        columnBlock(50, [
          { type: "quote", content: [t("Quoted")] },
          { type: "codeBlock", content: [t("const n = 1;")] },
        ]),
      ]),
      { type: "paragraph", content: [t("After")] },
    ];
    const html = toHTML(blocks);
    expect(html).toMatch(/<\/table>\s*<p>After<\/p>/);
    const again = parse(html).blocks;
    expect(again.map((b) => b.type)).toEqual(["columnList", "paragraph"]);
    expect(again[0].children?.[0].children?.map((c) => c.type)).toEqual(["paragraph", "bulletListItem"]);
    expect(again[0].children?.[1].children?.map((c) => c.type)).toEqual(["quote", "codeBlock"]);
    expect(again[1]).toMatchObject({ type: "paragraph", content: [t("After")] });
  });
});

describe("editor", () => {
  function editorFor(tools?: Parameters<typeof resolveEditorSetup>[0]) {
    const setup = resolveEditorSetup(tools);
    const editor = BlockNoteEditor.create({ schema: setup.schema, extensions: setup.extensions });
    return { setup, editor: editor as unknown as AnyEditor };
  }

  it("registers columnList and column, and offers Columns in the slash menu", () => {
    const { editor, setup } = editorFor();
    expect("columnList" in editor.schema.blockSchema).toBe(true);
    expect("column" in editor.schema.blockSchema).toBe(true);
    const titles = mergeSlashItems(editor, getDefaultSlashMenuItems(editor), setup.plugins).map((item) => item.title);
    expect(titles).toContain("Columns");
    expect(titles).toContain("3 columns");
  });

  it("inserts two columns by default, three when asked, and not nested", () => {
    const { editor } = editorFor();
    insertColumns(editor, 2);
    expect(editor.document.some((b) => b.type === "columnList")).toBe(true);
    const list = editor.document.find((b) => b.type === "columnList")!;
    expect(list.children).toHaveLength(2);
    expect(list.children.every((c) => c.type === "column")).toBe(true);
    editor.setTextCursorPosition(list.children[0].children[0], "start");
    insertColumns(editor, 3);
    const lists = editor.document.filter((b) => b.type === "columnList");
    expect(lists).toHaveLength(2);
    expect(lists[1].children).toHaveLength(3);
    expect(lists[0].children.some((c) => c.type === "columnList")).toBe(false);
  });

  it("exits the last column on Enter even when the final paragraph is not empty", () => {
    const { editor } = editorFor();
    insertColumns(editor, 2);
    const list = editor.document.find((block) => block.type === "columnList")!;
    const lastParagraph = list.children![1].children![0];
    editor.setTextCursorPosition(lastParagraph, "end");
    editor.insertInlineContent("Tail");
    expect(exitColumnOnEnter(editor)).toBe(true);
    expect(editor.document.map((block) => block.type)).toEqual(["columnList", "paragraph"]);
    const cursor = editor.getTextCursorPosition().block;
    expect(editor.document.some((b) => b.id === cursor.id && b.type === "paragraph")).toBe(true);
  });

  it("reuses the existing full-width sibling when the last column block is empty", () => {
    const { editor } = editorFor();
    insertColumns(editor, 2);
    expect(editor.document.map((b) => b.type)).toEqual(["columnList", "paragraph"]);
    const list = editor.document.find((b) => b.type === "columnList")!;
    editor.setTextCursorPosition(list.children[1].children[0], "end");
    editor.insertInlineContent("Right column");
    expect(exitColumnOnEnter(editor)).toBe(true);
    editor.insertBlocks([{ type: "paragraph" }], list.children[1].children[0], "after");
    const empty = editor.getBlock(list.id)!.children[1].children[1];
    editor.setTextCursorPosition(empty, "start");
    expect(exitColumnOnEnter(editor)).toBe(true);
    expect(editor.document.map((b) => b.type)).toEqual(["columnList", "paragraph"]);
    const cursor = editor.getTextCursorPosition().block;
    expect(editor.document.some((b) => b.id === cursor.id && b.type === "paragraph")).toBe(true);
  });

  it("does not pull following blocks into the last column", () => {
    const { editor } = editorFor();
    editor.replaceBlocks(editor.document, [
      { type: "paragraph", content: "Before" },
      { type: "paragraph" },
      { type: "paragraph", content: "After" },
      { type: "heading", props: { level: 2 }, content: "Next chapter" },
    ] as never);
    editor.setTextCursorPosition(editor.document[1], "start");
    insertColumns(editor, 2);
    expect(editor.document.map((b) => b.type)).toEqual(["paragraph", "columnList", "paragraph", "heading"]);
    expect(JSON.stringify(editor.document[2])).toContain("After");
    expect(JSON.stringify(editor.document[1])).not.toContain("After");
    expect(JSON.stringify(editor.document[3])).toContain("Next chapter");
  });

  it("flattens columns when the tool is off", () => {
    const support = schemaSupport(editorFor(["heading", "image"]).editor.schema);
    const blocks = sanitizeBlocks(
      [
        {
          type: "columnList",
          children: [
            { type: "column", props: { width: 40 }, children: [{ type: "image", props: { url: "https://x.test/a.png" } }] },
            { type: "column", props: { width: 60 }, children: [{ type: "heading", props: { level: 3 }, content: "Hi" }] },
          ],
        },
      ] as unknown as PartialBlock[],
      support,
    );
    expect(blocks.map((b) => b.type)).toEqual(["image", "heading"]);
    const reduced = editorFor(["heading", "image"]);
    expect(() => reduced.editor.replaceBlocks(reduced.editor.document, blocks as never)).not.toThrow();
  });
});
