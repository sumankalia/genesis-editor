import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { canonicalizeCodeLanguage, storedCodeLanguage } from "../src/parser/code-languages";
import { parseHTML, toHTML } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import { resolveEditorSetup } from "../src/plugins/resolve";
import { schemaSupport, toEditorBlocks } from "../src/plugins/sanitize";

describe("code language aliases", () => {
  it("maps common aliases to canonical ids", () => {
    expect(canonicalizeCodeLanguage("ts")).toBe("typescript");
    expect(canonicalizeCodeLanguage("js")).toBe("javascript");
    expect(canonicalizeCodeLanguage("py")).toBe("python");
    expect(canonicalizeCodeLanguage("bash")).toBe("shellscript");
    expect(canonicalizeCodeLanguage("yml")).toBe("yaml");
    expect(canonicalizeCodeLanguage("TypeScript")).toBe("typescript");
  });

  it("treats plain text as no language", () => {
    expect(canonicalizeCodeLanguage("text")).toBeUndefined();
    expect(canonicalizeCodeLanguage("txt")).toBeUndefined();
    expect(canonicalizeCodeLanguage("")).toBeUndefined();
  });

  it("keeps unknown tokens for the parser and drops them in canonicalize", () => {
    expect(storedCodeLanguage("not-a-real-lang")).toBe("not-a-real-lang");
    expect(canonicalizeCodeLanguage("not-a-real-lang")).toBeUndefined();
    expect(storedCodeLanguage("has spaces")).toBeUndefined();
  });
});

describe("HTML round-trip", () => {
  it("writes and reads language-typescript", () => {
    const html = toHTML([{ type: "codeBlock", props: { language: "typescript" }, content: [{ type: "text", text: "const n = 1;", styles: {} }] }]);
    expect(html).toBe(`<pre><code class="language-typescript">const n = 1;</code></pre>`);
    expect(parseHTML(html, { dom: linkedomDom }).blocks[0]).toMatchObject({ type: "codeBlock", props: { language: "typescript" } });
  });

  it("canonicalizes language-ts and language-js on parse", () => {
    expect(parseHTML(`<pre><code class="language-ts">x</code></pre>`, { dom: linkedomDom }).blocks[0].props).toEqual({ language: "typescript" });
    expect(parseHTML(`<pre><code class="language-js">x</code></pre>`, { dom: linkedomDom }).blocks[0].props).toEqual({ language: "javascript" });
  });

  it("keeps an unknown language class on parse", () => {
    expect(parseHTML(`<pre><code class="language-not-a-real-lang">x</code></pre>`, { dom: linkedomDom }).blocks[0].props).toEqual({
      language: "not-a-real-lang",
    });
  });
});

describe("editor schema", () => {
  it("maps aliases so the language picker does not throw, and unknown langs become text", () => {
    const setup = resolveEditorSetup(undefined);
    const support = schemaSupport(setup.schema);
    const sanitize = (blocks: PartialBlock[]) => toEditorBlocks(blocks, support);
    const editor = BlockNoteEditor.create({
      schema: setup.schema,
      extensions: setup.extensions,
      initialContent: sanitize([
        { type: "codeBlock", props: { language: "ts" }, content: "const a = 1;" },
        { type: "codeBlock", props: { language: "not-a-real-lang" }, content: "x" },
      ]) as never,
    });
    editor.mount(document.createElement("div"));
    expect(editor.document[0].props.language).toBe("typescript");
    expect(editor.document[1].props.language).toBe("text");
    expect(() => editor.getTextCursorPosition()).not.toThrow();
  });
});
