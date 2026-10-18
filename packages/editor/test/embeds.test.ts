import { describe, expect, it } from "vitest";

import {
  BUILT_IN_EMBED_PROVIDERS,
  defineEmbedProvider,
  embedForElement,
  embedForIframe,
  embedForUrl,
  embedRegistry,
  GENERIC_SANDBOX,
  getEmbedFrameSrc,
  resolveEmbedBlock,
} from "../src/parser";

const registry = embedRegistry({}, [], { origin: "https://app.test" });

const cases: [string, string, string][] = [
  ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42"],
  ["youtube", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["youtube", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["vimeo", "https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
  ["vimeo", "https://vimeo.com/76979871/abcdef1234", "https://player.vimeo.com/video/76979871?h=abcdef1234"],
  ["tiktok", "https://www.tiktok.com/@scout2015/video/6718335390845095173", "https://www.tiktok.com/embed/v2/6718335390845095173"],
  ["instagram", "https://www.instagram.com/p/CuE2WNQs6vH/", "https://www.instagram.com/p/CuE2WNQs6vH/embed"],
  ["instagram", "https://www.instagram.com/reel/CuE2WNQs6vH", "https://www.instagram.com/reel/CuE2WNQs6vH/embed"],
  ["twitter", "https://x.com/jack/status/20", "https://platform.twitter.com/embed/Tweet.html?id=20"],
  ["twitter", "https://twitter.com/NASA/status/1712345678901234567", "https://platform.twitter.com/embed/Tweet.html?id=1712345678901234567"],
  ["spotify", "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT"],
  ["loom", "https://www.loom.com/share/0123456789abcdef0123456789abcdef", "https://www.loom.com/embed/0123456789abcdef0123456789abcdef"],
  ["codepen", "https://codepen.io/team/pen/abcDEF", "https://codepen.io/team/embed/abcDEF?default-tab=result"],
  ["figma", "https://www.figma.com/design/AbCdEfGhIjKlMn/Name?node-id=1-2", "https://embed.figma.com/design/AbCdEfGhIjKlMn?embed-host=genesis&node-id=1-2"],
  ["googleMaps", "https://www.google.com/maps/place/Eiffel+Tower", "https://maps.google.com/maps?q=Eiffel%20Tower&output=embed"],
  ["dailymotion", "https://www.dailymotion.com/video/x8abc12", "https://www.dailymotion.com/embed/video/x8abc12"],
  ["soundcloud", "https://soundcloud.com/artist/track-name", "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack-name&visual=false"],
  ["codesandbox", "https://codesandbox.io/s/new-abc12", "https://codesandbox.io/embed/new-abc12"],
  ["googleDocs", "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUv/edit", "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUv/embed"],
  ["airtable", "https://airtable.com/shrAbCdEfGhIjKlMn", "https://airtable.com/embed/shrAbCdEfGhIjKlMn"],
  ["typeform", "https://acme.typeform.com/to/AbC123", "https://form.typeform.com/to/AbC123"],
  ["miro", "https://miro.com/app/board/uXjVAbCd=/", "https://miro.com/app/live-embed/uXjVAbCd=/"],
  ["canva", "https://www.canva.com/design/DAFabc123/xyz987abc/view", "https://www.canva.com/design/DAFabc123/xyz987abc/view?embed"],
  ["appleMusic", "https://music.apple.com/us/album/name/1440857781?i=1440858013", "https://embed.music.apple.com/us/album/name/1440857781?i=1440858013"],
  ["applePodcasts", "https://podcasts.apple.com/us/podcast/the-show/id1200361736", "https://embed.podcasts.apple.com/us/podcast/the-show/id1200361736"],
  ["threads", "https://www.threads.com/@_edent_/post/C-3dQXkOq6Q?xmt=abc", "https://www.threads.net/@_edent_/post/C-3dQXkOq6Q/embed/"],
  ["bluesky", "https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/3my43eyfzs225", "https://embed.bsky.app/embed/did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3my43eyfzs225"],
  ["reddit", "https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama_president_of_the_united_states/", "https://embed.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama_president_of_the_united_states/?embed=true"],
  ["reddit", "https://old.reddit.com/r/IAmA/comments/z1c9z", "https://embed.reddit.com/r/IAmA/comments/z1c9z/_/?embed=true"],
  ["facebook", "https://www.facebook.com/20531316728/posts/10154009990506729/", "https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2F20531316728%2Fposts%2F10154009990506729%2F&show_text=true&width=500"],
  ["facebook", "https://www.facebook.com/watch/?v=10153231379946729", "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D10153231379946729&show_text=false&width=500"],
  ["pinterest", "https://www.pinterest.com/pin/99360735500167749/", "https://assets.pinterest.com/ext/embed.html?id=99360735500167749"],
  ["pinterest", "https://in.pinterest.com/pin/next-stop--99360735500167749/", "https://assets.pinterest.com/ext/embed.html?id=99360735500167749"],
  ["tumblr", "https://embed.tumblr.com/embed/post/t:0aY0xL2Fi1OFJg4YxpmegQ/828009069026721792", "https://embed.tumblr.com/embed/post/t:0aY0xL2Fi1OFJg4YxpmegQ/828009069026721792/v2"],
  ["mastodon", "https://mastodon.social/@Gargron/117457641525342383", "https://mastodon.social/@Gargron/117457641525342383/embed"],
  ["linkedin", "https://www.linkedin.com/posts/peterdiamandis_5-discoveries-activity-6898694773406875648-z-D7", "https://www.linkedin.com/embed/feed/update/urn:li:activity:6898694773406875648"],
  ["linkedin", "https://www.linkedin.com/feed/update/urn:li:share:6898694772484112384/", "https://www.linkedin.com/embed/feed/update/urn:li:share:6898694772484112384"],
  ["imgur", "https://imgur.com/pva2rXL", "https://imgur.com/pva2rXL/embed?pub=true"],
  ["imgur", "https://imgur.com/gallery/papa-bear-bakehouse-lKOEEdd", "https://imgur.com/a/lKOEEdd/embed?pub=true"],
  ["flickr", "https://www.flickr.com/photos/toniphotos/55595519577/in/explore", "https://www.flickr.com/photos/toniphotos/55595519577/player/"],
  ["giphy", "https://giphy.com/gifs/nehumanesociety-3o7aD2saalBwwftBIY", "https://giphy.com/embed/3o7aD2saalBwwftBIY"],
  ["telegram", "https://t.me/durov/43", "https://t.me/durov/43?embed=1"],
  ["gist", "https://gist.github.com/mbostock/1353700", "https://gist.github.com/mbostock/1353700.js"],
];

describe("embed providers", () => {
  it.each(cases)("%s: %s", (provider, url, src) => {
    const embed = embedForUrl(url, registry);
    expect(embed?.provider).toBe(provider);
    expect(embed?.frame.src).toBe(src);
  });

  it("covers every built-in", () => {
    expect(new Set(cases.map((c) => c[0]))).toEqual(new Set(BUILT_IN_EMBED_PROVIDERS.map((p) => p.name)));
  });

  it("sizes: 16/9, shorts 9/16, fixed heights", () => {
    expect(embedForUrl("https://youtu.be/dQw4w9WgXcQ", registry)?.frame.aspectRatio).toBe("16/9");
    expect(embedForUrl("https://youtube.com/shorts/dQw4w9WgXcQ", registry)?.frame).toMatchObject({ aspectRatio: "9/16", maxWidth: 360 });
    expect(embedForUrl("https://x.com/jack/status/20", registry)?.frame.height).toBe(500);
    expect(embedForUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", registry)?.frame.height).toBe(352);
  });

  it("ignores look-alike hosts and URLs that only mention a provider", () => {
    for (const url of [
      "https://evil.test/?u=https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
      "https://notyoutu.be/dQw4w9WgXcQ",
      "javascript:alert(1)//https://youtu.be/dQw4w9WgXcQ",
      "https://example.com/",
    ]) {
      expect(embedForUrl(url, registry), url).toBeNull();
    }
  });
});

describe("pasted iframes", () => {
  it("map back to providers, rebuilt from the template", () => {
    expect(embedForIframe("https://www.youtube.com/embed/dQw4w9WgXcQ?si=x", registry)).toMatchObject({
      provider: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      frame: { src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" },
    });
    expect(embedForIframe("https://player.vimeo.com/video/76979871?h=abcdef1234&badge=0", registry)?.url).toBe("https://vimeo.com/76979871/abcdef1234");
    expect(embedForIframe("https://platform.twitter.com/embed/Tweet.html?id=20", registry)?.url).toBe("https://x.com/i/status/20");
    expect(embedForIframe("https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3?utm_source=generator", registry)?.url).toBe("https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3");
    expect(embedForIframe("https://codepen.io/team/embed/preview/abcDEF?default-tab=result", registry)?.url).toBe("https://codepen.io/team/pen/abcDEF");
    expect(embedForIframe("https://www.dailymotion.com/embed/video/x8abc12", registry)?.url).toBe("https://www.dailymotion.com/video/x8abc12");
    expect(embedForIframe("https://codesandbox.io/embed/new-abc12?fontsize=14", registry)?.url).toBe("https://codesandbox.io/s/new-abc12");
    expect(embedForIframe("https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUv/embed?start=false", registry)?.url).toBe("https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUv/edit");
    expect(embedForIframe("https://airtable.com/embed/shrAbCdEfGhIjKlMn", registry)?.url).toBe("https://airtable.com/shrAbCdEfGhIjKlMn");
    expect(embedForIframe("https://miro.com/app/live-embed/uXjVAbCd=/", registry)?.url).toBe("https://miro.com/app/board/uXjVAbCd=/");
    expect(embedForIframe("https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2624.99", registry)).toMatchObject({ provider: "googleMaps" });
    expect(embedForIframe("https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/293", registry)?.provider).toBe("soundcloud");
    expect(embedForIframe("https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Ffile%2FAbCdEfGhIjKlMn%2FX", registry)?.provider).toBe("figma");
  });

  it("fall back to a sandboxed generic embed: https only, never the app's origin", () => {
    expect(embedForIframe("https://widgets.example.org/w?id=1", registry)).toMatchObject({
      provider: "",
      url: "https://widgets.example.org/w?id=1",
      frame: { src: "https://widgets.example.org/w?id=1", sandbox: GENERIC_SANDBOX },
    });
    expect(GENERIC_SANDBOX).not.toContain("allow-same-origin");
    expect(embedForIframe("http://widgets.example.org/w", registry)).toBeNull();
    expect(embedForIframe("https://app.test/admin", registry)).toBeNull();
    expect(embedForIframe("https://user:pw@widgets.example.org/", registry)).toBeNull();
    expect(embedForIframe("javascript:alert(1)", registry)).toBeNull();
    expect(embedForIframe("data:text/html,<script>alert(1)</script>", registry)).toBeNull();
  });

  it("allowlist and strict allow providers only", () => {
    const allowlist = embedRegistry({ policy: "allowlist" }, [], { origin: "https://app.test" });
    expect(embedForIframe("https://widgets.example.org/w", allowlist)).toBeNull();
    expect(embedForIframe("https://www.youtube.com/embed/dQw4w9WgXcQ", allowlist)?.provider).toBe("youtube");
    expect(embedRegistry({}, [], { strict: true }).generic).toBe(false);
    const onlyVimeo = embedRegistry({ providers: ["vimeo"] });
    expect(embedForUrl("https://youtu.be/dQw4w9WgXcQ", onlyVimeo)).toBeNull();
    expect(embedForUrl("https://vimeo.com/76979871", onlyVimeo)?.provider).toBe("vimeo");
  });
});

describe("site embed markup", () => {
  const el = (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.firstElementChild!;
  };

  it("reads tweets, Instagram posts and TikToks", () => {
    const tweet = el('<blockquote class="twitter-tweet"><p>hi</p>&mdash; Jack (@jack) <a href="https://twitter.com/jack/status/20?ref_src=twsrc">March 21, 2006</a></blockquote>');
    expect(embedForElement(tweet, registry)).toMatchObject({ provider: "twitter", frame: { src: "https://platform.twitter.com/embed/Tweet.html?id=20" } });
    const insta = el('<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/CuE2WNQs6vH/?utm_source=ig_embed"></blockquote>');
    expect(embedForElement(insta, registry)?.provider).toBe("instagram");
    const tiktok = el('<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@scout2015/video/6718335390845095173"></blockquote>');
    expect(embedForElement(tiktok, registry)?.provider).toBe("tiktok");
    expect(embedForElement(el("<blockquote>plain</blockquote>"), registry)).toBeNull();
  });
});

describe("stored blocks", () => {
  it("rebuild provider frames from the page URL and never trust a stored embedUrl", () => {
    const resolved = resolveEmbedBlock({ provider: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", embedUrl: "https://evil.test/" }, registry);
    expect(resolved?.frame.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(resolveEmbedBlock({ provider: "youtube", url: "https://evil.test/" }, registry)).toBeNull();
    expect(resolveEmbedBlock({ provider: "", embedUrl: "https://widgets.example.org/" }, registry)?.frame.sandbox).toBe(GENERIC_SANDBOX);
    expect(resolveEmbedBlock({ provider: "", embedUrl: "https://app.test/" }, registry)).toBeNull();
  });
});

describe("custom providers and CSP", () => {
  const acme = defineEmbedProvider({
    name: "acme",
    label: "Acme",
    match: [/^https:\/\/acme\.test\/v\/(\d+)$/],
    frameOrigins: ["https://player.acme.test"],
    toEmbed: (_url, m) => ({ src: `https://player.acme.test/${m[1]}`, height: 300 }),
  });

  it("custom providers come first and are validated", () => {
    const reg = embedRegistry({}, [acme]);
    expect(embedForUrl("https://acme.test/v/7", reg)).toMatchObject({ provider: "acme", frame: { src: "https://player.acme.test/7", height: 300 } });
    const sneaky = { ...acme, name: "sneaky", toEmbed: () => ({ src: "https://evil.test/" }) };
    expect(embedForUrl("https://acme.test/v/7", embedRegistry({ providers: ["sneaky"] }, [sneaky]))).toBeNull();
    expect(() => defineEmbedProvider({ ...acme, frameOrigins: ["http://x.test"] })).toThrow(/https/);
  });

  it("getEmbedFrameSrc lists provider origins, plus https: when generic embeds are on", () => {
    expect(getEmbedFrameSrc({ policy: "allowlist", providers: ["youtube", "vimeo"] })).toEqual(["https://www.youtube-nocookie.com", "https://player.vimeo.com"]);
    expect(getEmbedFrameSrc()).toContain("https:");
    expect(getEmbedFrameSrc({ providers: ["acme"] }, [acme])).toEqual(["https://player.acme.test", "https:"]);
  });
});
