import { describe, expect, it } from "vitest";
import { parseHTML, type ParseOptions } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";

const parse = (html: string, options: ParseOptions = {}) => parseHTML(html, { dom: linkedomDom, ...options });
const blocks = (html: string, options?: ParseOptions) => parse(html, options).blocks;
const t = (text: string, styles = {}) => ({ type: "text", text, styles });

describe("inline and whitespace", () => {
  it("collapses whitespace, keeps br as newline and drops a trailing br", () => {
    expect(blocks("<p>  a \n  b <br>  c<br></p>")[0].content).toEqual([t("a b\nc")]);
  });

  it("collapses &nbsp; padding next to other whitespace and trims it at line edges", () => {
    const html = [
      "<p>Fields,&nbsp; and hedges</p>",
      "<p>the end.&nbsp;&nbsp; &nbsp;</p>",
      "<p> &nbsp;Starts here</p>",
      "<ul><li>&nbsp;An item&nbsp;</li></ul>",
      "<p>one&nbsp;&nbsp;two<br>&nbsp;three&nbsp;<br>four</p>",
      "<p>Mr.<span>&nbsp;</span> <i>Smith</i></p>",
    ].join("");
    expect(blocks(html).map((b) => b.content)).toEqual([
      [t("Fields, and hedges")],
      [t("the end.")],
      [t("Starts here")],
      [t("An item")],
      [t("one two\nthree\nfour")],
      [t("Mr. "), t("Smith", { italic: true })],
    ]);
  });

  it("keeps a lone &nbsp; between words as a space, and spacing under white-space: pre*", () => {
    expect(blocks("<p>10&nbsp;km</p>")[0].content).toEqual([t("10 km")]);
    expect(blocks('<p>a<span style="white-space:pre-wrap">  </span>b<span style="white-space:pre-wrap"> </span></p>')[0].content).toEqual([t("a  b ")]);
  });

  it("splits loose text at double breaks into paragraphs", () => {
    expect(blocks("one<br><br>two").map((b) => b.content)).toEqual([[t("one")], [t("two")]]);
  });

  it("maps marks from tags and CSS, and cancels inherited bold", () => {
    const content = blocks('<p><b>a<span style="font-weight:normal">b</span></b><span style="font-style:italic;text-decoration:underline line-through">c</span><span style="font-family:Consolas">d</span><mark>e</mark></p>')[0].content;
    expect(content).toEqual([
      t("a", { bold: true }),
      t("b"),
      t("c", { italic: true, underline: true, strike: true }),
      t("d", { code: true }),
      t("e", { backgroundColor: "yellow" }),
    ]);
  });

  it("reports sub/sup and visual styles as unsupported", () => {
    const { report } = parse('<p>H<sub>2</sub>O <span style="letter-spacing:2px">x</span></p>');
    expect(report.downgrades).toContainEqual({ from: "sub", to: "text", count: 1 });
    expect(report.unsupportedStyles.map((s) => s.prop)).toContain("letter-spacing");
  });
});

describe("lists", () => {
  it("maps nested, numbered and check lists", () => {
    expect(blocks('<ol start="3"><li>a</li><li>b<ul><li>c</li></ul></li></ol><ul><li><input type="checkbox" checked> d</li></ul>')).toEqual([
      { type: "numberedListItem", props: { start: 3 }, content: [t("a")] },
      { type: "numberedListItem", content: [t("b")], children: [{ type: "bulletListItem", content: [t("c")] }] },
      { type: "checkListItem", props: { checked: true }, content: [t("d")] },
    ]);
  });

  it("attaches Google Docs sibling lists to the previous item", () => {
    expect(blocks("<ul><li>a</li><ul><li>b</li></ul></ul>")).toEqual([{ type: "bulletListItem", content: [t("a")], children: [{ type: "bulletListItem", content: [t("b")] }] }]);
  });

  it("clamps list depth to 6", () => {
    const html = "<ul><li>x".repeat(9) + "</li></ul>".repeat(9);
    let depth = 0;
    let level = blocks(html);
    while (level[0]?.children?.length) [depth, level] = [depth + 1, level[0].children];
    expect(depth).toBe(5);
  });

  it("downgrades list items to paragraphs when their tool is off", () => {
    const r = parse("<ul><li>a</li></ul>", { tools: ["numberedList"] });
    expect(r.blocks).toEqual([{ type: "paragraph", content: [t("a")] }]);
    expect(r.report.downgrades[0]).toMatchObject({ from: "bulletListItem", to: "paragraph" });
  });
});

