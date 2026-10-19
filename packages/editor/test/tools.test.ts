import { BlockNoteEditor, createBlockSpec, getDefaultSlashMenuItems } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { acceptsFile } from "../src/plugins/files";
import { BUILT_IN_TOOLS, DEFAULT_TOOLBAR } from "../src/plugins/built-in";
import { mergeSlashItems, resolveEditorSetup, resolveToolbar, setupSignature } from "../src/plugins/resolve";
import { sanitizeBlocks, schemaSupport } from "../src/plugins/sanitize";
import { definePlugin, type AnyEditor, type GenesisPlugin } from "../src/plugins/types";

const callout = definePlugin({
  name: "callout",
  blocks: {
    callout: createBlockSpec(
      { type: "callout", propSchema: {}, content: "inline" },
      {
        render: () => {
          const dom = document.createElement("div");
          return { dom, contentDOM: dom };
        },
      },
    )(),
  },
  slashItems: [{ key: "callout", title: "Callout", group: "Basic blocks", block: { type: "callout" } }],
  toolbarItems: { calloutButton: () => null },
  markdownShortcuts: [{ find: /^!>\s$/, block: { type: "callout" } }],
});

function editorFor(tools?: Parameters<typeof resolveEditorSetup>[0], plugins: GenesisPlugin[] = []) {
  const setup = resolveEditorSetup(tools, plugins);
  const editor = BlockNoteEditor.create({ schema: setup.schema, extensions: setup.extensions });
  return { setup, editor };
}

const slashKeys = (editor: AnyEditor) => getDefaultSlashMenuItems(editor).map((item) => item.key);

describe("resolveEditorSetup", () => {
  it("enables every built-in tool by default", () => {
    const { setup, editor } = editorFor();
    expect([...setup.tools]).toEqual([...BUILT_IN_TOOLS]);
    expect(Object.keys(editor.schema.blockSchema)).toEqual(
      expect.arrayContaining(["paragraph", "heading", "image", "table", "columnList", "column", "codeBlock", "checkListItem"]),
    );
    expect(Object.keys(editor.schema.styleSchema)).toEqual(
      expect.arrayContaining(["bold", "italic", "underline", "strike", "code", "textColor", "backgroundColor"]),
    );
    expect("link" in editor.schema.inlineContentSchema).toBe(true);
    expect(setup.defaultToolbar).toEqual([...DEFAULT_TOOLBAR]);
  });

  it("keeps only the listed tools, plus paragraphs", () => {
    const { setup, editor } = editorFor(["heading", "image", "bold"]);
    expect(Object.keys(editor.schema.blockSchema).sort()).toEqual(["heading", "image", "paragraph"]);
    expect(Object.keys(editor.schema.styleSchema)).toEqual(["bold"]);
    expect("link" in editor.schema.inlineContentSchema).toBe(false);
    expect(setup.defaultToolbar).not.toContain("italic");
    expect(setup.defaultToolbar).not.toContain("link");
    const keys = slashKeys(editor);
    expect(keys).toContain("heading");
    expect(keys).toContain("image");
    expect(keys).not.toContain("bullet_list");
    expect(keys).not.toContain("code_block");
    expect(keys).not.toContain("table");
  });

  it("accepts the object form with heading levels", () => {
    const { editor } = editorFor({ heading: { levels: [1, 2] }, quote: true, divider: false });
    expect(Object.keys(editor.schema.blockSchema).sort()).toEqual(["heading", "paragraph", "quote"]);
    const keys = slashKeys(editor);
    expect(keys).toEqual(expect.arrayContaining(["heading", "heading_2", "quote"]));
    expect(keys).not.toContain("heading_3");
  });

  it("adds plugin blocks, slash items, and toolbar items, and respects the tool selection", () => {
    const withPlugin = editorFor(undefined, [callout]);
    expect("callout" in withPlugin.editor.schema.blockSchema).toBe(true);
    expect(withPlugin.setup.defaultToolbar.at(-1)).toBe("calloutButton");
    const items = mergeSlashItems(withPlugin.editor, getDefaultSlashMenuItems(withPlugin.editor), withPlugin.setup.plugins);
    const titles = items.map((item) => item.title);
    expect(titles).toContain("Callout");
    // Merged into its group, not appended after other groups.
    const calloutIndex = titles.indexOf("Callout");
    expect(items[calloutIndex - 1].group).toBe("Basic blocks");

    const deselected = editorFor(["heading"], [callout]);
    expect("callout" in deselected.editor.schema.blockSchema).toBe(false);
    expect(deselected.setup.toolbarItems.has("calloutButton")).toBe(false);
  });

  it("lets a plugin replace a built-in tool of the same name", () => {
    const quote = definePlugin({ name: "quote", blocks: {} });
    const { editor } = editorFor(undefined, [quote]);
    expect("quote" in editor.schema.blockSchema).toBe(false);
  });

  it("rejects duplicate and reserved plugin names", () => {
    expect(() => resolveEditorSetup(undefined, [callout, callout])).toThrow(/two plugins/);
    expect(() => resolveEditorSetup(undefined, [definePlugin({ name: "core" })])).toThrow(/reserved/);
    expect(() => definePlugin({ name: "" })).toThrow(/name/);
  });

  it("changes signature only when tools or plugin names change", () => {
    expect(setupSignature(["heading"], [callout])).toBe(setupSignature(["heading"], [{ ...callout }]));
    expect(setupSignature(["heading"], [])).not.toBe(setupSignature(["heading", "image"], []));
  });
});

