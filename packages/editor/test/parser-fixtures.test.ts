import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { runSample, type SampleMeta } from "../fixtures/harness";
import { browserDom, parseHTML, type HtmlBlock } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import { metaFromProps, metaToProps } from "../src/parser/meta";
import { resolveEditorSetup } from "../src/plugins/resolve";

const dir = resolve(__dirname, "../fixtures/samples");
const samples = readdirSync(dir)
  .filter((f) => f.endsWith(".html"))
  .map((f) => {
    const name = f.replace(/\.html$/, "");
    const metaFile = join(dir, `${name}.meta.json`);
    let meta: SampleMeta = {};
    try {
      meta = JSON.parse(readFileSync(metaFile, "utf8"));
    } catch {
      // Samples without meta only get the built-in checks.
    }
    return { name, html: readFileSync(join(dir, f), "utf8"), meta };
  });

/** linkedom has no adoption-agency algorithm, so misnested inline tags differ from browsers. */
const PARITY_EXCEPTIONS = new Set(["synthetic-malformed"]);

describe.each(samples)("fixture $name", ({ name, html, meta }) => {
  const result = runSample(name, html, meta);

  it("passes its checks (safety, idempotence, score, includes)", () => {
    expect(result.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it.skipIf(PARITY_EXCEPTIONS.has(name))("gives the same blocks with the browser DOM", () => {
    expect(runSample(name, html, meta, browserDom).result.blocks).toEqual(result.result.blocks);
  });

  it("loads into the editor's schema unchanged", () => {
    if (!result.result.blocks.length) return;
    const { schema } = resolveEditorSetup(undefined);
    const editor = BlockNoteEditor.create({ schema, initialContent: metaToProps(result.result.blocks) as never });
    expect(normalize(metaFromProps(editor.document) as never, editor)).toEqual(result.result.blocks);
  });
});

/** The editor's document with ids and default props removed, i.e. in the parser's canonical shape. */
function normalize(blocks: Record<string, unknown>[], editor: BlockNoteEditor): HtmlBlock[] {
  const schema = editor.schema.blockSchema as Record<string, { propSchema: Record<string, { default?: unknown }> }>;
  return blocks.map((block) => {
    const { type, props, content, children, meta } = block as { type: string; props: Record<string, unknown>; content?: unknown; children: Record<string, unknown>[]; meta?: HtmlBlock["meta"] };
    const out: HtmlBlock = { type };
    if (meta) out.meta = meta;
    const kept = Object.fromEntries(Object.entries(props).filter(([k, v]) => (type === "heading" && k === "level") || v !== schema[type].propSchema[k]?.default));
    if (Object.keys(kept).length) out.props = kept as HtmlBlock["props"];
    if (Array.isArray(content)) out.content = content as HtmlBlock["content"];
    else if (content && typeof content === "object") out.content = normalizeTable(content as never);
    if (children.length) out.children = normalize(children, editor);
    return out;
  });
}

function normalizeTable(content: { type: "tableContent"; columnWidths: (number | undefined)[]; headerRows?: number; headerCols?: number; rows: { cells: { props: Record<string, unknown> }[] }[] }) {
  const defaults: Record<string, unknown> = { backgroundColor: "default", textColor: "default", textAlignment: "left", colspan: 1, rowspan: 1 };
  const rows = content.rows.map((row) => ({
    cells: row.cells.map((cell) => ({ ...cell, props: Object.fromEntries(Object.entries(cell.props).filter(([k, v]) => v !== defaults[k])) })),
  }));
  const out: Record<string, unknown> = { type: "tableContent", columnWidths: content.columnWidths, rows };
  if (content.headerRows) out.headerRows = content.headerRows;
  if (content.headerCols) out.headerCols = content.headerCols;
  return out as never;
}

describe("performance", () => {
  it("parses 1 MB / 5,000+ blocks within the Node budget", () => {
    const unit = samples.find((s) => s.name === "wordpress-gutenberg")!.html.replace(/^[\s\S]*<body[^>]*>|<\/body>[\s\S]*$/g, "");
    const html = unit.repeat(Math.ceil((1024 * 1024) / unit.length));
    parseHTML(html, { dom: linkedomDom });
    const start = performance.now();
    const { blocks } = parseHTML(html, { dom: linkedomDom });
    const ms = performance.now() - start;
    console.log(`perf: ${(html.length / 1024).toFixed(0)} KB, ${blocks.length} blocks, ${ms.toFixed(0)} ms (linkedom)`);
    expect(blocks.length).toBeGreaterThan(5000);
    expect(ms).toBeLessThan(600);
  });
});
