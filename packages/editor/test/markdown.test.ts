import { describe, expect, it } from "vitest";

import { htmlIsMarkdownSource, looksLikeMarkdown, markdownToHTML, parseMarkdown } from "../src/parser/markdown";
import { linkedomDom } from "../src/parser/linkedom";
import { toHTML } from "../src/parser";

const parse = (md: string) => parseMarkdown(md, { dom: linkedomDom });

describe("looksLikeMarkdown", () => {
  it("detects headings, lists, quotes, fences, tables, and links", () => {
    expect(looksLikeMarkdown("# Heading")).toBe(true);
    expect(looksLikeMarkdown("## Sub\n\nA paragraph.")).toBe(true);
    expect(looksLikeMarkdown("- one\n- two")).toBe(true);
    expect(looksLikeMarkdown("1. first")).toBe(true);
    expect(looksLikeMarkdown("- [ ] todo")).toBe(true);
    expect(looksLikeMarkdown("> a quote")).toBe(true);
    expect(looksLikeMarkdown("```js\nconst x = 1;\n```")).toBe(true);
    expect(looksLikeMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(true);
    expect(looksLikeMarkdown("See [docs](https://example.com).")).toBe(true);
    expect(looksLikeMarkdown("![alt](https://example.com/a.png)")).toBe(true);
    expect(looksLikeMarkdown("---")).toBe(true);
  });

  it("leaves ordinary prose and a lone URL alone", () => {
    expect(looksLikeMarkdown("Hello world")).toBe(false);
    expect(looksLikeMarkdown("Just a sentence with *asterisks* around a word.")).toBe(false);
    expect(looksLikeMarkdown("https://example.com/path")).toBe(false);
    expect(looksLikeMarkdown("")).toBe(false);
  });
});

describe("htmlIsMarkdownSource", () => {
  it("treats a pre/div wrapper of the same Markdown as source", () => {
    const md = "# Heading\n\nA paragraph.";
    expect(htmlIsMarkdownSource(`<pre>${md}</pre>`, md)).toBe(true);
    expect(htmlIsMarkdownSource(`<div>${md.replace(/\n/g, "<br>")}</div>`, md)).toBe(true);
  });

  it("leaves rendered HTML on the HTML path", () => {
    expect(htmlIsMarkdownSource("<h2>Title</h2><p>Body</p>", "# Title\n\nBody")).toBe(false);
  });
});

describe("markdownToHTML", () => {
  it("emits semantic HTML for GFM", () => {
    const html = markdownToHTML("# Title\n\nA **bold** [link](https://example.com).\n\n- one\n- two");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toMatch(/<ul>[\s\S]*<li>one<\/li>/);
  });

  it("does not sanitize; the HTML engine does", () => {
    const html = markdownToHTML("[xss](javascript:alert(1))");
    expect(html).toMatch(/javascript:/i);
  });
});

describe("parseMarkdown", () => {
  it("goes through parseHTML so headings, lists, links, and code survive", () => {
    const { blocks, report } = parse(
      "# Title\n\nA **bold** [link](https://example.com).\n\n- one\n- two\n\n```js\nconst x = 1;\n```\n",
    );
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "bulletListItem", "bulletListItem", "codeBlock"]);
    expect(blocks[0].props).toMatchObject({ level: 1 });
    const paragraph = JSON.stringify(blocks[1]);
    expect(paragraph).toContain("bold");
    expect(paragraph).toContain("https://example.com");
    expect((blocks[4].content as { text: string }[])[0]?.text).toContain("const x = 1");
    expect(report.blocks).toBe(5);
    expect(toHTML(blocks)).toContain("<h1>Title</h1>");
  });

  it("sanitizes javascript: links", () => {
    const { blocks } = parse("[xss](javascript:alert(1))\n\n[ok](https://example.com)");
    const json = JSON.stringify(blocks);
    expect(json).not.toMatch(/javascript:/i);
    expect(json).toContain("https://example.com");
  });

  it("maps task lists and tables", () => {
    const { blocks } = parse("- [x] done\n- [ ] later\n\n| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(blocks[0].type).toBe("checkListItem");
    expect(blocks[0].props).toMatchObject({ checked: true });
    expect(blocks[1].type).toBe("checkListItem");
    expect(blocks.some((b) => b.type === "table")).toBe(true);
  });
});
