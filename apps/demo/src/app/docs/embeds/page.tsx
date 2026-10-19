import type { Metadata } from "next";
import Link from "next/link";
import { BUILT_IN_EMBED_PROVIDERS, GENERIC_SANDBOX, PROVIDER_SANDBOX, WIDGET_SANDBOX } from "genesis-editor/parser";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Embeds" };

const policy = `<BlockEditor embeds={{ policy: "open" }} />        // providers + sandboxed generic iframes (default)
<BlockEditor embeds={{ policy: "allowlist" }} />   // providers only; unknown iframes become links
<BlockEditor embeds={{ clickToLoad: true }} />     // wait for a click before loading the iframe
<BlockEditor embeds={{ providers: ["youtube", "vimeo", "loom"] }} />`;

const csp = `import { getEmbedFrameSrc } from "genesis-editor";

// next.config.ts, middleware, or your server's headers
const frameSrc = getEmbedFrameSrc({ policy: "allowlist" }).join(" ");
// → "https://www.youtube-nocookie.com https://player.vimeo.com https://www.tiktok.com …"
headers.set("Content-Security-Policy", \`frame-src \${frameSrc}\`);`;

const custom = `import { BlockEditor, defineEmbedProvider } from "genesis-editor";

const acme = defineEmbedProvider({
  name: "acme",
  label: "Acme Video",
  // Anchored page-URL patterns; capture groups go to toEmbed.
  match: [/^https:\\/\\/video\\.acme\\.com\\/v\\/(\\d+)$/],
  // The only origins toEmbed may return, and the CSP frame-src entries.
  frameOrigins: ["https://player.acme.com"],
  // Pasted <iframe src> → page URL, so iframe code maps to this provider too.
  fromIframe: (src) => src.host === "player.acme.com" ? \`https://video.acme.com/v\${src.pathname}\` : null,
  toEmbed: (url, [, id]) => ({ src: \`https://player.acme.com/\${id}\`, aspectRatio: "16/9" }),
});

<BlockEditor embedProviders={[acme]} />
// or in a plugin: definePlugin({ name: "acme", embeds: [acme] })`;

const exported = `<figure data-genesis-embed data-provider="youtube" data-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" data-aspect-ratio="16/9">
  <iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube embed" loading="lazy"
    referrerpolicy="strict-origin-when-cross-origin" sandbox="${PROVIDER_SANDBOX}"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" allowfullscreen
    style="width:100%;border:0;aspect-ratio:16/9"></iframe>
  <figcaption>Optional caption</figcaption>
</figure>`;

const linkForm = `import { toHTML } from "genesis-editor/parser";

toHTML(blocks, { embeds: "link" });
// <figure data-genesis-embed="link" data-provider="youtube" data-url="…"><a href="https://www.youtube.com/watch?v=…">YouTube: https://…</a></figure>`;

const snippetExport = `editor.getHTML();                          // default "auto": embed code back as embed code
// <figure data-genesis-embed="snippet" data-provider="twitter" data-url="https://twitter.com/jack/status/20" …>
//   <blockquote class="twitter-tweet"><p>just setting up my twttr</p><p><a href="…">— jack (@jack) March 21, 2006</a></p></blockquote>
// </figure>

editor.getHTML({ embedScripts: true });    // + each site's official <script>, once, for publishing elsewhere
editor.getHTML({ embeds: "iframe" });      // our sandboxed iframes; the text goes in data-fallback
editor.getHTML({ embeds: "link" });        // email and RSS: the text as a quote, then the link

// The same options on toHTML(blocks, options) from "genesis-editor/parser".`;

const customSnippet = `const acme = defineEmbedProvider({
  name: "acme",
  label: "Acme Posts",
  match: [/^https:\\/\\/acme\\.social\\/p\\/(\\d+)$/],
  frameOrigins: ["https://embed.acme.social"],
  toEmbed: (url, [, id]) => ({ src: \`https://embed.acme.social/p/\${id}\`, height: 480 }),
  snippet: {
    selector: "blockquote.acme-post",
    url: (el) => el.querySelector("a[href^='https://acme.social/p/']")?.getAttribute("href"),
    // Optional: written back on export (escape anything you add; body is already escaped).
    toHTML: (url, body) => \`<blockquote class="acme-post">\${body}</blockquote>\`,
    script: "https://acme.social/embed.js",
  },
});`;

