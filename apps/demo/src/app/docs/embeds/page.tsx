import type { Metadata } from "next";
import Link from "next/link";
import { BUILT_IN_EMBED_PROVIDERS, GENERIC_SANDBOX, PROVIDER_SANDBOX } from "genesis-editor/parser";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Embeds" };

const policy = `<BlockEditor embeds={{ policy: "open" }} />        // providers + sandboxed generic iframes (default)
<BlockEditor embeds={{ policy: "allowlist" }} />   // providers only; unknown iframes become links
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

export default function EmbedsPage() {
  return (
    <>
      <DocsHeader
        title="Embeds"
        description="Videos, posts, music, maps and design files from 20 providers, plus sandboxed iframes from anywhere else."
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
          <strong>Paste a page with embeds.</strong> Iframes and the sites&apos; own markup
          (<code>blockquote.twitter-tweet</code>, <code>.instagram-media</code>,{" "}
          <code>.tiktok-embed</code>) become embeds; their scripts are dropped.
        </li>
        <li>
          <strong>Type <code>/embed</code></strong> and paste a link or iframe code into the box.
          This is the one place a link to an unknown site can become a (sandboxed) embed.
        </li>
      </ul>
      <Example name="embeds" minHeight={560} />
      <p>
        Every embed has a bar with the site and an <em>Open ↗</em> link. Many sites refuse to be
        framed, and a page can&apos;t detect that across origins, so the link is always there.
      </p>

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
        paragraphs (tweets stay quotes), and the <Link href="/docs/html">import report</Link>{" "}
        counts them under <code>downgrades</code>. <code>report.embeds</code> counts provider
        embeds, generic embeds, and iframes the policy turned into links (<code>blocked</code>).
      </p>
    </>
  );
}
