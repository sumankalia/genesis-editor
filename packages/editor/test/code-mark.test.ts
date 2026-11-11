import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { sanitizeBlocks, schemaSupport } from "../src/plugins/sanitize";

describe("code mark exclusivity", () => {
  it("sanitize strips marks that cannot sit next to `code`", () => {
    const editor = BlockNoteEditor.create();
    const support = schemaSupport(editor.schema as never);
    const [block] = sanitizeBlocks(
      [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              styles: { code: true, backgroundColor: "red", bold: true },
            },
          ],
        },
      ] as never,
      support,
    );
    expect(block.content).toEqual([
      { type: "text", text: "x", styles: { code: true } },
    ]);
  });

  it("inserting code with a background no longer throws", () => {
    const editor = BlockNoteEditor.create();
    const support = schemaSupport(editor.schema as never);
    const blocks = sanitizeBlocks(
      [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              styles: { code: true, backgroundColor: "red" },
            },
          ],
        },
      ] as never,
      support,
    );
    expect(() =>
      editor.replaceBlocks(editor.document, blocks as never),
    ).not.toThrow();
  });
});
