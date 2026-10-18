import { describe, expect, it } from "vitest";
import { parseHTML, toHTML, type HtmlBlock, type HtmlText, type ParseOptions } from "../src/parser";
import {
  cleanSwatches,
  contrastRatio,
  cssColor,
  editorColor,
  isStoredColor,
  parseColorAlpha,
  resolveColorConfig,
  withContrast,
} from "../src/parser/colors";
import { linkedomDom } from "../src/parser/linkedom";

const parse = (html: string, options: ParseOptions = {}) => parseHTML(html, { dom: linkedomDom, ...options });
const firstText = (blocks: HtmlBlock[]) => (blocks[0].content as HtmlText[])[0];
const brand = [{ name: "brand", hex: "#ff5a1f" }];

describe("stored colors", () => {
  it("accepts default, palette and swatch names, and lowercase hex", () => {
    expect(isStoredColor("default", "text")).toBe(true);
    expect(isStoredColor("red", "text")).toBe(true);
    expect(isStoredColor("#12ab34", "text")).toBe(true);
    expect(isStoredColor("#12ab3480", "background")).toBe(true);
    expect(isStoredColor("brand", "text", brand)).toBe(true);
  });

  it("rejects everything else", () => {
    for (const value of ["#12AB34", "#12ab3480", "rgb(1,2,3)", "brand", "#fff", "", 3]) {
      expect(isStoredColor(value, "text")).toBe(false);
    }
  });

  it("cleans swatches: bad names, palette names, duplicates and non-hex are skipped", () => {
    expect(
      cleanSwatches([
        { name: "brand", hex: "#FF5A1F" },
        { name: "red", hex: "#ff0000" },
        { name: "Brand 2", hex: "#00ff00" },
        { name: "brand", hex: "#000000" },
        { name: "ink", hex: "black" },
        { name: "sky", hex: "#0ea5e9" },
      ]),
    ).toEqual([
      { name: "brand", hex: "#ff5a1f" },
      { name: "sky", hex: "#0ea5e9" },
    ]);
  });

  it("resolves tools.colors", () => {
    expect(resolveColorConfig(true)).toEqual({ palette: true, custom: true, swatches: [] });
    expect(resolveColorConfig({ custom: false, swatches: brand })).toEqual({ palette: true, custom: false, swatches: brand });
  });
});

describe("editorColor", () => {
  it("snaps to swatches as it does to the palette", () => {
    expect(editorColor("#ff5b20", "text", { swatches: brand })).toBe("brand");
    expect(editorColor("#e03e3e", "text", { swatches: brand })).toBe("red");
  });

  it("keeps translucent backgrounds as #rrggbbaa, compared over white", () => {
    expect(editorColor("rgba(18, 52, 86, 0.5)", "background")).toBe("#12345680");
    expect(editorColor("#12345680", "background")).toBe("#12345680");
    expect(editorColor("rgba(255, 255, 255, 0.5)", "background")).toBeUndefined();
  });

  it("text never keeps alpha", () => {
    expect(editorColor("rgba(18, 52, 86, 0.5)", "text")).toBe("#123456");
  });

  it("buckets by hue without hex, or goes to the nearest swatch without the palette", () => {
    expect(editorColor("#0000ff", "text", { hex: false })).toBe("blue");
    expect(editorColor("#ff69b4", "background", { hex: false })).toBe("pink");
    expect(editorColor("#0000ff", "text", { hex: false, palette: false, swatches: brand })).toBe("brand");
    expect(editorColor("#0000ff", "text", { hex: false, palette: false })).toBeUndefined();
  });

  it("without the palette, near-palette colours stay hex", () => {
    expect(editorColor("#e03e3e", "text", { palette: false })).toBe("#e03e3e");
  });

  it("reads alpha from every syntax", () => {
    expect(parseColorAlpha("#0000ff80")?.[1]).toBeCloseTo(0.5, 2);
    expect(parseColorAlpha("rgb(0 0 255 / 25%)")?.[1]).toBeCloseTo(0.25);
    expect(parseColorAlpha("hsla(240, 100%, 50%, 0.3)")?.[1]).toBeCloseTo(0.3);
  });
});

describe("cssColor", () => {
  it("maps names to hex and passes valid hex through", () => {
    expect(cssColor("red", "text")).toBe("#e03e3e");
    expect(cssColor("brand", "text", brand)).toBe("#ff5a1f");
    expect(cssColor("#12345680", "background")).toBe("#12345680");
    expect(cssColor("#12345680", "text")).toBeUndefined();
    expect(cssColor("expression(alert(1))", "text")).toBeUndefined();
  });
});

describe("contrast", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1);
  });

  it("only moves colours below the minimum", () => {
    expect(withContrast("#e03e3e", "#ffffff")).toBe("#e03e3e");
    const light = withContrast("#ffeb3b", "#ffffff");
    expect(light).not.toBe("#ffeb3b");
    expect(contrastRatio(light, "#ffffff")).toBeGreaterThanOrEqual(3);
    const dark = withContrast("#1a237e", "#1f1f1f");
    expect(contrastRatio(dark, "#1f1f1f")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(dark, "#ffffff")).toBeLessThan(contrastRatio("#1a237e", "#ffffff"));
  });
});

describe("parse and export", () => {
  it("reads swatch names from data attributes and writes them back with their hex", () => {
    const tools = { colors: { swatches: brand }, bold: true };
    const { blocks } = parse('<p><span data-text-color="brand" style="color:#ff5a1f">Hi</span></p>', { tools });
    expect(firstText(blocks).styles.textColor).toBe("brand");
    expect(toHTML(blocks, { swatches: brand })).toBe('<p><span style="color:#ff5a1f" data-text-color="brand">Hi</span></p>');
    expect(toHTML(blocks)).toBe("<p>Hi</p>");
  });

  it("an unknown data-text-color falls back to the inline colour", () => {
    const { blocks } = parse('<p><span data-text-color="brand" style="color:#ff5a1f">Hi</span></p>');
    expect(firstText(blocks).styles.textColor).toBe("#ff5a1f");
  });

  it("custom: false snaps pasted hex to a named colour", () => {
    const { blocks } = parse('<p><span style="color:#0000ff">Hi</span></p>', { tools: { colors: { custom: false } } });
    expect(firstText(blocks).styles.textColor).toBe("blue");
  });

  it("translucent highlights round-trip", () => {
    const { blocks } = parse('<p><span style="background-color:rgba(18,52,86,.5)">Hi</span></p>');
    expect(firstText(blocks).styles.backgroundColor).toBe("#12345680");
    expect(toHTML(blocks)).toBe('<p><span style="background-color:#12345680">Hi</span></p>');
    expect(firstText(parse(toHTML(blocks)).blocks).styles.backgroundColor).toBe("#12345680");
  });

  it("export ignores colours the editor doesn't store", () => {
    const blocks: HtmlBlock[] = [{ type: "paragraph", content: [{ type: "text", text: "x", styles: { textColor: "url(x)" } }] }];
    expect(toHTML(blocks)).toBe("<p>x</p>");
  });
});
