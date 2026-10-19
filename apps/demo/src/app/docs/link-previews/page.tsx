import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Link previews" };

const endpoint = `<BlockEditor linkPreview={{ endpoint: "/api/link-preview" }} />
// GET /api/link-preview?url=https%3A%2F%2Fexample.com%2Fpost
// → { "title": "…", "description": "…", "image": "https://…/og.png", "siteName": "…", "favicon": "https://…/favicon.ico" }

<BlockEditor linkPreview={{ endpoint: "/api/link-preview", method: "POST", headers: async () => ({ Authorization: await token() }) }} />
// POST /api/link-preview  { "url": "https://example.com/post" }`;

const resolve = `<BlockEditor
  linkPreview={{
    resolve: async (url, { signal }) => {
      const response = await fetch(\`https://api.example.com/unfurl?url=\${encodeURIComponent(url)}\`, { signal });
      if (!response.ok) return null; // no card: the URL stays a link
      const meta = await response.json();
      return { title: meta.title, description: meta.summary, image: meta.thumbnail, siteName: meta.publisher };
    },
  }}
/>`;

const exported = `<a href="https://example.com/post" data-genesis-link-preview data-title="A post" data-description="What it's about"
   data-image="https://example.com/og.png" data-site-name="Example" data-favicon="https://example.com/favicon.ico">
  <img src="https://example.com/og.png" alt=""> <strong>A post</strong> <span>What it's about</span> <small>Example · example.com</small>
</a>`;

const block = `{
  type: "linkPreview",
  props: { url, title, description, image, siteName, favicon },
}`;

const imageLink = `<a href="https://example.com/" target="_blank" rel="noopener noreferrer"><img src="…" alt="…"></a>`;

export default function LinkPreviewsPage() {
  return (
    <>
      <DocsHeader
        title="Link previews"
        description="Links to other sites as cards with the page's title, description, image and site name, plus links on images."
      />

      <H2>Cards</H2>
      <ul>
        <li>
          <strong>Paste a link on its own line.</strong> A URL alone on a line, or a pasted
          paragraph that is only a link, becomes a card. Press <kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd>{" "}
          once to get the link back. A URL inside a sentence stays a link, and links an{" "}
          <Link href="/docs/embeds">embed provider</Link> handles become embeds instead.
        </li>
        <li>
          <strong>Type <code>/Link preview</code></strong> and paste a link into the box.
        </li>
        <li>
          <strong>Turn a link into a card</strong> with the card button in the formatting toolbar,
          on a line that is only a link. <em>Convert to link</em> in the card&apos;s bar goes back.
        </li>
      </ul>
      <Example name="link-previews" minHeight={620} />
      <p>
        A new card shows <em>Loading preview…</em> while the metadata is fetched. When the lookup
        fails or the page has no title, description or image, the card turns back into a plain
        link. The metadata is stored in the block, so a saved document draws its cards without
        fetching anything; a read-only editor never fetches.
      </p>

      <H2 id="config">Where the metadata comes from</H2>
      <p>
        Previews are off until you configure a source, the same way uploads are. Without one, URLs
        stay links and the <code>/Link preview</code> item isn&apos;t offered.
      </p>
      <H3>An endpoint</H3>
      <CodeBlock code={endpoint} />
      <p>
        Every field is optional. Relative <code>image</code> and <code>favicon</code> URLs are
        resolved against the page.
      </p>
      <H3>Your own lookup</H3>
      <CodeBlock code={resolve} />
      <Callout>
        Your endpoint fetches pages users paste, so it must refuse private, loopback and link-local
        addresses (SSRF), check every redirect, cap the download and time out. The demo&apos;s{" "}
        <code>/api/mock-link-preview</code> does all of that, reads Open Graph and Twitter tags with
        patterns (the page is never run), and caches results in memory only.
      </Callout>

      <H2 id="safety">What&apos;s stored</H2>
      <CodeBlock code={block} />
      <p>
        Whatever the source returns is cleaned before it is stored, and again on export and import:
        text becomes one line of plain text with control characters removed (title up to 300
        characters, description 1,000, site name 100), and <code>image</code> and{" "}
        <code>favicon</code> must be absolute <code>http(s)</code> URLs. Images load with{" "}
        <code>referrerpolicy=&quot;no-referrer&quot;</code> and disappear if they fail.
      </p>

      <H2 id="html">HTML</H2>
      <p>
        <code>getHTML()</code> and <code>toHTML</code> write a card as one <code>&lt;a&gt;</code>,
        which reads as a link with its image and text anywhere, and back to the same block in{" "}
        <code>parseHTML</code>:
      </p>
      <CodeBlock code={exported} lang="tsx" />
      <p>
        With the <code>linkPreview</code> tool off (see <Link href="/docs/tools">Tools</Link>), a
        card in loaded or pasted HTML becomes a link paragraph with the card&apos;s title, and the
        import report counts it under <code>downgrades</code>.
      </p>

      <H2 id="image-links">Links on images</H2>
      <p>
        Select an image and use the link button in its toolbar to add, edit or remove a link, and to
        open it in a new tab. A linked image shows where it points in the editor; clicking the image
        still selects it. Links must be <code>http</code>, <code>https</code>, <code>mailto</code>,{" "}
        <code>tel</code> or relative; <code>javascript:</code> and other schemes are refused. On
        export:
      </p>
      <CodeBlock code={imageLink} lang="tsx" />
      <p>
        Pasted and loaded <code>&lt;a href&gt;&lt;img&gt;&lt;/a&gt;</code> keeps the link, and{" "}
        <code>target=&quot;_blank&quot;</code> sets <em>Open in a new tab</em>.
      </p>
    </>
  );
}