/** Site, embed code read, how it's drawn, why. */
const approaches: [string, string, string, string][] = [
  ["X / Twitter", "blockquote.twitter-tweet", "Our iframe", "platform.twitter.com/embed/Tweet.html is the frame widgets.js itself loads."],
  ["Instagram", "blockquote.instagram-media", "Our iframe", "The /embed/ page is public and frameable."],
  ["TikTok", "blockquote.tiktok-embed", "Our iframe", "tiktok.com/embed/v2 is the player embed.js inserts."],
  ["Threads", "blockquote.text-post-media", "Our iframe", "threads.net …/embed/ is frameable (threads.com sends X-Frame-Options: DENY)."],
  ["Bluesky", "blockquote.bluesky-embed", "Our iframe", "embed.bsky.app takes the post's DID URI. Handle-only URLs stay links: the frame needs a DID."],
  ["Reddit", "blockquote.reddit-embed-bq", "Our iframe", "embed.reddit.com allows any ancestor. Reddit may block automated browsers."],
  ["Facebook", "div.fb-post, div.fb-video", "Our iframe", "The post.php / video.php plugins are the frames the SDK creates."],
  ["Pinterest", "a[data-pin-do=embedPin]", "Our iframe", "assets.pinterest.com/ext/embed.html is the frame pinit.js inserts."],
  ["Tumblr", "div.tumblr-post", "Our iframe", "embed.tumblr.com needs the snippet's key, so the embed URL is the stored URL."],
  ["Mastodon", "blockquote.mastodon-embed", "Our iframe", "Every server serves /@user/id/embed. Listed servers are providers; others become sandboxed generic embeds."],
  ["Imgur", "blockquote.imgur-embed-pub", "Our iframe", "imgur.com/…/embed is the frame embed.js inserts."],
  ["Flickr", "a[data-flickr-embed]", "Our iframe", "The photo's /player/ page. The widget writes the image itself, so export is the iframe."],
  ["Telegram", "script[data-telegram-post]", "Our iframe", "t.me/channel/id?embed=1 is the frame the widget script inserts."],
  ["GitHub Gist", "script[src^=gist.github.com]", "Sandboxed widget", "Script-only: it writes the gist into the page and has no frame URL."],
];

