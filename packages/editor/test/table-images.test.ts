import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseHTML, parseHTMLAsync, toHTML, type HtmlBlock, type HtmlInline, type HtmlTableContent } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import { BUILT_IN_TOOLS } from "../src/plugins/tool-names";

const without = (name: string) => BUILT_IN_TOOLS.filter((tool) => tool !== name);

const ORIGIN = "https://media.example";
const clipboard = readFileSync(join(__dirname, "fixtures/devto-clipboard.html"), "utf8").replaceAll("{{ORIGIN}}", ORIGIN);
const privateFixture = join(__dirname, "../fixtures/private/devto-article-body.html");

const tableOf = (blocks: HtmlBlock[]) => blocks.find((b) => b.type === "table")?.content as HtmlTableContent | undefined;
const cellImages = (table: HtmlTableContent | undefined) =>
  (table?.rows ?? []).flatMap((row) => row.cells.flatMap((cell) => cell.content.filter((n) => n.type === "inlineImage")));

describe("images in table cells", () => {
  it("keeps an <img> in a cell as inline content, with its size", () => {
    const { blocks } = parseHTML('<table><tr><td><img src="https://a.test/x.png" alt="X" width="320" height="200"></td><td>b</td></tr></table>');
    expect(tableOf(blocks)?.rows[0].cells[0].content).toEqual([
      { type: "inlineImage", props: { url: "https://a.test/x.png", alt: "X", width: 320, height: 200, previewWidth: 320 } },
    ]);
  });

  it("keeps text around the image, and the image's link", () => {
    const { blocks } = parseHTML('<table><tr><td>Logo <a href="https://site.test" target="_blank"><img src="https://a.test/x.png"></a> here</td><td>b</td></tr></table>');
    expect(tableOf(blocks)?.rows[0].cells[0].content).toEqual([
      { type: "text", text: "Logo ", styles: {} },
      { type: "inlineImage", props: { url: "https://a.test/x.png", href: "https://site.test", openInNewTab: true } },
      { type: "text", text: " here", styles: {} },
    ]);
  });

  it("round-trips through toHTML as <td><img>", () => {
    const { blocks } = parseHTML('<table><tr><td>a <img src="https://a.test/x.png" alt="X" width="320" style="width:120px"> b</td><td><a href="https://s.test/"><img src="https://a.test/y.png"></a></td></tr></table>');
    const html = toHTML(blocks);
    expect(html).toContain('<td>a <img src="https://a.test/x.png" alt="X" data-genesis-inline width="320" style="width:120px"> b</td>');
    expect(html).toContain('<td><a href="https://s.test/"><img src="https://a.test/y.png" alt="" data-genesis-inline></a></td>');
    expect(parseHTML(html).blocks).toEqual(blocks);
  });

  it("keeps an inline image inline outside a table when it's marked", () => {
    const blocks: HtmlBlock[] = [{ type: "paragraph", content: [{ type: "text", text: "Icon ", styles: {} }, { type: "inlineImage", props: { url: "https://a.test/i.png", alt: "i" } }] }];
    expect(parseHTML(toHTML(blocks)).blocks).toEqual(blocks);
  });

  it("an image in a figure in a cell becomes inline too", () => {
    const { blocks } = parseHTML('<table><tr><td><figure><img src="https://a.test/x.png"><figcaption>Cap</figcaption></figure></td><td>b</td></tr></table>');
    const cell = tableOf(blocks)!.rows[0].cells[0].content;
    expect(cell[0]).toEqual({ type: "inlineImage", props: { url: "https://a.test/x.png" } });
    expect(cell.some((n) => n.type === "text" && n.text.includes("Cap"))).toBe(true);
  });

  it("follows the image tool: off, a cell gets a link instead", () => {
    const html = '<table><tr><td><img src="https://a.test/x.png" alt="X"></td><td>b</td></tr></table>';
    const off = parseHTML(html, { tools: without("image") });
    expect(cellImages(tableOf(off.blocks))).toHaveLength(0);
    expect(tableOf(off.blocks)?.rows[0].cells[0].content).toEqual([{ type: "link", href: "https://a.test/x.png", content: [{ type: "text", text: "X", styles: {} }] }]);
    expect(off.report.downgrades).toContainEqual(expect.objectContaining({ from: "image", to: "link paragraph" }));
    expect(cellImages(tableOf(parseHTML(html, { tools: without("image"), mode: "strict" }).blocks))).toHaveLength(0);
  });

  it("with the table tool off, the images stay in the row's paragraph", () => {
    const { blocks } = parseHTML('<table><tr><td><img src="https://a.test/x.png"></td><td><img src="https://a.test/y.png"></td></tr></table>', { tools: without("table") });
    expect(blocks).toHaveLength(1);
    expect((blocks[0].content as HtmlInline[]).filter((n) => n.type === "inlineImage")).toHaveLength(2);
  });

  it("drops tracking pixels and unsafe sources in cells", () => {
    const { blocks } = parseHTML('<table><tr><td><img src="https://a.test/p.gif" width="1" height="1">a</td><td><img src="javascript:alert(1)">b</td></tr></table>');
    expect(cellImages(tableOf(blocks))).toHaveLength(0);
  });

  it("an empty header row (Markdown image grids) is dropped and reported", () => {
    const { blocks, report } = parseHTML('<table><thead><tr><th></th><th></th></tr></thead><tbody><tr><td><img src="https://a.test/x.png"></td><td>b</td></tr></tbody></table>');
    const table = tableOf(blocks)!;
    expect(table.rows).toHaveLength(1);
    expect(table.headerRows).toBeUndefined();
    expect(report.dropped).toContainEqual(expect.objectContaining({ tag: "thead", reason: "noise" }));
  });

  it("keeps a header row with text, or one holding an image", () => {
    expect(tableOf(parseHTML("<table><thead><tr><th>A</th><th></th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>").blocks)?.rows).toHaveLength(2);
    expect(tableOf(parseHTML('<table><thead><tr><th><img src="https://a.test/x.png"></th><th></th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>').blocks)?.headerRows).toBe(1);
  });

  it("an image that links to itself loses the link", () => {
    const { blocks } = parseHTML('<p><a href="https://a.test/x.png" class="article-body-image-wrapper"><img src="https://a.test/x.png" alt="X"></a></p>');
    expect(blocks).toEqual([{ type: "image", props: { url: "https://a.test/x.png", name: "X", alt: "X" } }]);
    const linked = parseHTML('<p><a href="https://site.test/"><img src="https://a.test/x.png"></a></p>').blocks[0];
    expect(linked.props?.href).toBe("https://site.test/");
  });
});

