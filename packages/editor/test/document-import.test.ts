import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import {
  detectDocumentFormat,
  DocumentImportError,
  importDocument,
  type DocumentSource,
} from "../src/parser/document-import";
import { importSlashItems, registerDocumentImport } from "../src/plugins/import-file";
import { linkedomDom } from "../src/parser/linkedom";
import type { AnyEditor } from "../src/plugins/types";

const parse = (source: DocumentSource) => importDocument(source, { dom: linkedomDom });
const bytes = (text: string) => new TextEncoder().encode(text);
const file = (name: string, text: string, type?: string): DocumentSource => ({ name, type, bytes: bytes(text) });

function zip(files: Record<string, string | Uint8Array>) {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(files)) {
    encoded[name] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(encoded);
}

function minimalDocx(body: string, extra: Record<string, string | Uint8Array> = {}) {
  return zip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>${body}</w:body>
</w:document>`,
    ...extra,
  });
}

const BODY = "Body copy that is long enough to be the dominant 11 point size of the source document.";

function brochureStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:sz w:val="22"/>
        <w:color w:val="666666"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:rPr><w:sz w:val="68"/><w:color w:val="283592"/></w:rPr></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:pPr><w:rPr><w:color w:val="E01B84"/></w:rPr></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr><w:sz w:val="42"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:rPr><w:sz w:val="24"/><w:color w:val="E01B84"/></w:rPr>
  </w:style>
</w:styles>`;
}

describe("detectDocumentFormat", () => {
  it("uses the extension first", () => {
    expect(detectDocumentFormat(file("note.md", "# x"))).toBe("markdown");
    expect(detectDocumentFormat(file("note.markdown", "# x"))).toBe("markdown");
    expect(detectDocumentFormat(file("page.html", "<p>x</p>"))).toBe("html");
    expect(detectDocumentFormat(file("plain.txt", "hello"))).toBe("txt");
    expect(detectDocumentFormat(file("memo.rtf", "{\\rtf1 x}"))).toBe("rtf");
    expect(detectDocumentFormat(file("doc.docx", "PK"))).toBe("docx");
    expect(detectDocumentFormat(file("doc.odt", "PK"))).toBe("odt");
    expect(detectDocumentFormat(file("chapter.pages", "PK"))).toBe("pages");
  });

  it("sniffs RTF, HTML, and zip contents when the extension is missing", () => {
    expect(detectDocumentFormat({ name: "clip", bytes: bytes("{\\rtf1\\ansi hi}") })).toBe("rtf");
    expect(detectDocumentFormat({ name: "clip", bytes: bytes("<!doctype html><p>x</p>") })).toBe("html");
    expect(detectDocumentFormat({ name: "clip", bytes: minimalDocx("<w:p><w:r><w:t>Hi</w:t></w:r></w:p>") })).toBe("docx");
    expect(
      detectDocumentFormat({
        name: "clip",
        bytes: zip({ mimetype: "application/vnd.oasis.opendocument.text", "content.xml": "<office:document-content/>" }),
      }),
    ).toBe("odt");
    expect(detectDocumentFormat({ name: "clip", bytes: zip({ "Index/Document.iwa": new Uint8Array([1, 2, 3]) }) })).toBe("pages");
    expect(detectDocumentFormat({ name: "clip.bin", bytes: bytes("not a document") })).toBe("unknown");
  });
});

