import { BlockNoteEditor } from "@blocknote/core";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Transaction } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { resolveEditorSetup } from "../src/plugins/resolve";
import type { AnyEditor } from "../src/plugins/types";

/**
 * What we rely on from BlockNote 0.56. Features (columns and their repair, styles, images) are built
 * on these. If a test here fails, a BlockNote change broke something we depend on: read
 * CONTRIBUTING.md before touching it.
 */

function editorFor() {
  const setup = resolveEditorSetup(undefined);
  return BlockNoteEditor.create({
    schema: setup.schema,
    extensions: setup.extensions,
  }) as unknown as AnyEditor;
}

const column = (text: string) => ({
  type: "column",
  props: { width: 50 },
  children: [{ type: "paragraph", content: text }],
});

describe("BlockNote version", () => {
  it("is the 0.56 line the editor is built on", () => {
    const require = createRequire(import.meta.url);
    let dir = dirname(require.resolve("@blocknote/core"));
    let version = "";
    for (let i = 0; i < 6 && !version; i++, dir = dirname(dir)) {
      const file = join(dir, "package.json");
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, "utf8"));
      if (pkg.name === "@blocknote/core") version = pkg.version;
    }
    expect(
      version.startsWith("0.56."),
      `@blocknote/core is ${version || "not found"}; the editor is built on 0.56`,
    ).toBe(true);
  });
});

describe("document structure we rely on", () => {
  it("nests blocks as blockContainer: content node first, children in a blockGroup second", () => {
    const editor = editorFor();
    editor.replaceBlocks(editor.document, [
      {
        type: "paragraph",
        content: "parent",
        children: [{ type: "paragraph", content: "child" }],
      },
      { type: "columnList", children: [column("a"), column("b")] },
    ] as never);

    const containers: {
      content: string;
      group: string | null;
      kids: string[];
    }[] = [];
    let root = "";
    let rootChild = "";
    (
      editor as unknown as { transact: (fn: (tr: Transaction) => void) => void }
    ).transact((tr) => {
      root = tr.doc.type.name;
      rootChild = tr.doc.firstChild?.type.name ?? "";
      tr.doc.descendants((node) => {
        if (node.type.name !== "blockContainer") return true;
        const group = node.childCount > 1 ? node.child(1) : null;
        const kids: string[] = [];
        group?.forEach((child) => kids.push(child.firstChild?.type.name ?? ""));
        containers.push({
          content: node.firstChild?.type.name ?? "",
          group: group?.type.name ?? null,
          kids,
        });
        return true;
      });
    });

    expect(root).toBe("doc");
    expect(rootChild).toBe("blockGroup");
    const parent = containers.find((c) => c.content === "paragraph" && c.group);
    expect(parent?.group).toBe("blockGroup");
    expect(parent?.kids).toEqual(["paragraph"]);
    const list = containers.find((c) => c.content === "columnList");
    expect(list?.group).toBe("blockGroup");
    expect(list?.kids).toEqual(["column", "column"]);
  });

  it("gives a block with no children no children group", () => {
    const editor = editorFor();
    editor.replaceBlocks(editor.document, [
      {
        type: "columnList",
        children: [{ type: "column", props: { width: 50 }, children: [] }],
      },
    ] as never);

    let emptyColumnChildCount = -1;
    (
      editor as unknown as { transact: (fn: (tr: Transaction) => void) => void }
    ).transact((tr) => {
      tr.doc.descendants((node) => {
        if (
          node.type.name === "blockContainer" &&
          node.firstChild?.type.name === "column"
        ) {
          emptyColumnChildCount = node.childCount;
        }
        return true;
      });
    });

    expect(emptyColumnChildCount).toBe(1);
  });
});
