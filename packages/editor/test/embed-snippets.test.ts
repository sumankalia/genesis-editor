import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  defineEmbedProvider,
  embedForMarkup,
  embedForSnippet,
  embedRegistry,
  embedSnippetHTML,
  getEmbedFrameSrc,
  getEmbedScriptSrc,
  snippetLines,
  WIDGET_SANDBOX,
  widgetDocument,
} from "../src/parser";

const registry = embedRegistry({}, [], { origin: "https://app.test" });
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/embed-snippets", `${name}.html`), "utf8");
const body = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};
const el = (html: string) => body(html).firstElementChild!;

/** fixture → provider, page URL, first fallback line (or "" for none). */
const fixtures: [string, string, string, string][] = [
  ["twitter", "twitter", "https://x.com/jack/status/20?ref_src=twsrc%5Etfw", "just setting up my twttr"],
  ["instagram", "instagram", "https://www.instagram.com/p/CuE2WNQs6vH/?utm_source=ig_embed&utm_campaign=loading", "View this post on Instagram"],
  ["tiktok", "tiktok", "https://www.tiktok.com/@scout2015/video/6718335390845095173", "@scout2015 Scramble up ur name & I’ll try to guess it😍❤️ #foryoupage ♬ original sound - tiff"],
  ["threads", "threads", "https://www.threads.net/@_edent_/post/C-3dQXkOq6Q", "Post by @_edent_"],
  ["bluesky", "bluesky", "https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/3my43eyfzs225", "no kings includes billionaires who think they’re kings"],
  ["reddit", "reddit", "https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama_president_of_the_united_states/", "I am Barack Obama, President of the United States -- AMA"],
  ["facebook-post", "facebook", "https://www.facebook.com/20531316728/posts/10154009990506729/", "Posted by Facebook on Thursday, August 27, 2015"],
  ["facebook-video", "facebook", "https://www.facebook.com/facebook/videos/10153231379946729/", "How to Share With Just Friends"],
  ["pinterest", "pinterest", "https://www.pinterest.com/pin/99360735500167749/", ""],
  ["tumblr", "tumblr", "https://embed.tumblr.com/embed/post/t:0aY0xL2Fi1OFJg4YxpmegQ/828009069026721792", "https://www.tumblr.com/staff/828009069026721792/premium-just-got-better"],
  ["mastodon", "mastodon", "https://mastodon.social/@Gargron/117457641525342383", "Post by @Gargron@mastodon.social"],
  ["linkedin", "linkedin", "https://www.linkedin.com/feed/update/urn:li:share:6898694772484112384/", ""],
  ["imgur", "imgur", "https://imgur.com/pva2rXL", "Never give up"],
  ["imgur-album", "imgur", "https://imgur.com/a/lKOEEdd", "Papa Bear Bakehouse"],
  ["flickr", "flickr", "https://www.flickr.com/photos/toniphotos/55595519577/", "golden light by Toni_V, on Flickr"],
  ["giphy", "giphy", "https://giphy.com/gifs/3o7aD2saalBwwftBIY", ""],
  ["telegram", "telegram", "https://t.me/durov/43", ""],
  ["gist", "gist", "https://gist.github.com/mbostock/1353700", ""],
  ["spotify", "spotify", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", ""],
  ["soundcloud", "soundcloud", "https://api.soundcloud.com/tracks/293", ""],
];

describe("real-world embed code", () => {
  it.each(fixtures)("%s", (name, provider, url, firstLine) => {
    const found = embedForMarkup(body(fixture(name)), registry);
    expect(found?.resolved.provider).toBe(provider);
    expect(found?.resolved.url).toBe(url);
    expect(found?.fallback.split("\n")[0]).toBe(firstLine);
  });

  it("keeps the snippet's lines and sizes", () => {
    expect(embedForMarkup(body(fixture("twitter")), registry)?.fallback).toBe("just setting up my twttr\n— jack (@jack) March 21, 2006");
    expect(embedForMarkup(body(fixture("reddit")), registry)?.size).toEqual({ height: 316 });
    expect(embedForMarkup(body(fixture("flickr")), registry)?.size).toEqual({ aspectRatio: "1024/741" });
    expect(embedForMarkup(body(fixture("giphy")), registry)?.aspectRatio).toBe("478/288");
    expect(embedForMarkup(body(fixture("facebook-video")), registry)?.resolved.frame).toMatchObject({ aspectRatio: "16/9" });
  });

  it("only reads script-only snippets; Gist renders as a sandboxed widget", () => {
    const gist = embedForMarkup(body(fixture("gist")), registry)!;
    expect(gist.resolved).toMatchObject({ render: "widget", frame: { src: "https://gist.github.com/mbostock/1353700.js", sandbox: WIDGET_SANDBOX } });
    expect(gist.resolved.frame.sandbox).not.toContain("allow-same-origin");
    const doc = widgetDocument(gist.resolved, "", registry)!;
    expect(doc).toContain('<script src="https://gist.github.com/mbostock/1353700.js" charset="utf-8"></script>');
    expect(doc).toContain("genesisEmbedHeight");
    expect(widgetDocument(embedForMarkup(body(fixture("twitter")), registry)!.resolved, "", registry)).toBeNull();
  });

  it("never takes a script URL from the paste", () => {
    const fake = el('<script src="https://gist.github.com.evil.test/a/0123456789abcdef0123.js"></script>');
    expect(embedForSnippet(fake, registry)).toBeNull();
    const telegram = el('<script src="https://evil.test/x.js" data-telegram-post="durov/43"></script>');
    const found = embedForSnippet(telegram, registry)!;
    expect(found.resolved.frame.src).toBe("https://t.me/durov/43?embed=1");
    expect(embedForSnippet(el('<script data-telegram-post="durov/43&quot;onload=x"></script>'), registry)).toBeNull();
  });

  it("Mastodon servers that aren't listed become sandboxed generic frames", () => {
    const other = el('<blockquote class="mastodon-embed" data-embed-url="https://social.example.org/@ann/1234567/embed"><a href="https://social.example.org/@ann/1234567">Post by @ann</a></blockquote>');
    expect(embedForSnippet(other, registry)?.resolved).toMatchObject({ provider: "", frame: { src: "https://social.example.org/@ann/1234567/embed" } });
    expect(embedForSnippet(other, embedRegistry({ policy: "allowlist" }))).toBeNull();
  });

  it("plain quotes and lookalikes stay quotes", () => {
    expect(embedForSnippet(el("<blockquote><p>A quote</p></blockquote>"), registry)).toBeNull();
    expect(embedForSnippet(el('<blockquote class="twitter-tweet"><a href="https://evil.test/status/1">x</a></blockquote>'), registry)).toBeNull();
    expect(embedForSnippet(el('<blockquote class="bluesky-embed" data-bluesky-uri="at://alice.bsky.social/app.bsky.feed.post/3my43eyfzs225"></blockquote>'), registry)).toBeNull();
  });
});

describe("fallback text", () => {
  it("one line per paragraph or <br>, without scripts, styles or icons", () => {
    expect(snippetLines(el("<blockquote><p>One</p>  two <b>three</b><br>four<svg><text>x</text></svg><style>p{}</style></blockquote>"))).toEqual(["One", "two three", "four"]);
  });

  it("a snippet that only links its own URL has no fallback", () => {
    const pin = '<a data-pin-do="embedPin" href="https://www.pinterest.com/pin/99360735500167749/">https://www.pinterest.com/pin/99360735500167749/</a>';
    expect(embedForMarkup(body(pin), registry)?.fallback).toBe("");
  });
});

describe("canonical snippets", () => {
  it.each(["twitter", "instagram", "tiktok", "threads", "bluesky", "reddit", "facebook-post", "facebook-video", "pinterest", "tumblr", "mastodon", "imgur", "imgur-album"])(
    "%s exports back to its own code, which reads back the same",
    (name) => {
      const found = embedForMarkup(body(fixture(name)), registry)!;
      const html = embedSnippetHTML(found.resolved, found.fallback, registry)!;
      expect(html).not.toMatch(/<script/i);
      const again = embedForMarkup(body(html), registry)!;
      expect(again.resolved.url).toBe(found.resolved.url);
      expect(again.fallback).toBe(found.fallback);
    },
  );

  it("escapes stored text", () => {
    const found = embedForMarkup(body(fixture("twitter")), registry)!;
    expect(embedSnippetHTML(found.resolved, '<img src=x onerror=alert(1)>\n"quoted"', registry)).toBe(
      '<blockquote class="twitter-tweet"><p>&lt;img src=x onerror=alert(1)&gt;</p><p><a href="https://x.com/jack/status/20?ref_src=twsrc%5Etfw">"quoted"</a></p></blockquote>',
    );
  });

  it("LinkedIn, GIPHY, Flickr and Spotify have no snippet form", () => {
    for (const name of ["linkedin", "giphy", "flickr", "spotify"]) {
      const found = embedForMarkup(body(fixture(name)), registry)!;
      expect(embedSnippetHTML(found.resolved, found.fallback, registry), name).toBeNull();
    }
  });
});

describe("plugin providers", () => {
  const acme = defineEmbedProvider({
    name: "acme",
    label: "Acme",
    match: [/^https:\/\/acme\.test\/p\/(\d+)$/],
    frameOrigins: ["https://embed.acme.test"],
    snippet: {
      selector: "blockquote.acme-post",
      url: (node) => node.getAttribute("data-url"),
      toHTML: (url, html) => `<blockquote class="acme-post" data-url="${url}">${html}</blockquote>`,
      script: "https://embed.acme.test/widget.js",
    },
    toEmbed: (_url, m) => ({ src: `https://embed.acme.test/${m[1]}`, height: 300 }),
  });

  it("declare snippet matchers too", () => {
    const reg = embedRegistry({}, [acme]);
    const found = embedForMarkup(body('<blockquote class="acme-post" data-url="https://acme.test/p/7"><p>Hello</p></blockquote><script src="https://embed.acme.test/widget.js"></script>'), reg);
    expect(found).toMatchObject({ resolved: { provider: "acme", frame: { src: "https://embed.acme.test/7" } }, fallback: "Hello", snippet: true });
  });

  it("widget providers need a script", () => {
    expect(() => defineEmbedProvider({ ...acme, name: "w", render: "widget", snippet: { ...acme.snippet!, script: undefined } })).toThrow(/script/);
  });

  it("CSP: widget scripts are script-src, not frame-src", () => {
    expect(getEmbedFrameSrc({ policy: "allowlist" })).not.toContain("https://gist.github.com");
    expect(getEmbedScriptSrc()).toEqual(["https://gist.github.com"]);
  });
});
