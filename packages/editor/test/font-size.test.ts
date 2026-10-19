import { describe, expect, it } from "vitest";
import { parseHTML, toHTML, type HtmlBlock, type HtmlInline, type HtmlText, type ParseOptions } from "../src/parser";
import { FONT_SIZES, TOOLBAR_FONT_SIZES, isFontSize, snapFontSize, stepFontSize } from "../src/parser/font-size";
import { linkedomDom } from "../src/parser/linkedom";

const parse = (html: string, options: ParseOptions = {}) => parseHTML(html, { dom: linkedomDom, ...options });
const texts = (block: HtmlBlock) =>
  (block.content as HtmlInline[]).flatMap((n) => (n.type === "link" ? n.content : [n])) as HtmlText[];
const sizes = (block: HtmlBlock) => texts(block).map((t) => [t.text, t.styles.fontSize]);
const BODY = "Body text that is long enough to be the dominant size of the source.";

describe("steps", () => {
  it("stores only steps other than 16", () => {
    expect(isFontSize("14px")).toBe(true);
    for (const value of ["16px", "15px", "14", "14.0px", "1.2em", 14]) expect(isFontSize(value)).toBe(false);
  });

  it("snaps to the nearest step, rounding ties up, and clamps to 6–72", () => {
    expect(FONT_SIZES[FONT_SIZES.length - 1]).toBe(72);
    expect([...TOOLBAR_FONT_SIZES]).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
    expect(snapFontSize(13)).toEqual({ size: "14px", clamped: false });
    expect(snapFontSize(15)).toEqual({ size: undefined, clamped: false });
    expect(snapFontSize(16.4)).toEqual({ size: undefined, clamped: false });
    expect(snapFontSize(19)).toEqual({ size: "20px", clamped: false });
    expect(snapFontSize(32)).toEqual({ size: "32px", clamped: false });
    expect(snapFontSize(3)).toEqual({ size: "6px", clamped: true });
    expect(snapFontSize(80)).toEqual({ size: "72px", clamped: true });
  });

  it("steps up and down, stopping at the ends", () => {
    expect(stepFontSize(undefined, 1)).toBe("18px");
    expect(stepFontSize(undefined, -1)).toBe("14px");
    expect(stepFontSize("18px", -1)).toBeUndefined();
    expect(stepFontSize("20px", 1)).toBe("24px");
    expect(stepFontSize("72px", 1)).toBe("72px");
    expect(stepFontSize("6px", -1)).toBe("6px");
  });
});

