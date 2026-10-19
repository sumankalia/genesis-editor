import { describe, expect, it } from "vitest";

import { parseHTML, toHTML } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import type { HtmlBlock, HtmlInline, HtmlText } from "../src/parser/types";

const parse = (html: string) => parseHTML(html, { dom: linkedomDom });
const texts = (block: HtmlBlock) =>
  ((block.content as HtmlInline[]) ?? []).flatMap((n) => (n.type === "link" ? n.content : n.type === "text" ? [n] : [])) as HtmlText[];

describe("Word HTML paste", () => {
  it("turns mso-list paragraphs into nested lists", () => {
    const html = `
      <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">
        <span style="mso-list:Ignore">·</span>Outer
      </p>
      <p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">
        <span style="mso-list:Ignore">o</span>Nested
      </p>
      <p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">
        <span style="mso-list:Ignore">·</span>Again
      </p>`;
    const { blocks } = parse(html);
    expect(blocks.map((b) => [b.type, texts(b)[0]?.text, b.children?.[0]?.type])).toEqual([
      ["bulletListItem", "Outer", "bulletListItem"],
      ["bulletListItem", "Again", undefined],
    ]);
    expect(texts(blocks[0].children![0])[0]?.text).toBe("Nested");
  });

  it("keeps numbered mso-list items ordered", () => {
    const html = `
      <p class="MsoListParagraph" style="mso-list:l1 level1 lfo2">
        <span style="mso-list:Ignore">1.</span>First
      </p>
      <p class="MsoListParagraph" style="mso-list:l1 level1 lfo2">
        <span style="mso-list:Ignore">2.</span>Second
      </p>`;
    const { blocks } = parse(html);
    expect(blocks.map((b) => b.type)).toEqual(["numberedListItem", "numberedListItem"]);
    expect(texts(blocks[0])[0]?.text).toBe("First");
  });

  it("promotes VML imagedata with a safe src", () => {
    const html = `<p>Photo</p><v:shape><v:imagedata src="https://img.example/dot.png" o:title="Dot"/></v:shape>`;
    const { blocks } = parse(html);
    expect(blocks.some((b) => b.type === "image" && b.props?.url === "https://img.example/dot.png")).toBe(true);
  });

  it("drops Word comment balloons and keeps the body", () => {
    const html = `
      <p>Visible<span class="MsoCommentReference"><span>1</span></span></p>
      <div id="_com_1" class="msocomtxt">Secret editorial note</div>
      <p>Still here</p>`;
    const { blocks } = parse(html);
    const all = JSON.stringify(blocks);
    expect(all).toContain("Visible");
    expect(all).toContain("Still here");
    expect(all).not.toContain("Secret editorial note");
  });

  it("round-trips rewritten lists through toHTML", () => {
    const html = `<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·</span>Keep</p>`;
    const { blocks } = parse(html);
    expect(parse(toHTML(blocks)).blocks).toEqual(blocks);
  });
});
