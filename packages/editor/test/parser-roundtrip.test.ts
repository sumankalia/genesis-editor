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
  { type: "image", props: { url: "https://x.com/a.png", name: "Alt", caption: "Cap", previewWidth: 320, textAlignment: "center" } },
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
});
