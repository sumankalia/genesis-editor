import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { exportHTML, importHTML, insertBlocks } from "../src/html";
import { migrateStoredDocument, STORAGE_VERSION } from "../src/lib/persistence";
import { parseHTML, stripMeta, toHTML, type HtmlBlock } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import { META_VERSION, metaFromProps, metaToProps, migrateMeta } from "../src/parser/meta";
import { resolveEditorSetup } from "../src/plugins/resolve";
import { schemaSupport, toEditorBlocks } from "../src/plugins/sanitize";
import type { ToolSelection } from "../src/plugins/resolve";

const parse = (html: string, options = {}) => parseHTML(html, { dom: linkedomDom, ...options }).blocks;

function mounted(initial?: unknown[], tools?: ToolSelection, meta = true) {
  const setup = resolveEditorSetup(tools, [], meta);
  const support = schemaSupport(setup.schema);
  const sanitize = (blocks: unknown[]) => toEditorBlocks(blocks as PartialBlock[], support) as PartialBlock[];
  const editor = BlockNoteEditor.create({
    schema: setup.schema,
    extensions: setup.extensions,
    initialContent: initial ? (sanitize(initial) as never) : undefined,
  }) as unknown as BlockNoteEditor;
  editor.mount(document.createElement("div"));
  const publicBlocks = () => metaFromProps(editor.document) as (HtmlBlock & { id: string })[];
  return { editor, sanitize, publicBlocks };
}

describe("migrateMeta", () => {
  it("reads objects and the editor's JSON strings, and fills in the version", () => {
    expect(migrateMeta({ attrs: { id: "a" } })).toEqual({ v: META_VERSION, attrs: { id: "a" } });
    expect(migrateMeta('{"v":1,"attrs":{"lang":"fr"}}')).toEqual({ v: 1, attrs: { lang: "fr" } });
  });

  it("treats empty or unreadable meta as none", () => {
    for (const raw of ["", "{", "[]", null, undefined, 3, { v: 1 }, { v: 1, attrs: {}, ext: {} }]) {
      expect(migrateMeta(raw)).toBeUndefined();
    }
  });

  it("keeps meta from a newer version untouched", () => {
    const future = { v: 9, shape: ["unknown"] };
    expect(migrateMeta(future)).toBe(future);
    expect(metaFromProps(metaToProps([{ type: "paragraph", meta: future }]))).toEqual([{ type: "paragraph", props: {}, meta: future }]);
  });
});

describe("public JSON ⇄ editor props", () => {
  const tree = [
    { type: "quote", meta: { v: 1, attrs: { id: "q" } }, children: [{ type: "paragraph", meta: { v: 1, source: { tag: "cite" } } }] },
    { type: "paragraph", props: { textColor: "red" } },
  ];

  it("moves top-level meta into the prop string and back, through children", () => {
    const props = metaToProps(tree);
    expect(props[0]).toEqual({ type: "quote", props: { meta: '{"v":1,"attrs":{"id":"q"}}' }, children: [{ type: "paragraph", props: { meta: '{"v":1,"source":{"tag":"cite"}}' } }] });
    expect(props[1]).toEqual(tree[1]);
    // `props` stays (empty), as BlockNote blocks always have it.
    expect(metaFromProps(props)).toEqual([{ ...tree[0], props: {}, children: [{ ...tree[0].children![0], props: {} }] }, tree[1]]);
  });

  it("drops empty prop strings and reads legacy `props.meta`", () => {
    expect(metaFromProps([{ type: "paragraph", props: { meta: "", textColor: "red" } }])).toEqual([{ type: "paragraph", props: { textColor: "red" } }]);
    expect(metaFromProps([{ type: "paragraph", props: { meta: '{"attrs":{"lang":"de"}}' } }])).toEqual([{ type: "paragraph", props: {}, meta: { v: 1, attrs: { lang: "de" } } }]);
  });

  it("stripMeta removes meta everywhere", () => {
    expect(stripMeta(tree)).toEqual([{ type: "quote", children: [{ type: "paragraph" }] }, tree[1]]);
    expect(stripMeta(metaToProps(tree))).toEqual([{ type: "quote", props: {}, children: [{ type: "paragraph", props: {} }] }, tree[1]]);
  });
});

