import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseHTML, toHTML } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import type { ParseOptions } from "../src/parser/types";

/** Messy, real-world-shaped HTML: wrappers, inline styles, stray breaks, nesting in odd places. */
const word = fc.constantFrom("alpha", "beta", "gamma", "delta", "Read more", "Share on X", "&nbsp;", "a&amp;b", " ", "é");
const style = fc.constantFrom(
  "",
  ' style="font-weight:700"',
  ' style="font-style:italic;color:#e03e3e"',
  ' style="background-color:#fbf3db"',
  ' style="text-decoration:underline"',
  ' style="font-size:24pt;font-weight:bold"',
  ' style="display:none"',
  ' class="share social"',
  ' class="post-content"',
  ' id="sec-1" lang="fr"',
  ' dir="rtl"',
);
const html: fc.Arbitrary<string> = fc.letrec<{ node: string; inline: string; block: string }>((tie) => ({
  inline: fc.oneof(
    { weight: 4, arbitrary: word },
    { weight: 1, arbitrary: fc.constant("<br>") },
    { weight: 2, arbitrary: fc.tuple(fc.constantFrom("b", "i", "u", "s", "code", "span", "strong", "em", "mark", "sub"), style, tie("inline")).map(([t, s, c]) => `<${t}${s}>${c}</${t}>`) },
    { weight: 1, arbitrary: fc.tuple(fc.constantFrom("https://a.example/?utm_source=x", "/rel", "javascript:alert(1)"), tie("inline")).map(([h, c]) => `<a href="${h}">${c}</a>`) },
  ),
  block: fc.oneof(
    { weight: 3, arbitrary: fc.tuple(fc.constantFrom("p", "h1", "h2", "h3", "h6", "blockquote", "pre"), style, fc.array(tie("inline"), { maxLength: 3 })).map(([t, s, c]) => `<${t}${s}>${c.join("")}</${t}>`) },
    { weight: 2, arbitrary: fc.tuple(fc.constantFrom("div", "section", "article", "aside", "nav"), style, fc.array(tie("node"), { maxLength: 3 })).map(([t, s, c]) => `<${t}${s}>${c.join("")}</${t}>`) },
    { weight: 1, arbitrary: fc.tuple(fc.constantFrom("ul", "ol"), fc.array(fc.array(tie("node"), { maxLength: 2 }), { minLength: 1, maxLength: 3 })).map(([t, items]) => `<${t}>${items.map((i) => `<li>${i.join("")}</li>`).join("")}</${t}>`) },
    { weight: 1, arbitrary: fc.array(fc.array(tie("inline"), { maxLength: 2 }), { minLength: 1, maxLength: 3 }).map((cells) => `<table><tr>${cells.map((c) => `<td>${c.join("")}</td>`).join("")}</tr></table>`) },
    { weight: 1, arbitrary: fc.constantFrom("<hr>", '<img src="https://a.example/i.png" alt="x">', "<p></p>", "<p>&nbsp;</p>", "<figure><img src=\"/f.png\"><figcaption>Cap</figcaption></figure>") },
  ),
  node: fc.oneof({ weight: 2, arbitrary: tie("block") }, { weight: 1, arbitrary: tie("inline") }),
})).node.chain((first) => fc.array(fc.oneof(html_block_or_node()), { maxLength: 6 }).map((rest) => [first, ...rest].join("")));

function html_block_or_node() {
  return fc.constantFrom(
    "<p>One more ordinary paragraph of article prose that makes this paste long enough to be scored.</p>",
    '<div class="related"><ul><li><a href="/1">One</a></li><li><a href="/2">Two</a></li></ul></div>',
    "<p></p>",
    "",
  );
}

const clean = (input: string, options: ParseOptions) => toHTML(parseHTML(input, { dom: linkedomDom, ...options }).blocks);

describe("idempotence: cleaning cleaned HTML changes nothing", () => {
  for (const [name, options] of [
    ["paste defaults", {}],
    ["strict", { mode: "strict" }],
    ["noise off, blanks kept (the editor's value path)", { clean: { noise: false, emptyParagraphs: "keep" } }],
    ["limited tools", { tools: ["heading", "bold", "link"] }],
  ] as [string, ParseOptions][]) {
    it(name, () => {
      fc.assert(
        fc.property(html, (input) => {
          const once = clean(input, options);
          expect(clean(once, options)).toBe(once);
        }),
        { numRuns: 300 },
      );
    });
  }
});

describe("empty paragraphs", () => {
  const blocks = (input: string, options: ParseOptions = {}) =>
    parseHTML(input, { dom: linkedomDom, ...options }).blocks.map((b) => (b.content as { text: string }[] | undefined)?.map((c) => c.text).join("") ?? "");

  it("collapses runs and trims the edges", () => {
    expect(blocks("<p></p><p>&nbsp;</p><p>a</p><p><br></p><p></p><p>&nbsp;</p><p>b</p><p></p><p></p>")).toEqual(["a", "", "b"]);
  });

  it("keeps a single spacer and WordPress <!-- more --> paragraphs between content", () => {
    expect(blocks("<p>a</p><p><!-- more --></p><p>b</p>")).toEqual(["a", "", "b"]);
  });

  it("collapses inside children too", () => {
    const [item] = parseHTML("<ul><li>a<p></p><p></p><h3>h</h3><p></p></li></ul>", { dom: linkedomDom }).blocks;
    expect(item.children).toHaveLength(1);
  });

  it("keeps every blank line with emptyParagraphs: keep", () => {
    expect(blocks("<p></p><p>a</p><p></p><p></p>", { clean: { emptyParagraphs: "keep" } })).toEqual(["", "a", "", ""]);
  });

  it("reports what it removed", () => {
    const { report } = parseHTML("<p>a</p><p></p><p></p><p>b</p>", { dom: linkedomDom });
    expect(report.dropped).toContainEqual({ tag: "p", reason: "noise", count: 1 });
    expect(report.score).toBe(1);
  });
});
