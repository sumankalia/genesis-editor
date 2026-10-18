import { describe, expect, it } from "vitest";
import { parseHTML, toHTML, type ParseOptions } from "../src/parser";
import { editorColor } from "../src/parser/colors";
import { linkedomDom } from "../src/parser/linkedom";

const parse = (html: string, options: ParseOptions = {}) => parseHTML(html, { dom: linkedomDom, ...options });
const out = (html: string) => toHTML(parse(html).blocks);

const XSS = [
  '<img src=x onerror="alert(1)">',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="  JaVaScRiPt:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
  "<svg><script>alert(1)</script></svg>",
  "<math><mtext><script>alert(1)</script></mtext></math>",
  '<iframe src="javascript:alert(1)"></iframe>',
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<p style="width:expression(alert(1))">x</p>',
  "<object data=x></object><embed src=x>",
  '<form action="https://evil"><input value=1><button>b</button></form>',
  '<p><a href="vbscript:msgbox(1)">x</a></p>',
  "<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></p></noscript>",
  '<details open ontoggle="alert(1)"><summary>s</summary></details>',
  '<video src=x onloadstart="alert(1)"></video>',
];

describe("sanitizer", () => {
  it.each(XSS)("never emits script, handlers or unsafe URLs: %s", (html) => {
    const result = out(html);
    expect(result).not.toMatch(/<script|on[a-z]+=|javascript:|vbscript:|data:text|svg\+xml|expression\(/i);
  });

  it("reports unsafe handlers and dropped content", () => {
    const { report } = parse('<p onclick="x">a</p><script>1</script><style>p{}</style>');
    expect(report.dropped.map((d) => [d.tag, d.reason])).toEqual([["p[onclick]", "unsafe"], ["script", "content"], ["style", "content"]]);
  });

  it("keeps base64 raster images", () => {
    const src = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}=`;
    expect(parse(`<img src="${src}">`).blocks[0].props?.url).toBe(src);
    const placeholder = parse('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">');
    expect(placeholder.blocks).toEqual([]);
    expect(placeholder.report.images.failed).toBe(1);
  });

  it("caps depth and length", () => {
    const deep = "<div>".repeat(600) + "x" + "</div>".repeat(600);
    expect(parse(deep, { maxDepth: 100 }).report.warnings.join()).toMatch(/deeper than 100/);
    expect(parse("<p>abcdef</p>", { maxLength: 6 }).report.warnings.join()).toMatch(/truncated/);
  });
});

describe("tracking layer", () => {
  it("drops pixel images and tracker hosts", () => {
    const r = parse('<img src="https://x.com/p.gif" width="1" height="1"><img src="https://www.google-analytics.com/collect?x=1"><p>t</p>');
    expect(r.blocks.map((b) => b.type)).toEqual(["paragraph"]);
    expect(r.report.dropped.every((d) => d.reason === "tracking")).toBe(true);
  });

  it("strips tracking params and unwraps redirect wrappers", () => {
    const href = (html: string) => (parse(html).blocks[0].content as { href?: string }[])[0].href;
    expect(href('<a href="https://x.com/a?utm_source=n&utm_medium=e&id=2&fbclid=z&gclid=1">a</a>')).toBe("https://x.com/a?id=2");
    expect(href('<a href="https://www.google.com/url?q=https%3A%2F%2Fy.com%2Fp%3Futm_campaign%3Dq&sa=D">a</a>')).toBe("https://y.com/p");
    expect(href('<a href="https://l.facebook.com/l.php?u=https%3A%2F%2Fz.org%2F">a</a>')).toBe("https://z.org/");
  });

  it("removes tracking data attributes", () => {
    expect(out('<p data-ga-event="x" data-track="y">t</p>')).toBe("<p>t</p>");
  });
});

describe("colours", () => {
  it("snaps to the palette within ΔE 3, otherwise keeps hex", () => {
    expect(editorColor("#e03e3e", "text")).toBe("red");
    expect(editorColor("#e13f3e", "text")).toBe("red");
    expect(editorColor("#123456", "text")).toBe("#123456");
    expect(editorColor("#123456", "text", false)).toBe("blue");
  });

  it("treats near-black text and white backgrounds as default", () => {
    for (const c of ["#000", "rgb(31,31,31)", "#37352f", "#333"]) expect(editorColor(c, "text")).toBeUndefined();
    expect(editorColor("white", "background")).toBeUndefined();
    expect(editorColor("rgba(255,0,0,0)", "text")).toBeUndefined();
  });

  it("exports palette colours with style and data attribute, hex with style only", () => {
    const html = toHTML([{ type: "paragraph", content: [{ type: "text", text: "a", styles: { textColor: "red" } }, { type: "text", text: "b", styles: { backgroundColor: "#123456" } }] }]);
    expect(html).toBe('<p><span style="color:#e03e3e" data-text-color="red">a</span><span style="background-color:#123456">b</span></p>');
  });

  it("is palette-only in strict mode and counts colours", () => {
    const r = parse('<p><span style="color:#123456">a</span><span style="color:#e03e3e">b</span></p>', { mode: "strict" });
    expect((r.blocks[0].content as { styles: object }[]).map((n) => n.styles)).toEqual([{ textColor: "blue" }, { textColor: "red" }]);
    expect(r.report.colors).toEqual({ palette: 2, hex: 0 });
  });
});
