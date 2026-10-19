import { describe, expect, it } from "vitest";
import { parseHTML, toHTML, type HtmlBlock } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";

const t = (text: string, styles: Record<string, unknown> = {}) => ({ type: "text" as const, text, styles });

const doc: HtmlBlock[] = [
  { type: "heading", props: { level: 2, textColor: "red" }, content: [t("Title")] },
  { type: "paragraph", props: { textAlignment: "center" }, content: [t("Hi  "), t("bold", { bold: true }), t(" & <x>\nnext")], children: [{ type: "paragraph", content: [t("child")] }] },
  { type: "paragraph", content: [{ type: "link", href: "https://x.com/a", content: [t("link", { italic: true })] }, t(" end", { backgroundColor: "#123456" })] },
  { type: "bulletListItem", content: [t("one")], children: [{ type: "bulletListItem", content: [t("nested")] }] },
  { type: "numberedListItem", props: { start: 3 }, content: [t("three")] },
  { type: "checkListItem", props: { checked: true }, content: [t("done")] },
  { type: "checkListItem", content: [t("todo")] },
  { type: "toggleListItem", content: [t("toggle")], children: [{ type: "paragraph", content: [t("inside")] }] },
  { type: "heading", props: { level: 3, isToggleable: true }, content: [t("Toggle heading")], children: [{ type: "paragraph", content: [t("body")] }] },
  { type: "quote", content: [t("quoted")] },
  { type: "codeBlock", props: { language: "ts" }, content: [t("const a = 1;\n  b();")] },
  { type: "divider" },
  {
    type: "table",
    content: {
      type: "tableContent",
      columnWidths: [120, undefined],
      headerRows: 1,
      rows: [
        { cells: [{ type: "tableCell", props: {}, content: [t("A")] }, { type: "tableCell", props: { backgroundColor: "blue" }, content: [t("B")] }] },
        { cells: [{ type: "tableCell", props: { colspan: 2, textAlignment: "right" }, content: [t("C\nD")] }] },
      ],
    },
  },
  { type: "image", props: { url: "https://x.com/a.png", name: "Alt", alt: "Alt", caption: "Cap", previewWidth: 320, textAlignment: "center" } },
  {
    type: "image",
    props: {
      url: "https://x.com/b.png", name: "B", alt: "B", width: 1200, height: 800, previewWidth: 600, href: "https://x.com/",
      srcset: "https://x.com/b-600.png 600w, https://x.com/b.png 1200w", sizes: "(max-width: 600px) 100vw, 600px",
      caption: "Photo by Ada", captionRich: JSON.stringify([{ type: "text", text: "Photo by ", styles: {} }, { type: "link", href: "https://ada.example/", content: [{ type: "text", text: "Ada", styles: { bold: true } }] }]),
    },
  },
  { type: "quote", props: { cite: "https://x.com/s" }, content: [{ type: "text", text: "Q", styles: {} }], children: [{ type: "paragraph", content: [{ type: "text", text: "Ada", styles: {} }], meta: { v: 1, source: { tag: "cite" } } }] },
  { type: "paragraph", content: [{ type: "text", text: "Anchored", styles: {} }], meta: { v: 1, attrs: { id: "a1", lang: "fr", dir: "rtl" } } },
  { type: "video", props: { url: "https://x.com/v.mp4", name: "Clip" } },
  { type: "audio", props: { url: "https://x.com/a.mp3" } },
  { type: "file", props: { url: "https://x.com/f.pdf", name: "f.pdf", caption: "Doc" } },
];

describe("parser round trip", () => {
  it("parse(toHTML(blocks)) gives the blocks back", () => {
    const html = toHTML(doc);
    const { blocks } = parseHTML(html, { dom: linkedomDom });
    expect(blocks).toEqual(doc);
    expect(toHTML(blocks)).toBe(html);
  });

  it("keeps intentional spaces (leading, doubled, across runs, around line breaks) without writing &nbsp;", () => {
    const spaced: HtmlBlock[] = [
      { type: "paragraph", content: [t(" lead  double   triple ")] },
      { type: "paragraph", content: [t("a "), t(" b", { bold: true }), t(" \n c\t d")] },
      { type: "heading", props: { level: 2 }, content: [t("  Indented")] },
    ];
    const html = toHTML(spaced);
    expect(html).not.toContain("&nbsp;");
    expect(html).toContain('<span style="white-space:pre-wrap">  </span>');
    expect(parseHTML(html, { dom: linkedomDom }).blocks).toEqual(spaced);
  });

  it("writes a stored &nbsp; as a plain space", () => {
    const html = toHTML([{ type: "paragraph", content: [t("10\u00a0km")] }]);
    expect(html).toBe("<p>10 km</p>");
  });
});
