import { describe, expect, it } from "vitest";

import { parseHTML, toHTML, type HtmlBlock } from "../src/parser";

const parse = (html: string, options = {}) => parseHTML(html, options);
const first = (html: string, options = {}) => parse(html, options).blocks[0];

describe("iframes", () => {
  it("become provider embeds, rebuilt from the template; pasted sandbox/allow are ignored", () => {
    const { blocks, report } = parse(
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc" width="560" height="315" sandbox="allow-same-origin allow-top-navigation" allow="camera" onload="x()" style="position:fixed" title="Rick"></iframe>',
    );
    expect(blocks).toEqual([
      {
        type: "embed",
        props: {
          provider: "youtube",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
          aspectRatio: "16/9",
          title: "Rick",
        },
      },
    ]);
    expect(report.embeds).toEqual({ provider: 1, generic: 0, blocked: 0 });
  });

  it("Instagram iframes keep only the post URL, not the tracking query or the embedding page", () => {
    const src = (path: string) =>
      `https://www.instagram.com/${path}/embed/captioned/?cr=1&amp;v=14&amp;wp=1080&amp;rd=https%3A%2F%2Fcms.example&amp;rp=%2Fedit-article%2Fsecret-draft-42`;
    const { blocks } = parse(`<iframe src="${src("p/AbCdE123_x")}"></iframe><iframe src="${src("someone/reel/ZyX-98765")}"></iframe>`);
    expect(blocks.map((b) => b.props?.url)).toEqual(["https://www.instagram.com/p/AbCdE123_x/", "https://www.instagram.com/reel/ZyX-98765/"]);
    expect(blocks[0].props?.embedUrl).toBe("https://www.instagram.com/p/AbCdE123_x/embed");
    const html = toHTML(blocks);
    expect(html).not.toContain("edit-article");
    expect(html).not.toContain("cms.example");
  });

  it("unknown https iframes become sandboxed generic embeds sized from width/height", () => {
    expect(first('<iframe src="https://widgets.example.org/poll?id=3" width="600" height="400"></iframe>')).toEqual({
      type: "embed",
      props: { provider: "", url: "https://widgets.example.org/poll?id=3", embedUrl: "https://widgets.example.org/poll?id=3", aspectRatio: "600/400" },
    });
    expect(first('<iframe src="https://widgets.example.org/w" width="100%"></iframe>')?.props?.aspectRatio).toBe("16/9");
  });

  it("allowlist and strict turn unknown iframes into links, and count them as blocked", () => {
    for (const options of [{ embeds: { policy: "allowlist" as const } }, { mode: "strict" as const }]) {
      const { blocks, report } = parse('<iframe src="https://widgets.example.org/w" title="Poll"></iframe>', options);
      expect(blocks[0]).toEqual({ type: "paragraph", content: [{ type: "link", href: "https://widgets.example.org/w", content: [{ type: "text", text: "Poll", styles: {} }] }] });
      expect(report.embeds.blocked).toBe(1);
    }
    expect(first('<iframe src="https://player.vimeo.com/video/76979871"></iframe>', { embeds: { policy: "allowlist" } })?.type).toBe("embed");
  });

  it("drops script-scheme and tracker iframes", () => {
    expect(parse('<iframe src="javascript:alert(1)"></iframe>').blocks).toEqual([]);
    expect(parse('<iframe src="data:text/html,<b>x</b>"></iframe>').blocks).toEqual([]);
    expect(parse('<iframe src="https://googleads.g.doubleclick.net/pagead/ads"></iframe>').report.dropped[0]).toMatchObject({ reason: "tracking" });
  });

  it("http provider iframes are upgraded through the template", () => {
    expect(first('<iframe src="http://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')?.props?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });
});

describe("site embed markup", () => {
  it("tweets become embeds and their script is dropped; with the tool off they stay quotes", () => {
    const html = '<blockquote class="twitter-tweet"><p lang="en">just setting up my twttr</p>&mdash; jack (@jack) <a href="https://twitter.com/jack/status/20">March 21, 2006</a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>';
    expect(parse(html).blocks).toEqual([
      {
        type: "embed",
        props: {
          provider: "twitter",
          url: "https://twitter.com/jack/status/20",
          embedUrl: "https://platform.twitter.com/embed/Tweet.html?id=20",
          height: 500,
          fallback: "just setting up my twttr\n— jack (@jack) March 21, 2006",
          snippet: true,
        },
      },
    ]);
    expect(first(html, { tools: ["quote", "link"] })?.type).toBe("quote");
  });
});

describe("export and round trip", () => {
  const youtube: HtmlBlock = {
    type: "embed",
    props: { provider: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", aspectRatio: "16/9", title: "Rick", caption: "A classic", previewWidth: 480 },
  };
  const generic: HtmlBlock = {
    type: "embed",
    props: { provider: "", url: "https://widgets.example.org/w", embedUrl: "https://widgets.example.org/w", aspectRatio: "600/400" },
  };
  const tweet: HtmlBlock = {
    type: "embed",
    props: { provider: "twitter", url: "https://x.com/jack/status/20", embedUrl: "https://platform.twitter.com/embed/Tweet.html?id=20", height: 500 },
  };

  it("writes a figure with our own iframe attributes", () => {
    const html = toHTML([youtube, generic]);
    expect(html).toContain('<figure data-genesis-embed data-provider="youtube" data-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" data-aspect-ratio="16/9" data-preview-width="480" data-title="Rick" style="max-width:480px">');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain("<figcaption>A classic</figcaption>");
    const genericHtml = toHTML([generic]);
    expect(genericHtml).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"');
    expect(genericHtml).toContain('referrerpolicy="no-referrer"');
    expect(genericHtml).toContain(" credentialless");
    expect(genericHtml).not.toContain("allow-same-origin");
    expect(genericHtml).not.toContain(" allow=");
  });

  it("both forms read back to the same blocks", () => {
    for (const embeds of ["iframe", "link"] as const) {
      const html = toHTML([youtube, generic, tweet], { embeds });
      expect(parse(html).blocks, embeds).toEqual([youtube, generic, tweet]);
      expect(toHTML(parse(html).blocks, { embeds })).toBe(html);
    }
    expect(toHTML([youtube], { embeds: "link" })).toContain('<a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">Rick</a>');
    expect(toHTML([youtube], { embeds: "link" })).not.toContain("<iframe");
  });

  it("never trusts a stored embedUrl or data-provider", () => {
    const forged: HtmlBlock = { type: "embed", props: { provider: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", embedUrl: "https://evil.test/steal" } };
    expect(toHTML([forged])).not.toContain("evil.test");
    const html = '<figure data-genesis-embed data-provider="youtube" data-url="https://evil.test/x"><iframe src="https://evil.test/x"></iframe></figure>';
    expect(first(html)?.props).toMatchObject({ provider: "", embedUrl: "https://evil.test/x" });
    expect(toHTML(parse(html).blocks)).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"');
    const bad: HtmlBlock = { type: "embed", props: { provider: "", url: "javascript:alert(1)", embedUrl: "javascript:alert(1)" } };
    expect(toHTML([bad])).toBe("");
  });

  it("embeds the policy refuses export as links", () => {
    const blocked = parse(toHTML([generic]), { embeds: { policy: "allowlist" } });
    expect(blocked.blocks[0]?.type).toBe("paragraph");
  });
});
