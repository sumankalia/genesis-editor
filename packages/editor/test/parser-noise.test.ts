import { describe, expect, it } from "vitest";

import { parseHTML } from "../src/parser/parse";
import { toHTML } from "../src/parser/serialize";
import type { ParseOptions } from "../src/parser/types";

const filler = Array.from(
  { length: 6 },
  (_, i) => `<p>Paragraph ${i + 1} of the story has enough ordinary prose to count as content, with a sentence or two about the topic at hand.</p>`,
).join("");

function parse(html: string, options: ParseOptions = {}) {
  const result = parseHTML(html, options);
  return { ...result, html: toHTML(result.blocks) };
}

describe("noise removal (§9 layers 3–5)", () => {
  it("skips small pastes", () => {
    const { html, report } = parse(`<div class="share-bar social"><a href="/a">Share on X</a></div><p>Hi</p>`);
    expect(html).toContain("Share on X");
    expect(report.cleanup).toEqual({ sections: 0, labels: [], skipped: "small" });
  });

  it("removes containers that combine two signals", () => {
    const { html, report } = parse(`${filler}<div class="share-bar social"><a href="/a">Share on X</a></div>`);
    expect(html).not.toContain("Share on X");
    expect(report.cleanup).toEqual({ sections: 1, labels: ["share"] });
    expect(report.dropped).toContainEqual(expect.objectContaining({ tag: "div", reason: "noise", preview: "Share on X" }));
    expect(report.score).toBe(1);
  });

  it("needs more than one weak signal", () => {
    const { html } = parse(`${filler}<div class="related"><p>Related reading is part of this story.</p></div>`);
    expect(html).toContain("Related reading");
  });

  it("splits class tokens on dashes, underscores, and camelCase, not substrings", () => {
    expect(parse(`${filler}<div class="shadow-box loaded"><p>Shadow box</p></div><div class="adWrap sponsorBlock"><p>Buy now</p></div>`).html).toMatch(/Shadow box(?![\s\S]*Buy now)/);
    expect(parse(`${filler}<div id="newsletter_signup"><p>Join</p></div>`).html).not.toContain("Join");
  });

  it("removes lists of short links and icon-only bars", () => {
    const { html, report } = parse(
      `${filler}<ul class="menu"><li><a href="/a">Home</a></li><li><a href="/b">Blog</a></li><li><a href="/c">About us</a></li></ul>` +
        `<div class="social"><a href="/x"><svg viewBox="0 0 1 1"></svg></a><a href="/y"><svg viewBox="0 0 1 1"></svg></a></div>`,
    );
    expect(html).not.toMatch(/Home|About us/);
    expect(report.cleanup.sections).toBe(2);
    expect(report.cleanup.labels).toEqual(["menu", "social"]);
  });

  it("keeps link lists that are content", () => {
    const { html } = parse(`${filler}<p>Sources:</p><ul><li><a href="/a">The design</a></li><li><a href="/b">The harness</a></li></ul>`);
    expect(html).toContain("The harness");
  });

  it("never scores protected content", () => {
    const { html } = parse(
      `${filler}<blockquote><div class="share social">Quoted share text</div></blockquote>` +
        `<ul><li><div class="promo ads">List item promo</div></li></ul>`,
    );
    expect(html).toContain("Quoted share text");
    expect(html).toContain("List item promo");
  });

  it("keeps containers with real content despite negative tokens", () => {
    const long = "This sidebar holds a long explanation that readers need, written as plain prose without links. ".repeat(3);
    expect(parse(`${filler}<div class="sidebar widget"><p>${long}</p></div>`).html).toContain("This sidebar holds");
  });

  it("matches phrases only when they are most of the text", () => {
    const { html } = parse(`${filler}<div class="promo"><p>Advertisement</p></div><div class="promo"><p>We read more books in winter, and this paragraph is about that.</p></div>`);
    expect(html).not.toContain("Advertisement");
    expect(html).toContain("We read more books");
  });

  it("honors keepSelectors, dropSelectors, extra phrases, and noise: false", () => {
    const bar = `<div class="share-bar social" data-keep><a href="/a">Share on X</a></div>`;
    expect(parse(`${filler}${bar}`, { clean: { keepSelectors: ["[data-keep]"] } }).html).toContain("Share on X");
    expect(parse(`${filler}${bar}`, { clean: { noise: false } }).report.cleanup.skipped).toBe("off");
    const dropped = parse(`<p>Hi</p><p class="disclaimer">Legal</p>`, { clean: { dropSelectors: [".disclaimer"] } });
    expect(dropped.html).not.toContain("Legal");
    expect(dropped.report.cleanup).toEqual({ sections: 1, labels: ["custom"], skipped: "small" });
    expect(parse(`${filler}<div class="promo"><p>Werbung</p></div>`, { clean: { phrases: ["Werbung"] } }).html).not.toContain("Werbung");
  });

  it("drops page landmarks but not headers inside an article", () => {
    const { html, report } = parse(
      `<nav><a href="/">Home</a></nav><header><p>Site banner</p></header>${filler}` +
        `<article><header><h2>Article header</h2></header>${filler}</article><footer><p>Copyright</p></footer>`,
    );
    expect(html).not.toMatch(/Home|Site banner|Copyright/);
    expect(html).toContain("Article header");
    expect(report.cleanup.labels).toEqual(expect.arrayContaining(["navigation", "header", "footer"]));
  });
});

describe("main-content scoping (layer 3)", () => {
  const page = (main: string, extra = "") =>
    `<html><body><div class="top"><h1>The title</h1></div><div class="intro"><p>Outside text that is not in the article at all.</p></div>${main}${extra}</body></html>`;

  it("keeps only the article of a full page, plus an h1 outside it", () => {
    const { blocks, html } = parse(page(`<article>${filler}</article>`));
    expect(blocks[0]).toMatchObject({ type: "heading", props: { level: 1 } });
    expect(html).not.toContain("Outside text");
    expect(html).toContain("Paragraph 4");
  });

  it("prefers itemprop=articleBody, and picks the longest article", () => {
    const { html } = parse(page(`<article><p>Card: a short teaser.</p></article><article><div itemprop="articleBody">${filler}</div><p>Byline below body</p></article>`));
    expect(html).not.toMatch(/Card: a short|Byline below/);
  });

  it("doesn't scope fragments or to a small article", () => {
    expect(parse(`<div><p>Before the article.</p></div><article>${filler}</article>`).html).toContain("Before the article");
    expect(parse(page(`<article><p>Teaser.</p></article>`, filler)).html).toContain("Outside text");
  });
});

describe("idempotence with cleanup on", () => {
  it("re-parsing cleaned output removes nothing more", () => {
    const first = parse(
      `<html><body><nav><a href="/">Home</a></nav><article><h1>Title</h1>${filler}` +
        `<p>Related: <a href="/a">one</a>, <a href="/b">two</a>, <a href="/c">three</a></p>` +
        `<ul><li><a href="/a">Read more</a></li><li><a href="/b">Sign up</a></li></ul></article></body></html>`,
    );
    const again = parse(first.html);
    expect(again.blocks).toEqual(first.blocks);
    expect(again.html).toBe(first.html);
  });
});