describe("resolveToolbar", () => {
  const setup = resolveEditorSetup(undefined, [callout]);

  it("defaults to the built-in order followed by plugin items, floating", () => {
    expect(resolveToolbar(setup, undefined)).toEqual({ placement: "floating", items: setup.defaultToolbar });
  });

  it("uses the given order and drops unknown or disabled items", () => {
    expect(resolveToolbar(setup, ["link", "bold", "nope", "calloutButton"]).items).toEqual([
      "link",
      "bold",
      "calloutButton",
    ]);
    const reduced = resolveEditorSetup(["bold"]);
    expect(resolveToolbar(reduced, ["bold", "italic"]).items).toEqual(["bold"]);
  });

  it("supports a fixed placement and turning the toolbar off", () => {
    expect(resolveToolbar(setup, { items: ["bold"], placement: "fixed" })).toEqual({ placement: "fixed", items: ["bold"] });
    expect(resolveToolbar(setup, false).placement).toBe("none");
  });
});

describe("unsupported content", () => {
  const { editor } = editorFor({ heading: { levels: [1, 2] }, bold: true });
  const support = schemaSupport(editor.schema);

  it("degrades blocks, styles, links, and heading levels when loading", () => {
    const blocks = sanitizeBlocks(
      [
        { type: "heading", props: { level: 3 }, content: "Deep" },
        { type: "quote", content: [{ type: "text", text: "Q", styles: { bold: true, italic: true } }] },
        { type: "paragraph", content: [{ type: "link", href: "https://x.dev", content: "site" }] },
        { type: "image", props: { url: "https://x.dev/a.png", caption: "A picture" } },
        { type: "divider" },
        { type: "table", content: { type: "tableContent", rows: [{ cells: ["a", "b"] }] } as never },
        { type: "bulletListItem", content: "Item", children: [{ type: "paragraph", content: "Child" }] },
      ],
      support,
    );
    expect(blocks).toEqual([
      { type: "heading", props: { level: 2 }, content: "Deep", children: undefined },
      { type: "paragraph", content: [{ type: "text", text: "Q", styles: { bold: true } }], children: undefined },
      { type: "paragraph", content: [{ type: "text", text: "site", styles: {} }], children: undefined },
      { type: "paragraph", content: "A picture", children: undefined },
      { type: "paragraph", content: "a | b" },
      {
        type: "paragraph",
        content: "Item",
        children: [{ type: "paragraph", content: "Child", children: undefined }],
      },
    ]);
    expect(() => editor.replaceBlocks(editor.document, blocks)).not.toThrow();
  });

  it("parses pasted HTML for unsupported blocks and styles into paragraphs", () => {
    const parsed = editor.tryParseHTMLToBlocks(
      "<h3>Deep</h3><blockquote>Quoted</blockquote><ul><li>One</li></ul><p><em>Slanted</em> <strong>bold</strong> <a href='https://x.dev'>link</a></p>",
    );
    expect(parsed.map((block) => block.type)).not.toContain("quote");
    expect(parsed.map((block) => block.type)).not.toContain("bulletListItem");
    const text = JSON.stringify(parsed);
    expect(text).toContain("Quoted");
    expect(text).toContain("One");
    expect(text).not.toContain('"italic"');
    expect(text).toContain('"bold":true');
  });

  it("only accepts files that a block can hold", () => {
    const png = new File(["x"], "a.png", { type: "image/png" });
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    const imagesOnly = editorFor(["image"]).editor;
    expect(acceptsFile(imagesOnly, png)).toBe(true);
    expect(acceptsFile(imagesOnly, pdf)).toBe(false);
    expect(acceptsFile(editorFor(["heading"]).editor, png)).toBe(false);
    expect(acceptsFile(editorFor().editor, pdf)).toBe(true);
  });
});