export default function EmbedsPage() {
  return (
    <>
      <DocsHeader
        title="Embeds"
        description={`Videos, posts, music, maps and design files from ${BUILT_IN_EMBED_PROVIDERS.length} providers, from links, iframe code or the sites' own embed code, plus sandboxed iframes from anywhere else.`}
      />

      <H2>Adding embeds</H2>
      <ul>
        <li>
          <strong>Paste a link on its own line.</strong> A provider URL alone on a line or in a
          pasted paragraph becomes an embed. Press <kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd> once to get
          the link back, or use <em>Convert to link</em> in the embed&apos;s bar. A URL inside a
          sentence stays a link, and links to other sites are never turned into frames.
        </li>
        <li>
          <strong>Paste iframe code</strong> from a site&apos;s &quot;Embed&quot; or
          &quot;Share&quot; dialog. Provider iframes are rebuilt from our own template; anything
          else becomes a sandboxed generic embed sized from its <code>width</code>/
          <code>height</code>.
        </li>
        <li>
          <strong>Paste a site&apos;s embed code</strong>, the <code>&lt;blockquote&gt;</code> plus{" "}
          <code>&lt;script&gt;</code> that X, Instagram, Bluesky, Threads, Reddit and others give
          you. See <a href="#embed-code">Embed code</a>.
        </li>
        <li>
          <strong>Paste a page with embeds.</strong> Iframes and the sites&apos; own markup become
          embeds; their scripts are dropped.
        </li>
        <li>
          <strong>Type <code>/embed</code></strong> and paste a link, embed code or iframe code into
          the box. This is the one place a link to an unknown site can become a (sandboxed) embed.
        </li>
      </ul>
      <Example name="embeds" minHeight={560} />
      <p>
        Every embed has a bar with the site, an editable caption, and an <em>Open ↗</em> link. Many
        sites refuse to be framed, and a page can&apos;t detect that across origins, so the link is
        always there. Drag the right edge to resize; the width is stored as{" "}
        <code>previewWidth</code> and exported.
      </p>
      <p>
        Iframes load on their own. Pass <code>embeds.clickToLoad: true</code> if you want a
        &quot;Load … embed&quot; button first, so a document full of videos doesn&apos;t talk to
        those sites until the reader asks.
      </p>

      <H2 id="embed-code">Embed code</H2>
      <p>
        Many sites&apos; &quot;Embed&quot; button gives a <code>&lt;blockquote&gt;</code> (or a{" "}
        <code>&lt;div&gt;</code> or <code>&lt;a&gt;</code>) holding the post&apos;s text, plus a{" "}
        <code>&lt;script&gt;</code> that swaps it for the real thing. The editor reads that code
        with or without its script: in pasted HTML, pasted as text (the &quot;Copy code&quot;
        button), in <code>value</code> / <code>setHTML</code>, and in the <code>/embed</code> box.
        The pasted script is never run or kept. Only the post&apos;s URL and readable text are.
      </p>
      <ul>
        <li>
          <strong>The text stays.</strong> The blockquote&apos;s lines are stored on the block (
          <code>fallback</code>). They show while the frame loads and when the policy refuses the
          embed. With the <code>embed</code> tool off, they become paragraphs above the link.
        </li>
        <li>
          <strong>It exports back as embed code.</strong> <code>getHTML()</code> writes the
          site&apos;s canonical snippet, rebuilt from the stored URL and text (never from the pasted
          markup), inside our figure. It reads as a quote anywhere, renders as the real post when
          published with the site&apos;s script, and reads back to the same block.
        </li>
      </ul>
      <Example name="embed-code" minHeight={760} />
      <H3>How each site is drawn</H3>
      <p>
        Wherever a site has a frame URL, we draw the post in our own sandboxed iframe, rebuilt from
        the post URL. The site&apos;s widget script is never loaded into your page. Only script-only
        embeds, which have no frame URL, run the site&apos;s official script, and only inside an
        opaque-origin <code>srcdoc</code> frame (<code>sandbox=&quot;{WIDGET_SANDBOX}&quot;</code>,
        no <code>allow-same-origin</code>).
      </p>
      <div className="not-prose my-6 overflow-x-auto" data-testid="embed-code-approaches">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1.5 pr-3 font-medium">Site</th>
              <th className="py-1.5 pr-3 font-medium">Embed code read</th>
              <th className="py-1.5 pr-3 font-medium">Drawn with</th>
              <th className="py-1.5 font-medium">Why</th>
            </tr>
          </thead>
          <tbody className="align-top">
            {approaches.map(([site, code, how, why]) => (
              <tr key={site} className="border-b last:border-0">
                <td className="py-1.5 pr-3 font-medium">{site}</td>
                <td className="py-1.5 pr-3 font-mono text-xs">{code}</td>
                <td className="py-1.5 pr-3">{how}</td>
                <td className="py-1.5 text-muted-foreground">{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Spotify, SoundCloud, YouTube, LinkedIn, Giphy and most others only give iframe code, which
        maps to the same providers. Instagram and TikTok frames ignore the embed&apos;s caption
        text; X frames show the live post.
      </p>
      <H3>Exporting embed code</H3>
      <CodeBlock code={snippetExport} />
      <Callout>
        Widget embeds (Gist) run the site&apos;s script inside the <code>srcdoc</code> frame, and
        that frame inherits your page&apos;s Content Security Policy. If you set one, add{" "}
        <code>getEmbedScriptSrc()</code> to <code>script-src</code> and allow the frame&apos;s
        one-line inline height reporter. Otherwise the frame keeps its default height.
      </Callout>
      <H3>Embed code for your own providers</H3>
      <p>
        A provider can declare a <code>snippet</code> matcher. Its <code>selector</code> may match
        a <code>blockquote</code>, <code>div</code>, <code>a</code> or <code>script</code>, and{" "}
        <code>url</code> reads the page URL from it. That URL must still pass the provider&apos;s{" "}
        <code>match</code>, so a look-alike snippet pointing elsewhere is ignored.
      </p>
      <CodeBlock code={customSnippet} />

      <H2>Providers</H2>
      <div className="not-prose my-6 flex flex-wrap gap-1.5" data-testid="embed-providers">
        {BUILT_IN_EMBED_PROVIDERS.map((provider) => (
          <span key={provider.name} className="rounded-md border px-2 py-0.5 text-xs">
            {provider.label} <span className="font-mono text-muted-foreground">{provider.name}</span>
          </span>
        ))}
      </div>
      <p>
        YouTube embeds use <code>youtube-nocookie.com</code>. Tweets use the plain iframe, not{" "}
        <code>widgets.js</code>. Sizes follow each site: 16:9 for video (9:16 for Shorts and
        TikTok), fixed heights for posts, players and forms.
      </p>

      <H2 id="policy">Policy and security</H2>
      <CodeBlock code={policy} />
      <ul>
        <li>
          Provider frames are rebuilt from the page URL every time they&apos;re drawn or exported,
          so a stored or pasted <code>src</code> is never trusted, and the result must load from the
          provider&apos;s <code>frameOrigins</code>. They get <code>sandbox=&quot;{PROVIDER_SANDBOX}&quot;</code>.
          That includes <code>allow-same-origin</code>, which is safe only because the frame&apos;s
          origin is the provider&apos;s, not yours.
        </li>
        <li>
          Generic frames must be <code>https:</code>, can&apos;t be your app&apos;s own origin, and
          get <code>sandbox=&quot;{GENERIC_SANDBOX}&quot;</code>: no <code>allow-same-origin</code>,
          forms or top navigation. They also get no <code>allow</code> features,{" "}
          <code>referrerpolicy=&quot;no-referrer&quot;</code>, and <code>credentialless</code>{" "}
          where the browser supports it.
        </li>
        <li>
          Pasted <code>sandbox</code>, <code>allow</code>, <code>style</code> and <code>on*</code>{" "}
          attributes are always dropped. Only <code>src</code>, <code>title</code>,{" "}
          <code>width</code> and <code>height</code> are read.
        </li>
      </ul>
      <Callout>
        <code>&quot;open&quot;</code> lets any author show any third-party page to readers, which
        is a way in for phishing look-alikes and trackers. Use <code>&quot;allowlist&quot;</code>{" "}
        for user-generated or multi-tenant content. <code>htmlMode=&quot;strict&quot;</code> also
        allows providers only.
      </Callout>
      <H3>Content Security Policy</H3>
      <p>
        <code>getEmbedFrameSrc()</code> lists the origins the enabled providers load from, plus{" "}
        <code>https:</code> when generic embeds are on.
      </p>
      <CodeBlock code={csp} />

      <H2 id="custom">Custom providers</H2>
      <CodeBlock code={custom} />
      <p>
        Custom providers are tried before the built-ins, and one named like a built-in replaces
        it. <code>embeds.providers</code> filters custom and built-in providers alike.
      </p>

      <H2 id="html">HTML</H2>
      <p>
        <code>getHTML()</code> and <code>toHTML</code> write a figure with our own iframe
        attributes, which <code>parseHTML</code> reads back to the same block:
      </p>
      <CodeBlock code={exported} lang="tsx" />
      <p>
        For email and RSS, where iframes don&apos;t work, write link cards instead. They read back
        to the same blocks too:
      </p>
      <CodeBlock code={linkForm} />
      <p>
        With the <code>embed</code> tool off, embeds in pasted or loaded HTML become link
        paragraphs (blockquote embed code stays a quote; an exported embed&apos;s text becomes
        paragraphs above its link), and the <Link href="/docs/html">import report</Link>{" "}
        counts them under <code>downgrades</code>. <code>report.embeds</code> counts provider
        embeds, generic embeds, and iframes the policy turned into links (<code>blocked</code>).
      </p>
    </>
  );
}
