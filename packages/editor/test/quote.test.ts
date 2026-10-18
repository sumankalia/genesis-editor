import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { parseHTML, toHTML, type HtmlBlock } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import { metaFromProps } from "../src/parser/meta";
import { resolveEditorSetup } from "../src/plugins/resolve";
import { schemaSupport, toEditorBlocks } from "../src/plugins/sanitize";

const parse = (html: string) => parseHTML(html, { dom: linkedomDom }).blocks;
const text = (block: HtmlBlock) => ((block.content as { text: string }[] | undefined) ?? []).map((t) => t.text).join("");
const CITE = { v: 1, source: { tag: "cite" } };

describe("quote parsing", () => {
  it("keeps every paragraph of a multi-paragraph quote", () => {
    const [quote] = parse("<blockquote><p>One</p><p>Two</p><p>Three</p></blockquote>");
    expect(quote.type).toBe("quote");
    expect(text(quote)).toBe("One");
    expect(quote.children?.map(text)).toEqual(["Two", "Three"]);
  });

  it.each([
    ["a direct <cite>", "<blockquote><p>Words.</p><cite>Ada Lovelace</cite></blockquote>", "Ada Lovelace"],
    ["a <footer>", "<blockquote><p>Words.</p><footer>— Ada Lovelace</footer></blockquote>", "— Ada Lovelace"],
    ["a <p> holding only a <cite>", "<blockquote><p>Words.</p><p>— <cite>Ada Lovelace</cite></p></blockquote>", "Ada Lovelace"],
    ["a figure caption", "<figure><blockquote><p>Words.</p></blockquote><figcaption>Ada Lovelace</figcaption></figure>", "Ada Lovelace"],
  ])("reads the attribution from %s", (_name, html, attribution) => {
    const blocks = parse(html);
    expect(blocks).toHaveLength(1);
    const [quote] = blocks;
    expect(text(quote)).toBe("Words.");
    expect(quote.children).toEqual([{ type: "paragraph", content: [{ type: "text", text: attribution, styles: {} }], meta: CITE }]);
  });

  it("leaves an inline <cite> (a title in running text) alone", () => {
    const [quote] = parse("<blockquote><p>As <cite>Hamlet</cite> says.</p></blockquote>");
    expect(quote.children).toBeUndefined();
    expect(quote.content).toContainEqual({ type: "text", text: "Hamlet", styles: { italic: true } });
  });

  it("keeps the cite URL", () => {
    const [quote] = parse('<blockquote cite="https://example.com/source?utm_source=x"><p>Q</p></blockquote>');
    expect(quote.props).toEqual({ cite: "https://example.com/source" });
    expect(parse('<blockquote cite="javascript:alert(1)"><p>Q</p></blockquote>')[0].props).toBeUndefined();
  });
});

describe("quote serialization", () => {
  const html = '<blockquote cite="https://example.com/s"><p>One</p><p>Two</p><cite>— <em>Ada</em></cite></blockquote>';

  it("writes children and the attribution inside the quote, and round-trips", () => {
    const blocks = parse(html);
    expect(toHTML(blocks)).toBe(html);
    expect(parse(toHTML(blocks))).toEqual(blocks);
  });

  it("loads into the editor and comes back unchanged", () => {
    const setup = resolveEditorSetup(undefined);
    const blocks = parse(html);
    const editor = BlockNoteEditor.create({ schema: setup.schema, initialContent: toEditorBlocks(blocks, schemaSupport(setup.schema)) as never });
    const [quote] = metaFromProps(editor.document) as unknown as HtmlBlock[];
    expect(quote.props).toMatchObject({ cite: "https://example.com/s" });
    expect(quote.children?.map((c) => [c.type, c.meta])).toEqual([["paragraph", undefined], ["paragraph", CITE]]);
    expect(toHTML(metaFromProps(editor.document) as unknown as HtmlBlock[])).toBe(html);
  });

  it("downgrades to paragraphs with the quote tool off", () => {
    const blocks = parseHTML(html, { dom: linkedomDom, tools: ["bold"] }).blocks;
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[0].props).toBeUndefined();
  });
});