describe("importDocument", () => {
  it("parses HTML through the genesis engine and sanitizes it", async () => {
    const result = await parse(file("page.html", `<h2 onclick="alert(1)">Title</h2><p>Safe<script>bad()</script> <a href="javascript:alert(1)">link</a></p>`));
    expect(result.format).toBe("html");
    expect(result.blocks.map((b) => b.type)).toEqual(["heading", "paragraph"]);
    expect(JSON.stringify(result.blocks)).not.toMatch(/javascript:|onclick|<script/i);
    expect(result.report.warnings[0]).toMatch(/Imported HTML/);
  });

  it("converts Markdown to HTML then parses it, keeping inline links", async () => {
    const result = await parse(file("note.md", "# Title\n\nA **bold** [link](https://example.com).\n\n- one\n- two"));
    expect(result.format).toBe("markdown");
    expect(result.blocks[0]).toMatchObject({ type: "heading", props: { level: 1 } });
    expect(JSON.stringify(result.blocks)).toContain("https://example.com");
    expect(result.blocks.some((b) => b.type === "bulletListItem")).toBe(true);
    expect(result.report.warnings[0]).toMatch(/marked/);
  });

  it("turns plain text into paragraphs and escapes HTML", async () => {
    const result = await parse(file("notes.txt", "Hello\nthere.\n\n<script>x</script>"));
    expect(result.format).toBe("txt");
    expect(result.blocks).toHaveLength(2);
    expect(JSON.stringify(result.blocks)).toContain("<script>x</script>");
    expect(JSON.stringify(result.blocks)).not.toContain('"type":"codeBlock"');
  });

  it("converts a modest RTF file", async () => {
    const result = await parse(file("memo.rtf", "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\b Hello\\b0\\par A paragraph with \\i italic\\i0.}"));
    expect(result.format).toBe("rtf");
    const text = JSON.stringify(result.blocks);
    expect(text).toContain("Hello");
    expect(text).toContain("italic");
  });

  it("converts a generated .docx with the OOXML walk", async () => {
    const body = `
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Hello Word</w:t></w:r></w:p>
      <w:p><w:r><w:t>A paragraph with </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r></w:p>
      <w:p><w:r><w:t>See </w:t></w:r></w:p>`;
    const result = await parse({ name: "doc.docx", bytes: minimalDocx(body) });
    expect(result.format).toBe("docx");
    expect(result.blocks[0]).toMatchObject({ type: "heading" });
    expect(JSON.stringify(result.blocks)).toContain("Hello Word");
    expect(JSON.stringify(result.blocks)).toContain("bold");
    expect(result.report.warnings[0]).toMatch(/inline color and size/);
    expect(result.report.warnings[0]).not.toMatch(/mammoth/);
  });

  it("keeps style and paragraph-mark colors and sizes that are not on the run", async () => {
    const body = `
      <w:p>
        <w:r>
          <w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="6D64E8"/></w:rPr>
          <w:t>Your Company</w:t>
        </w:r>
      </w:p>
      <w:p><w:r><w:t xml:space="preserve">${BODY}</w:t></w:r></w:p>
      <w:p>
        <w:pPr>
          <w:pStyle w:val="Title"/>
          <w:rPr><w:sz w:val="68"/><w:color w:val="283592"/></w:rPr>
        </w:pPr>
        <w:r><w:t>Product Brochure</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr>
          <w:pStyle w:val="Subtitle"/>
          <w:rPr><w:color w:val="E01B84"/></w:rPr>
        </w:pPr>
        <w:r><w:t>October 2026</w:t></w:r>
      </w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Product Overview</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>Accent heading</w:t></w:r></w:p>`;
    const result = await parse({
      name: "brochure.docx",
      bytes: minimalDocx(body, { "word/styles.xml": brochureStyles() }),
    });
    const textOf = (block: (typeof result.blocks)[number]) =>
      JSON.stringify(block.content).match(/"text":"([^"]+)"/)?.[1];
    const styleOf = (label: string) => {
      const block = result.blocks.find((b) => textOf(b) === label);
      const json = JSON.stringify(block?.content);
      return {
        type: block?.type,
        level: block?.props?.level,
        color: json.match(/"textColor":"([^"]+)"/)?.[1],
        size: json.match(/"fontSize":"([^"]+)"/)?.[1],
      };
    };
    expect(styleOf("Your Company")).toMatchObject({ type: "heading", level: 3, color: "#6d64e8", size: "28px" });
    expect(styleOf("Product Brochure")).toMatchObject({ type: "paragraph", color: "#283592", size: "48px" });
    expect(styleOf("October 2026")).toMatchObject({ type: "paragraph", color: "#e01b84" });
    expect(styleOf("Product Overview")).toMatchObject({ type: "heading", level: 1, size: "32px" });
    expect(styleOf("Accent heading")).toMatchObject({ type: "heading", level: 3, color: "#e01b84", size: "18px" });
    expect(result.report.warnings[0]).toMatch(/inline color and size/);
    expect(result.report.fontSizes.clamped).toBe(0);
  });

  it("imports tables, lists, and images as data URLs", async () => {
    const png = new Uint8Array(400);
    png.set(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    const body = `
      <w:p>
        <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
        <w:r><w:t>Listed</w:t></w:r>
      </w:p>
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
      <w:p>
        <w:r>
          <w:drawing>
            <wp:inline>
              <wp:docPr descr="Dot"/>
              <a:blip r:embed="rId4"/>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>`;
    const result = await parse({
      name: "parts.docx",
      bytes: minimalDocx(body, {
        "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/dot.png"/>
</Relationships>`,
        "word/numbering.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`,
        "word/media/dot.png": png,
      }),
    });
    expect(result.blocks.some((b) => b.type === "bulletListItem")).toBe(true);
    expect(result.blocks.some((b) => b.type === "table")).toBe(true);
    expect(JSON.stringify(result.blocks)).toContain("data:image/png;base64,");
    expect(JSON.stringify(result.blocks)).toContain("Listed");
  });

  it("converts a generated .odt, including images as data URLs", async () => {
    // Pad past the parser's tiny-data-URL tracker heuristic; a 1×1 table is also treated as layout.
    const png = new Uint8Array(400);
    png.set(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    const xml = `<?xml version="1.0"?>
      <office:document-content>
        <office:body><office:text>
          <text:h text:outline-level="1">ODT Title</text:h>
          <text:p>Hello ODT</text:p>
          <text:list><text:list-item><text:p>Item</text:p></text:list-item></text:list>
          <table:table><table:table-row>
            <table:table-cell><text:p>A</text:p></table:table-cell>
            <table:table-cell><text:p>B</text:p></table:table-cell>
          </table:table-row></table:table>
          <draw:image xlink:href="Pictures/photo.png"/>
        </office:text></office:body>
      </office:document-content>`;
    const result = await parse({
      name: "doc.odt",
      bytes: zip({
        mimetype: "application/vnd.oasis.opendocument.text",
        "content.xml": xml,
        "Pictures/photo.png": png,
      }),
    });
    expect(result.format).toBe("odt");
    expect(result.blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "bulletListItem", "table", "image"]);
    expect(JSON.stringify(result.blocks)).toContain("ODT Title");
    expect(JSON.stringify(result.blocks)).toContain("data:image/png;base64,");
  });

  it("imports the Google Docs HTML fixture", async () => {
    const html = readFileSync(resolve(__dirname, "../fixtures/samples/google-docs.html"), "utf8");
    const result = await parse(file("google-docs.html", html));
    expect(result.format).toBe("html");
    expect(result.blocks.some((b) => b.type === "heading")).toBe(true);
    expect(JSON.stringify(result.blocks)).toContain("Quarterly planning");
  });

  it("refuses Apple Pages with a specific error", async () => {
    await expect(parse({ name: "chapter.pages", bytes: zip({ "Index/Document.iwa": new Uint8Array([1]) }) })).rejects.toMatchObject({
      name: "DocumentImportError",
      code: "pages",
    });
    await expect(parse(file("x.pages", "not zip"))).rejects.toBeInstanceOf(DocumentImportError);
  });

  it("rejects empty and unknown files", async () => {
    await expect(parse({ name: "empty.txt", bytes: new Uint8Array() })).rejects.toMatchObject({ code: "empty" });
    await expect(parse({ name: "x.bin", bytes: bytes("????") })).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("import slash items", () => {
  it("offers Import document, and Drive when pickFile is set", () => {
    const editor = {} as AnyEditor;
    expect(importSlashItems(editor).map((i) => i.key)).toEqual(["import-document"]);
    registerDocumentImport(editor, {
      openPicker: () => undefined,
      importFile: async () => ({ format: "html", filename: "x.html" }) as never,
      googleDrive: { pickFile: async () => null },
    });
    expect(importSlashItems(editor).map((i) => i.key)).toEqual(["import-document", "import-google-drive"]);
    registerDocumentImport(editor, null);
  });
});