describe("tables", () => {
  it("builds a rectangular grid with spans, headers and widths", () => {
    const [table] = blocks('<table><colgroup><col style="width:100px"><col></colgroup><thead><tr><th>A</th><th>B</th></tr></thead><tr><td rowspan="2">C</td><td>D</td></tr><tr><td>E</td></tr></table>');
    expect(table.content).toMatchObject({ columnWidths: [100, undefined], headerRows: 1 });
    expect((table.content as { rows: { cells: { props: object }[] }[] }).rows[1].cells[0].props).toEqual({ rowspan: 2 });
  });

  it("unwraps layout tables", () => {
    expect(blocks('<table role="presentation"><tr><td><p>a</p></td><td><p>b</p></td></tr></table>').map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("becomes tab-separated paragraphs when tables are off", () => {
    expect(blocks("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>", { tools: ["heading"] }).map((b) => b.content)).toEqual([[t("a\tb")], [t("c\td")]]);
  });
});

describe("media", () => {
  it("resolves lazy sources, srcset, and relative URLs against baseUrl", () => {
    const img = (html: string, options?: ParseOptions) => blocks(html, options)[0].props?.url;
    expect(img('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="https://x.com/real.jpg">')).toBe("https://x.com/real.jpg");
    expect(img('<img srcset="https://x.com/s.jpg 300w, https://x.com/l.jpg 1200w">')).toBe("https://x.com/l.jpg");
    expect(img('<img src="/a.png">', { baseUrl: "https://site.com/post/" })).toBe("https://site.com/a.png");
  });

  it("reads figure captions, alignment and width", () => {
    expect(blocks('<figure class="aligncenter"><img src="https://x.com/a.png" alt="A" width="300"><figcaption>Cap</figcaption></figure>')).toEqual([
      { type: "image", props: { url: "https://x.com/a.png", name: "A", alt: "A", width: 300, previewWidth: 300, textAlignment: "center", caption: "Cap" } },
    ]);
  });

  it("turns iframes into link paragraphs when the embed tool is off, and drops non-https ones", () => {
    expect(blocks('<iframe src="https://www.youtube.com/embed/x" title="Video"></iframe>', { tools: ["link"] })).toEqual([{ type: "paragraph", content: [{ type: "link", href: "https://www.youtube.com/embed/x", content: [t("Video")] }] }]);
    expect(parse('<iframe src="http://x.com/"></iframe>').report.dropped[0]).toMatchObject({ tag: "iframe", reason: "embed" });
  });

  it("downgrades images to links in clean mode and drops them in strict mode", () => {
    const html = '<img src="https://x.com/a.png" alt="A">';
    expect(blocks(html, { tools: ["link"] })).toEqual([{ type: "paragraph", content: [{ type: "link", href: "https://x.com/a.png", content: [t("A")] }] }]);
    expect(blocks(html, { tools: ["link"], mode: "strict" })).toEqual([]);
  });
});

describe("modes and report", () => {
  it("keeps only text from unknown markup in strict mode", () => {
    expect(blocks("<custom-el><b>x</b></custom-el>", { mode: "strict" })[0].content).toEqual([t("x")]);
    expect(blocks("<custom-el><b>x</b></custom-el>")[0].content).toEqual([t("x", { bold: true })]);
  });

  it("drops hidden content and scores lossless input at 1", () => {
    const r = parse('<p>a</p><p style="display:none">secret</p><p hidden>x</p>');
    expect(r.blocks).toHaveLength(1);
    expect(r.report.score).toBe(1);
    expect(r.report.dropped[0]).toMatchObject({ reason: "hidden", preview: "secret" });
  });

  it("drops and counts font sizes when the fontSize tool is off", () => {
    const r = parse('<p>Body text long enough to be dominant.</p><p><span style="font-size:24px">big</span> words</p>', {
      tools: ["bold"],
    });
    expect(r.blocks[1].content).toEqual([t("big words")]);
    expect(r.report.unsupportedStyles.find((s) => s.prop === "font-size")).toBeTruthy();
  });
});
