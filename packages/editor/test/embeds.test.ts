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
    expect(embedForIframe("https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3?utm_source=generator", registry)?.provider).toBe("spotify");
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