describe("paste mapping", () => {
  it("normalizes to the source's body size: an 11pt Google Doc pastes as Default", () => {
    const html = `<p><span style="font-size:11pt">${BODY}</span></p><p><span style="font-size:9pt">Small print</span> <span style="font-size:14pt">and big</span></p>`;
    const { blocks, report } = parse(html);
    expect(sizes(blocks[0])).toEqual([[BODY, undefined]]);
    expect(sizes(blocks[1])).toEqual([
      ["Small print", "14px"],
      [" ", undefined],
      ["and big", "20px"],
    ]);
    expect(report.fontSizes).toEqual({ sized: 2, clamped: 0 });
    expect(report.unsupportedStyles.find((s) => s.prop === "font-size")).toBeUndefined();
  });

  it("converts every unit", () => {
    const html = `<p>${BODY}</p><p><span style="font-size:12px">a</span><span style="font-size:0.5em">b</span><span style="font-size:125%">c</span><span style="font-size:x-small">d</span><span style="font-size:smaller">e</span><span style="font-size:0.375rem">f</span></p>`;
    expect(sizes(parse(html).blocks[1])).toEqual([
      ["a", "12px"],
      ["b", "8px"],
      ["c", "20px"],
      ["d", "10px"],
      ["e", "14px"],
      ["f", "6px"],
    ]);
  });

  it("clamps and reports sizes outside 6–72", () => {
    const { blocks, report } = parse(`<p>${BODY}</p><p><span style="font-size:48px">Huge</span> <span style="font-size:2px">tiny</span></p>`);
    expect(sizes(blocks[1])).toEqual([
      ["Huge", "48px"],
      [" ", undefined],
      ["tiny", "6px"],
    ]);
    expect(report.fontSizes.clamped).toBe(1);
  });

  it("keeps heading sizes and drops code sizes", () => {
    const html = `<p>${BODY}</p><h2><span style="font-size:10px">Title</span></h2><pre><code style="font-size:10px">x = 1</code></pre><p><code style="font-size:10px">y</code></p>`;
    const { blocks } = parse(html);
    expect(texts(blocks[1])[0].styles.fontSize).toBe("10px");
    expect(texts(blocks[2])[0].styles.fontSize).toBeUndefined();
    expect(texts(blocks[3])[0].styles).toEqual({ code: true });
  });

  it("keeps a Google Docs-like paste hierarchy after relative mapping", () => {
    const html = `
      <p><span style="color:#6d64e8;font-size:20pt;font-weight:700">Your Company</span></p>
      <p><span style="color:#666666;font-size:10pt">Address line</span></p>
      <p><span style="color:#283592;font-size:34pt">Product Brochure</span></p>
      <p><span style="color:#e01b84;font-size:11pt">October 2026</span></p>
      <h1><span style="font-size:21pt">Product Overview</span></h1>
      <h2><span style="font-size:16pt">Lorem ipsum</span></h2>
      <h3><span style="color:#e01b84;font-size:12pt">Accent</span></h3>
      <p><span style="color:#666666;font-size:11pt">${BODY}</span></p>`;
    const { blocks, report } = parse(html);
    const byText = Object.fromEntries(blocks.flatMap((b) => texts(b).map((t) => [t.text, { type: b.type, level: b.props?.level, ...t.styles }])));
    expect(byText["Your Company"]).toMatchObject({ type: "heading", level: 3, textColor: "#6d64e8", fontSize: "28px" });
    expect(byText["Address line"]).toMatchObject({ type: "paragraph", textColor: "#666666", fontSize: "14px" });
    expect(byText["Product Brochure"]).toMatchObject({ type: "paragraph", textColor: "#283592", fontSize: "48px" });
    expect(byText["October 2026"]).toMatchObject({ type: "paragraph", textColor: "#e01b84" });
    expect(byText["October 2026"].fontSize).toBeUndefined();
    expect(byText["Product Overview"]).toMatchObject({ type: "heading", level: 1, fontSize: "32px" });
    expect(byText["Lorem ipsum"]).toMatchObject({ type: "heading", level: 2, fontSize: "24px" });
    expect(byText["Accent"]).toMatchObject({ type: "heading", level: 3, textColor: "#e01b84", fontSize: "18px" });
    expect(byText[BODY]).toMatchObject({ type: "paragraph", textColor: "#666666" });
    expect(byText[BODY].fontSize).toBeUndefined();
    expect(report.fontSizes.clamped).toBe(0);
  });

  it("keeps sizes in table cells", () => {
    const { blocks } = parse(`<p>${BODY}</p><table><tr><th>Name</th><th>Size</th></tr><tr><td><span style="font-size:12px">cell</span></td><td>16</td></tr></table>`);
    const table = blocks[1].content as { rows: { cells: { content: HtmlText[] }[] }[] };
    expect(table.rows[1].cells[0].content[0].styles.fontSize).toBe("12px");
  });

  it("drops sizes with the tool off", () => {
    const { blocks } = parse(`<p>${BODY}</p><p><span style="font-size:12px">small</span></p>`, { tools: ["bold"] });
    expect(texts(blocks[1])[0].styles).toEqual({});
  });
});

describe("export", () => {
  const block = (styles: HtmlText["styles"]): HtmlBlock => ({ type: "paragraph", content: [{ type: "text", text: "Hi", styles }] });

  it("writes a span with font-size and data-font-size, merged with colours", () => {
    expect(toHTML([block({ fontSize: "14px" })])).toBe('<p><span style="font-size:14px" data-font-size="14px">Hi</span></p>');
    expect(toHTML([block({ fontSize: "20px", textColor: "red", bold: true })])).toBe(
      '<p><span style="font-size:20px;color:#e03e3e" data-text-color="red" data-font-size="20px"><strong>Hi</strong></span></p>',
    );
  });

  it("ignores values that aren't steps", () => {
    expect(toHTML([block({ fontSize: "16px" })])).toBe("<p>Hi</p>");
    expect(toHTML([block({ fontSize: "99px" })])).toBe("<p>Hi</p>");
  });

  it("round-trips even when most of the text is sized", () => {
    const blocks: HtmlBlock[] = [
      { type: "paragraph", content: [{ type: "text", text: BODY, styles: { fontSize: "14px" } }] },
      { type: "paragraph", content: [{ type: "text", text: "Default", styles: {} }] },
      { type: "paragraph", content: [{ type: "text", text: "Short bold line", styles: { bold: true, fontSize: "20px" } }] },
    ];
    expect(parse(toHTML(blocks)).blocks).toEqual(blocks);
  });
});
