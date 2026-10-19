import { describe, expect, it } from "vitest";
import { decodeEscapedHTML, parseHTML } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";

const parse = (html: string, options = {}) => parseHTML(html, { dom: linkedomDom, ...options });
const t = (text: string, styles = {}) => ({ type: "text", text, styles });

const ARTICLE = [
  "<figure>\n  <img src=https://img.example/a.jpg alt=\"A garden\" />\n  <figcaption><em>The garden</em></figcaption>\n</figure>",
  '<h2 class="article-sub-heading" style="font-size:1.30rem;">Planting</h2>',
  "<p>First&nbsp; line.</p>\n<p>Second line.</p>",
  "<pre><code>const a = 1;\n  b();</code></pre>",
].join("\n");
const escapedInside = JSON.stringify(ARTICLE).slice(1, -1);

describe("JSON-encoded HTML", () => {
  const expected = parse(ARTICLE).blocks;

  it("parses the same as the HTML it encodes: string inside, quoted string, and JSON holding HTML", () => {
    for (const input of [escapedInside, JSON.stringify(ARTICLE), JSON.stringify([{ HTML: ARTICLE, _id: "x1" }], null, 2)]) {
      const { blocks, report } = parse(input);
      expect(blocks).toEqual(expected);
      expect(report.warnings).toContain("The input was JSON-encoded HTML; it was decoded before parsing.");
    }
  });

  it("keeps the code block's newlines, and shows no escapes as text", () => {
    const { blocks } = parse(escapedInside);
    expect(blocks.find((b) => b.type === "codeBlock")?.content).toEqual([t("const a = 1;\n  b();")]);
    expect(JSON.stringify(blocks)).not.toMatch(/\\\\[ntr"]/);
    expect(blocks[0].props?.alt).toBe("A garden");
    expect(blocks.find((b) => b.type === "heading")?.content).toEqual([t("Planting", { fontSize: "20px" })]);
  });

  it("decodes escaped slashes and unicode-escaped tags, and HTML encoded twice", () => {
    expect(decodeEscapedHTML("<p>a<\\/p>")).toBe("<p>a</p>");
    expect(decodeEscapedHTML("\\u003cp\\u003ea\\u003c/p\\u003e")).toBe("<p>a</p>");
    expect(decodeEscapedHTML(JSON.stringify(JSON.stringify("<p>a</p>\n<p>b</p>")))).toBe("<p>a</p>\n<p>b</p>");
    expect(decodeEscapedHTML("<p>a</p>\\n<p>b</p>\\n<p>c</p>")).toBe("<p>a</p>\n<p>b</p>\n<p>c</p>");
  });

  it("leaves ordinary HTML alone, including HTML that mentions escapes", () => {
    const untouched = [
      ARTICLE,
      "<p>Use <code>\\n</code> for a new line and <code>\\t</code> for a tab.</p>",
      "<pre>printf('a\\nb');\n</pre>",
      "<pre><code>line one\\n</code></pre>\\n<p>x</p>",
      "<p>\\n</p><p>\\n</p>",
      "<p>She said \\\"hi\\\" twice.</p>",
      "<p>Write <code>&lt;a href=\\\"x\\\"&gt;</code> or <code>&lt;\\/a&gt;</code>.</p>",
      '<p class="x">a</p>\\n<p>b</p>\\n',
      "Plain text with \\n in it",
      '"Quoted" text <b>bold</b>',
      "[1] <a href=/x>note</a>",
      '{"title": "no html here"}',
    ];
    for (const html of untouched) expect(decodeEscapedHTML(html), html).toBeNull();
    expect(parse("<p>Use <code>\\n</code> here.</p>").blocks[0].content).toEqual([t("Use "), t("\\n", { code: true }), t(" here.")]);
  });

  it("keeps real newlines in code blocks", () => {
    const { blocks, report } = parse("<pre><code>a\n  b\n</code></pre><p>x</p>");
    expect(blocks[0].content).toEqual([t("a\n  b")]);
    expect(report.warnings).toEqual([]);
  });

  it("can be turned off", () => {
    const { blocks, report } = parse("<p>a</p>\\n<p>b</p>\\n<p>c</p>", { decodeEscaped: false });
    expect(blocks.some((b) => JSON.stringify(b.content).includes("\\\\n"))).toBe(true);
    expect(report.warnings).toEqual([]);
  });
});
