import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseHTML, toHTML, type HtmlBlock } from "../src/parser";

const dir = join(__dirname, "fixtures/embed-snippets");
const names = readdirSync(dir)
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""));
const fixture = (name: string) => readFileSync(join(dir, `${name}.html`), "utf8");

describe("embed code in pasted HTML", () => {
  it.each(names)("%s becomes one embed block, its script dropped", (name) => {
    const { blocks, report } = parseHTML(fixture(name));
    // Giphy's and SoundCloud's attribution links sit outside the embed code and stay paragraphs.
    expect(blocks.filter((b) => b.type === "embed")).toHaveLength(1);
    expect(blocks.slice(1).every((b) => b.type === "paragraph")).toBe(true);
    expect(blocks[0].type).toBe("embed");
    expect(JSON.stringify(blocks)).not.toMatch(/<script|widgets\.js|embed\.js/);
    expect(report.embeds.blocked).toBe(0);
  });

  it.each(names)("%s: every export form reads back to the same block", (name) => {
    const blocks = parseHTML(fixture(name)).blocks;
    for (const embeds of ["auto", "iframe", "link"] as const) {
      const html = toHTML(blocks, { embeds });
      expect(html, embeds).not.toContain("<script");
      expect(parseHTML(html).blocks, `${name} ${embeds}`).toEqual(blocks);
      expect(toHTML(parseHTML(html).blocks, { embeds }), `${name} ${embeds}`).toBe(html);
    }
  });

  it("keeps the snippet's text as the fallback and marks it as embed code", () => {
    const [tweet] = parseHTML(fixture("twitter")).blocks;
    expect(tweet.props).toMatchObject({ provider: "twitter", snippet: true, fallback: "just setting up my twttr\n— jack (@jack) March 21, 2006" });
    const [frame] = parseHTML(fixture("linkedin")).blocks;
    expect(frame.props?.snippet).toBeUndefined();
  });

  it("auto export writes the canonical blockquote (readable without the script); iframe export our own frame", () => {
    const blocks = parseHTML(fixture("twitter")).blocks;
    const auto = toHTML(blocks);
    expect(auto).toMatch(/^<figure data-genesis-embed="snippet" data-provider="twitter" data-url="https:\/\/x\.com\/jack\/status\/20[^"]*"[^>]*><blockquote class="twitter-tweet"/);
    expect(auto).toContain("<p>just setting up my twttr</p>");
    expect(auto).not.toContain("<iframe");
    const iframe = toHTML(blocks, { embeds: "iframe" });
    expect(iframe).toContain('<iframe src="https://platform.twitter.com/embed/Tweet.html?id=20"');
    expect(iframe).toContain('data-fallback="just setting up my twttr\n— jack (@jack) March 21, 2006"');
    expect(iframe).toContain(" data-snippet");
    const link = toHTML(blocks, { embeds: "link" });
    expect(link).toContain("<blockquote><p>just setting up my twttr</p><p>— jack (@jack) March 21, 2006</p></blockquote><a href=");
  });

  it("embedScripts appends each official script once", () => {
    const tweets = [...parseHTML(fixture("twitter")).blocks, ...parseHTML(fixture("twitter")).blocks];
    const html = toHTML([...tweets, ...parseHTML(fixture("instagram")).blocks], { embedScripts: true });
    expect(html.match(/platform\.twitter\.com\/widgets\.js/g)).toHaveLength(1);
    expect(html).toContain('<script async src="https://www.instagram.com/embed.js" charset="utf-8"></script>');
    expect(toHTML(parseHTML(html).blocks)).toBe(toHTML([...tweets, ...parseHTML(fixture("instagram")).blocks]));
    expect(toHTML(parseHTML(fixture("telegram")).blocks, { embedScripts: true })).toContain('data-telegram-post="durov/43"');
  });

  it("script-only code (Gist) is read before scripts are removed; the script never survives", () => {
    const [gist] = parseHTML('<p>Intro</p><script src="https://gist.github.com/mbostock/1353700.js"></script><p>Outro</p>').blocks.slice(1, 2);
    expect(gist).toMatchObject({ type: "embed", props: { provider: "gist", url: "https://gist.github.com/mbostock/1353700" } });
    expect(toHTML([gist])).toBe(
      '<figure data-genesis-embed="snippet" data-provider="gist" data-url="https://gist.github.com/mbostock/1353700" data-height="400"><p><a href="https://gist.github.com/mbostock/1353700">https://gist.github.com/mbostock/1353700</a></p></figure>',
    );
    expect(parseHTML('<script src="https://evil.test/gist.github.com/a/1.js"></script>').blocks).toEqual([]);
  });

  it("with the embed tool off, snippets keep their text and link", () => {
    const tools = ["quote", "link", "paragraph"] as const;
    expect(parseHTML(fixture("twitter"), { tools: [...tools] }).blocks[0].type).toBe("quote");
    const fromExport = parseHTML(toHTML(parseHTML(fixture("twitter")).blocks), { tools: [...tools] }).blocks as HtmlBlock[];
    expect(fromExport.map((b) => b.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(JSON.stringify(fromExport[0])).toContain("just setting up my twttr");
  });

  it("a forged figure can't smuggle another provider or an oversized fallback", () => {
    const forged = `<figure data-genesis-embed data-provider="twitter" data-url="https://evil.test/status/1" data-fallback="${"x".repeat(2000)}\n${"y\n".repeat(40)}"></figure>`;
    const [block] = parseHTML(forged).blocks;
    expect(block.props?.provider).toBe("");
    const fallback = String(block.props?.fallback);
    expect(fallback.split("\n")).toHaveLength(12);
    expect(fallback.split("\n")[0]).toHaveLength(500);
  });
});