describe("browser clipboard HTML (dev.to)", () => {
  const { blocks, report } = parseHTML(clipboard);
  const table = tableOf(blocks);

  it("keeps the 3×2 grid of images, without the empty header", () => {
    expect(table?.rows).toHaveLength(2);
    expect(table?.rows.every((row) => row.cells.length === 3)).toBe(true);
    expect(table?.headerRows).toBeUndefined();
    expect(table?.rows.every((row) => row.cells.every((cell) => cell.content.length === 1 && cell.content[0].type === "inlineImage"))).toBe(true);
  });

  it("recovers lazy and responsive sources: data-src, <picture>, srcset", () => {
    const urls = cellImages(table).map((n) => (n.type === "inlineImage" ? n.props.url : ""));
    expect(urls).toEqual([
      `${ORIGIN}/examples/lake.png`,
      `${ORIGIN}/examples/dunes.png`,
      `${ORIGIN}/examples/dunes.png`,
      `${ORIGIN}/examples/dunes.png`,
      `${ORIGIN}/examples/lake.png`,
      `${ORIGIN}/examples/lake.png`,
    ]);
    expect(urls.some((u) => u.startsWith("data:"))).toBe(false);
  });

  it("keeps width and height, and a cell image's link", () => {
    const [first, , , , linked] = cellImages(table);
    expect(first).toMatchObject({ props: { width: 799, height: 533, alt: "Speaking at the conference" } });
    expect(linked).toMatchObject({ props: { href: "https://example.com/talk" } });
  });

  it("drops the heading's empty anchor, the self-link and the empty ad slots", () => {
    expect(blocks.find((b) => b.type === "heading")?.content).toEqual([{ type: "text", text: "Why I'm Revisiting Browser AI", styles: {} }]);
    const image = blocks.find((b) => b.type === "image");
    expect(image?.props).toMatchObject({ url: `${ORIGIN}/examples/dunes.png` });
    expect(image?.props?.href).toBeUndefined();
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "table", "heading", "image", "paragraph"]);
    expect(report.warnings.join(" ")).not.toMatch(/StartFragment|charset/);
  });

  it("parses the same with linkedom on the server", () => {
    expect(parseHTML(clipboard, { dom: linkedomDom }).blocks).toEqual(blocks);
  });

  it("round-trips", () => {
    expect(parseHTML(toHTML(blocks)).blocks).toEqual(blocks);
  });

  it("parseHTMLAsync re-hosts cell images too", async () => {
    const seen: string[] = [];
    const result = await parseHTMLAsync(clipboard, {
      uploadRemote: async (url: string) => {
        seen.push(url);
        return `https://cdn.app/${url.split("/").pop()}`;
      },
    });
    const urls = cellImages(tableOf(result.blocks)).map((n) => (n.type === "inlineImage" ? n.props : undefined));
    expect(urls.every((p) => p?.url.startsWith("https://cdn.app/") && p.originalUrl?.startsWith(ORIGIN))).toBe(true);
    expect(seen.sort()).toEqual([`${ORIGIN}/examples/dunes.png`, `${ORIGIN}/examples/lake.png`]);
  });
});

describe.skipIf(!existsSync(privateFixture))("dev.to article body (private sample)", () => {
  const html = existsSync(privateFixture) ? readFileSync(privateFixture, "utf8") : "";

  it("keeps the six table images and drops the empty header", () => {
    const { blocks, report } = parseHTML(html);
    const table = tableOf(blocks)!;
    expect(table.rows).toHaveLength(2);
    expect(cellImages(table)).toHaveLength(6);
    expect(report.dropped).toContainEqual(expect.objectContaining({ tag: "thead" }));
    expect(blocks.filter((b) => b.type === "image").every((b) => !b.props?.href)).toBe(true);
    expect(blocks.filter((b) => b.type === "heading").every((b) => (b.content as HtmlInline[]).every((n) => n.type === "text"))).toBe(true);
    expect(parseHTML(toHTML(blocks)).blocks).toEqual(blocks);
  });
});
