import { describe, expect, it } from "vitest";
import { parseHTML, type ParseOptions } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";

const parse = (html: string, options: ParseOptions = {}) => parseHTML(html, { dom: linkedomDom, ...options });
const blocks = (html: string, options?: ParseOptions) => parse(html, options).blocks;
const t = (text: string, styles = {}) => ({ type: "text", text, styles });

describe("headings (§6)", () => {
  it("maps h1–h6 directly and keeps several h1s", () => {
    expect(blocks("<h1>A</h1><h1>B</h1><h6>C</h6>").map((b) => b.props?.level)).toEqual([1, 1, 6]);
  });

  it("drops empty headings and counts them", () => {
    const r = parse("<h2> </h2><h2><br></h2><p>x</p>");
    expect(r.blocks).toHaveLength(1);
    expect(r.report.headings.dropped).toBe(2);
  });

  it("joins block children with a space and splits media out after the heading", () => {
    expect(blocks('<h2><div>One</div><div>Two</div><img src="https://x.com/a.png"></h2>')).toEqual([
      { type: "heading", props: { level: 2 }, content: [t("One Two")] },
      { type: "image", props: { url: "https://x.com/a.png" } },
    ]);
  });

  it("turns an image-only heading into an image", () => {
    expect(blocks('<h2><img src="https://x.com/a.png" alt="Logo"></h2>')).toEqual([{ type: "image", props: { url: "https://x.com/a.png", name: "Logo" } }]);
  });

  it("links the whole heading when a link wraps it and strips permalink anchors", () => {
    expect(blocks('<a href="https://x.com/"><h2>Linked</h2></a>')[0].content).toEqual([{ type: "link", href: "https://x.com/", content: [t("Linked")] }]);
    expect(blocks('<h2 id="s">Section <a class="anchor" href="#s">#</a></h2>')[0].content).toEqual([t("Section")]);
  });

  it("drops whole-heading bold but keeps partial bold", () => {
    expect(blocks("<h2><b>All bold</b></h2>")[0].content).toEqual([t("All bold")]);
    expect(blocks("<h2>Some <b>bold</b></h2>")[0].content).toEqual([t("Some "), t("bold", { bold: true })]);
  });

  it("makes a heading in a list item bold item text with what follows as children", () => {
    expect(blocks("<ul><li><h3>Item</h3><p>More</p></li></ul>")).toEqual([
      { type: "bulletListItem", content: [t("Item", { bold: true })], children: [{ type: "paragraph", content: [t("More")] }] },
    ]);
  });

  it("makes a heading in a table cell bold text", () => {
    const table = blocks("<table><tr><td><h3>H</h3></td><td>x</td></tr><tr><td>a</td><td>b</td></tr></table>")[0];
    expect((table.content as { rows: { cells: { content: unknown }[] }[] }).rows[0].cells[0].content).toEqual([t("H", { bold: true })]);
  });

  it("nests a heading inside a blockquote as a child of the quote", () => {
    expect(blocks("<blockquote><p>Q</p><h2>H</h2></blockquote>")).toEqual([
      { type: "quote", content: [t("Q")], children: [{ type: "heading", props: { level: 2 }, content: [t("H")] }] },
    ]);
  });

  it("turns details>summary>hN into a toggleable heading", () => {
    expect(blocks("<details><summary><h3>T</h3></summary><p>Body</p></details>")).toEqual([
      { type: "heading", props: { level: 3, isToggleable: true }, content: [t("T")], children: [{ type: "paragraph", content: [t("Body")] }] },
    ]);
  });

  it("reads hgroup, role=heading, Word and Docs heading classes", () => {
    expect(blocks("<hgroup><h1>Main</h1><p>Sub</p></hgroup>").map((b) => b.type)).toEqual(["heading", "paragraph"]);
    expect(blocks('<div role="heading" aria-level="3">R</div>')[0].props).toEqual({ level: 3 });
    expect(blocks('<p class="MsoHeading2">W</p>')[0].props).toEqual({ level: 2 });
    expect(blocks('<p class="title">Doc title</p>')[0]).toMatchObject({ type: "heading", props: { level: 1 } });
  });

  it("promotes only standalone, uniformly bold, large paragraphs, and never to h1", () => {
    const body = "<p>Body text that sets the dominant size for the document, long enough to count.</p>";
    expect(blocks(`<p style="font-size:32px"><b>Big</b></p>${body}`)[0]).toMatchObject({ type: "heading", props: { level: 2 } });
    expect(blocks(`<p style="font-size:20px"><b>Small</b></p>${body}`)[0]).toMatchObject({ type: "heading", props: { level: 4 } });
    expect(blocks(`<p style="font-size:32px"><b>Ends with a period.</b></p>${body}`)[0].type).toBe("paragraph");
    expect(blocks(`<p style="font-size:32px">Not bold</p>${body}`)[0].type).toBe("paragraph");
  });

  it("warns about long headings", () => {
    expect(parse(`<h2>${"x".repeat(301)}</h2>`).report.warnings.join()).toMatch(/longHeading/);
  });

  it("downgrades to a bold paragraph when headings are off, and clamps to allowed levels", () => {
    const off = parse("<h2>H</h2>", { tools: ["bold"] });
    expect(off.blocks).toEqual([{ type: "paragraph", content: [t("H", { bold: true })] }]);
    expect(off.report.downgrades).toEqual([{ from: "h2", to: "bold paragraph", count: 1 }]);
    expect(blocks("<h1>A</h1><h6>B</h6>", { tools: { heading: { levels: [2, 3] } } }).map((b) => b.props?.level)).toEqual([2, 3]);
  });
});