describe("parser meta", () => {
  it("keeps id, lang and dir from block elements", () => {
    expect(parse('<h2 id="intro" lang="fr">Bonjour</h2><p dir="rtl">שלום</p>').map((b) => b.meta)).toEqual([
      { v: 1, attrs: { id: "intro", lang: "fr" } },
      { v: 1, attrs: { dir: "rtl" } },
    ]);
  });

  it("drops dir=ltr (Google Docs writes it everywhere) and malformed values", () => {
    expect(parse('<p dir="ltr" lang="not a tag" id="has space">x</p>')[0].meta).toBeUndefined();
  });

  it("gives an element's id to its first block only", () => {
    const blocks = parse('<ul id="a" lang="de"><li>one</li><li>two</li></ul>');
    expect(blocks.map((b) => b.meta)).toEqual([{ v: 1, attrs: { id: "a", lang: "de" } }, { v: 1, attrs: { lang: "de" } }]);
  });

  it("reads list item attributes", () => {
    expect(parse('<ul><li id="one">One</li><li lang="es">Dos</li></ul>').map((b) => b.meta)).toEqual([
      { v: 1, attrs: { id: "one" } },
      { v: 1, attrs: { lang: "es" } },
    ]);
  });

  it("writes id, lang and dir back, and round-trips", () => {
    const html = '<h2 id="intro" lang="fr">Bonjour</h2>\n<ul><li id="one">One</li></ul>\n<figure id="fig"><img src="https://a.example/i.png" alt=""><figcaption>Cap</figcaption></figure>';
    const blocks = parse(html);
    expect(toHTML(blocks)).toBe(html);
    expect(parse(toHTML(blocks))).toEqual(blocks);
  });

  it("never writes engine meta other than id, lang and dir", () => {
    const html = toHTML([{ type: "paragraph", content: [], meta: { v: 1, attrs: { id: "x", class: "c" }, ext: { mine: 1 }, import: { at: "t", engine: "e" } } }]);
    expect(html).toBe('<p id="x"></p>');
  });

  it("stamps provenance when asked", () => {
    const [block] = parse("<p>x</p>", { trackProvenance: true, baseUrl: "https://src.example/" });
    expect(block.meta?.import).toMatchObject({ engine: "genesis-editor/parser", origin: "https://src.example/" });
    expect(Number.isNaN(Date.parse(block.meta!.import!.at))).toBe(false);
    expect(parse("<p>x</p>")[0].meta).toBeUndefined();
  });
});

