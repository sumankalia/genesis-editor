import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { DOMParser as LinkedomParser, parseHTML as linkedom } from "linkedom";
import { describe, expect, it } from "vitest";

import { browserDom, parseHTML, toDomAdapter, type DomOption } from "../src/parser";
import { jsdomDom } from "../src/parser/jsdom";
import { linkedomDom } from "../src/parser/linkedom";

const parserDir = resolve(__dirname, "../src/parser");

function importsOf(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  for (const [, spec] of source.matchAll(/^(?:import|export)\b[^;()]*?\bfrom\s+"([^"]+)"/gm)) {
    if (spec.startsWith(".")) {
      const base = resolve(dirname(file), spec);
      const target = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((p) => {
        try {
          readFileSync(p);
          return true;
        } catch {
          return false;
        }
      });
      if (target) importsOf(target, seen);
    } else seen.add(`pkg:${spec}`);
  }
  return seen;
}

describe("parser entry", () => {
  it("imports no React, BlockNote, or editor runtime", () => {
    const all = [...importsOf(join(parserDir, "index.ts"))];
    expect(all.filter((p) => p.startsWith("pkg:"))).toEqual(["pkg:marked"]);
    const outside = all.filter((p) => !p.startsWith("pkg:") && !p.startsWith(parserDir));
    // The re-host queue behind `parseHTMLAsync` is shared with the editor and is plain TypeScript too.
    expect(outside.map((p) => p.slice(p.indexOf("src/"))).sort()).toEqual(["src/lib/rehost.ts", "src/lib/uploads.ts", "src/plugins/tool-names.ts"]);
  });

  it("keeps linkedom and jsdom out of the main parser entry", () => {
    const files = readdirSync(parserDir).filter((f) => f.endsWith(".ts") && f !== "linkedom.ts" && f !== "jsdom.ts");
    for (const f of files) expect(readFileSync(join(parserDir, f), "utf8")).not.toMatch(/from "(linkedom|jsdom)"/);
  });
});

describe("dom option", () => {
  const html = '<h2>Title</h2>Loose <b>text</b><ul><li>one</li></ul>';
  const expected = parseHTML(html, { dom: linkedomDom }).blocks;

  it("takes an adapter, a document factory, or a DOMParser instance or class, with the same result", () => {
    const window = new JSDOM("").window;
    const options: DomOption[] = [jsdomDom, (source) => linkedom(source).document as unknown as Document, new window.DOMParser(), window.DOMParser, browserDom];
    options.push(LinkedomParser as unknown as DomOption, new LinkedomParser() as unknown as DomOption);
    for (const dom of options) expect(parseHTML(html, { dom }).blocks).toEqual(expected);
    expect(expected.map((b) => b.type)).toEqual(["heading", "paragraph", "bulletListItem"]);
  });

  it("wraps fragments for document factories, so loose top-level text isn't lost", () => {
    const seen: string[] = [];
    parseHTML("hi", { dom: (source) => (seen.push(source), linkedom(source).document as unknown as Document) });
    expect(seen[0]).toMatch(/^<!doctype html><html><head><\/head><body>hi<\/body><\/html>$/);
  });

  it("rejects anything else with a clear error", () => {
    expect(() => toDomAdapter({} as DomOption)).toThrow(/`dom` must be/);
  });
});