describe("editor meta", () => {
  it("loads, keeps and serializes meta", () => {
    const { editor, publicBlocks } = mounted([{ type: "paragraph", content: "Hi", meta: { v: 1, attrs: { id: "p1", lang: "en" } } }]);
    expect(publicBlocks()[0].meta).toEqual({ v: 1, attrs: { id: "p1", lang: "en" } });
    expect(editor.document[0].props).toMatchObject({ meta: '{"v":1,"attrs":{"id":"p1","lang":"en"}}' });
    expect(exportHTML(editor)).toBe('<p id="p1" lang="en">Hi</p>');
  });

  it("gives the second half of a split the meta without its id", () => {
    const { editor, publicBlocks } = mounted([{ type: "paragraph", content: "Hello world", meta: { v: 1, attrs: { id: "p1", lang: "en" } } }]);
    editor.transact((tr) => {
      const container = tr.doc.firstChild!.firstChild!;
      const textStart = 3;
      // As BlockNote's Enter does: the new block gets default attrs.
      tr.split(textStart + 5, 2, [{ type: container.type, attrs: {} }, { type: container.firstChild!.type, attrs: {} }]);
    });
    expect(publicBlocks().map((b) => [(b.content as { text: string }[] | undefined)?.[0]?.text ?? "", b.meta])).toEqual([
      ["Hello", { v: 1, attrs: { id: "p1", lang: "en" } }],
      [" world", { v: 1, attrs: { lang: "en" } }],
    ]);
  });

  it("removes an inserted id that collides with an earlier one", () => {
    const { editor, sanitize, publicBlocks } = mounted([{ type: "paragraph", content: "One", meta: { v: 1, attrs: { id: "dup", lang: "en" } } }]);
    editor.insertBlocks(sanitize([{ type: "paragraph", content: "Two", meta: { v: 1, attrs: { id: "dup", lang: "fr" } } }]), editor.document[0], "after");
    expect(publicBlocks().map((b) => b.meta)).toEqual([{ v: 1, attrs: { id: "dup", lang: "en" } }, { v: 1, attrs: { lang: "fr" } }]);
  });

  it("keeps meta on pasted HTML, and the split tail of a paste loses the id", () => {
    const { editor, sanitize, publicBlocks } = mounted([{ type: "paragraph", content: "Before after", meta: { v: 1, attrs: { id: "host" } } }]);
    editor.setTextCursorPosition(editor.document[0], "start");
    const view = editor.prosemirrorView!;
    const pos = view.state.selection.from + "Before".length;
    view.dispatch(view.state.tr.setSelection((view.state.selection.constructor as typeof import("prosemirror-state").TextSelection).create(view.state.doc, pos)));
    insertBlocks(editor, importHTML('<h2 id="h">Title</h2><p lang="fr">Texte</p>', {}, sanitize).blocks);
    const blocks = publicBlocks();
    expect(blocks.map((b) => b.meta)).toEqual([{ v: 1, attrs: { id: "host" } }, { v: 1, attrs: { id: "h" } }, { v: 1, attrs: { lang: "fr" } }]);
  });

  it("keeps meta when a block is downgraded for a disabled tool", () => {
    const { publicBlocks } = mounted([{ type: "quote", content: "Q", meta: { v: 1, attrs: { lang: "it" } } }], ["bold"]);
    expect(publicBlocks()[0]).toMatchObject({ type: "paragraph", meta: { v: 1, attrs: { lang: "it" } } });
  });

  it("has no meta prop with policy off", () => {
    const { editor, publicBlocks } = mounted([{ type: "paragraph", content: "x", meta: { v: 1, attrs: { id: "a" } } }], undefined, false);
    expect(editor.document[0].props).not.toHaveProperty("meta");
    expect(publicBlocks()[0].meta).toBeUndefined();
  });

  it("adds meta to plugin blocks too", () => {
    const setup = resolveEditorSetup(undefined);
    for (const [type, config] of Object.entries(setup.schema.blockSchema as Record<string, { propSchema: object }>)) {
      expect(config.propSchema, type).toHaveProperty("meta");
    }
  });
});

describe("stored documents", () => {
  it("migrates unversioned saves (editor JSON with a meta prop) to version 2", () => {
    const legacy = { savedAt: 5, blocks: [{ id: "a", type: "paragraph", props: { meta: '{"attrs":{"id":"x"}}', textColor: "default" }, content: [], children: [] }] };
    expect(migrateStoredDocument(legacy)).toEqual({
      v: STORAGE_VERSION,
      savedAt: 5,
      blocks: [{ id: "a", type: "paragraph", props: { textColor: "default" }, content: [], children: [], meta: { v: 1, attrs: { id: "x" } } }],
    });
  });

  it("reads version 2 as is and ignores newer or empty saves", () => {
    const current = { v: 2, savedAt: 1, blocks: [{ type: "paragraph", meta: { v: 1, attrs: { lang: "fr" } } }] };
    expect(migrateStoredDocument(current)).toEqual(current);
    expect(migrateStoredDocument({ v: 3, savedAt: 1, blocks: [{}] })).toBeNull();
    expect(migrateStoredDocument({ blocks: [] })).toBeNull();
    expect(migrateStoredDocument("nope")).toBeNull();
  });
});
