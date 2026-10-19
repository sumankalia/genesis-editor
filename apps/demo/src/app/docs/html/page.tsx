import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "HTML & paste" };

const htmlFormat = `const [html, setHtml] = useState("<h2>Hello</h2><p>World</p>");

<BlockEditor format="html" value={html} onChange={(next) => setHtml(next)} />`;

const changeInfo = `<BlockEditor
  format="html"
  defaultValue={savedHtml}
  onChange={(html, { blocks, report, editor }) => save(html)}
  onImportReport={(report) => console.log(report.score, report.dropped)}
  htmlMode="strict"              // snap custom colors to the palette
  baseUrl="https://example.com/" // resolve relative links and images
/>`;

const cleanOptions = `<BlockEditor
  clean={{
    keepSelectors: [".callout"],   // never removed
    dropSelectors: [".disclaimer"], // always removed
    phrases: ["Werbung"],           // more furniture phrases
  }}
  cleanupToast={false}              // hide the toast; read report.cleanup instead
/>`;

const refMethods = `const editor = useRef<BlockEditorHandle>(null);

editor.current.getHTML();               // "<h2>Hello</h2>\\n<p>World</p>"
const report = editor.current.setHTML(html);
editor.current.lastReport;              // the report from the last import`;

const metaOptions = `<BlockEditor
  meta={{
    policy: "strip-on-export", // keep meta in the document, leave it out of onChange/getBlocks/getHTML
    trackProvenance: true,     // stamp imported blocks with meta.import
  }}
/>

import { stripMeta } from "genesis-editor";
const publicJson = stripMeta(blocks);           // or ref.current.getBlocks({ meta: "strip" })`;

const metaShape = `{
  "type": "heading",
  "props": { "level": 2 },
  "content": [{ "type": "text", "text": "Launch notes", "styles": {} }],
  "meta": { "v": 1, "attrs": { "id": "launch", "lang": "en" } }
}`;

const serverUse = `import { parseHTML, toHTML } from "genesis-editor/parser";
import { linkedomDom } from "genesis-editor/parser/linkedom";
// or: import { jsdomDom } from "genesis-editor/parser/jsdom";

const { blocks, report } = parseHTML(html, { dom: linkedomDom, tools: ["heading", "bold", "link"] });
const clean = toHTML(blocks);

// Any DOM library works: a DOMParser class or instance, or a function returning a Document.
parseHTML(html, { dom: (doc) => new JSDOM(doc).window.document });`;

export default function HtmlPage() {
  return (
    <>
      <DocsHeader
        title="HTML & paste"
        description="Load and save HTML instead of blocks, and paste content from Google Docs, Word, and web pages without carrying their markup along."
      />

      <H2>HTML in, HTML out</H2>
      <p>
        Set <code>format=&quot;html&quot;</code> and <code>value</code>, <code>defaultValue</code>,
        and <code>onChange</code> carry HTML strings. Incoming HTML is cleaned, sanitized, and mapped
        to blocks; outgoing HTML is plain semantic markup that loads back to the same document.{" "}
        <Link href="/docs/markdown">Markdown import</Link> uses the same engine after converting
        CommonMark to HTML.
      </p>
      <CodeBlock code={htmlFormat} />
      <p>Edit either side: the editor and the HTML stay in sync.</p>
      <Example name="html-value" minHeight={320} />
      <Callout>
        A controlled <code>value</code> is parsed only when it differs from the HTML the editor last
        emitted, so passing <code>onChange</code>&apos;s HTML straight back costs nothing and never
        moves the cursor. <code>onChange</code> runs at most every 150 ms while typing, and once
        more when the editor unmounts if an edit is pending.
      </Callout>

      <H3>Options</H3>
      <CodeBlock code={changeInfo} />
      <p>
        <code>tools</code> applies to HTML too: content for a tool that&apos;s off is downgraded,
        for example a heading becomes a paragraph, so whatever loads can be edited.
      </p>

      <H2>Preview</H2>
      <p>
        The playground and <Link href="/paste">paste landing</Link> can show{" "}
        <strong>Edit | Preview</strong>. Preview renders <code>getHTML()</code> with{" "}
        <code>genesis-editor/article.css</code> on a <code>.genesis-article</code> wrapper and no
        editor chrome — the same markup a host would store, with the editor&apos;s block gaps, links,
        and code, not a pixel match of Google Docs.
      </p>

      <H2>Pasting</H2>
      <p>
        HTML pasted from outside the editor goes through the same engine, in every{" "}
        <code>format</code>. Scripts, event handlers, unsafe URLs, hidden elements, tracking pixels,
        and <code>utm_</code> parameters are removed; wrapper elements and inline styles become
        blocks and formatting. The pasted blocks are inserted as one undo step, and a leading
        paragraph joins the paragraph at the cursor. Copying and pasting inside the editor keeps
        BlockNote&apos;s own lossless clipboard, and pastes into code blocks stay plain text.
      </p>
      <p>
        A paste of a single paragraph goes in at the cursor. Anything longer splits the block at
        the cursor: the text after it joins the last pasted paragraph, or stays a block of its own
        type when the paste ends with something else.
      </p>

      <H3>Page furniture</H3>
      <p>
        Larger pastes from web pages also lose their navigation, cookie banners, share bars,
        related-post lists, newsletter boxes, and comments. A full page is cut down to its{" "}
        <code>article</code> or <code>main</code>, and other containers are scored on their class
        names, link density, and wording, so it takes several signals to remove anything. Quotes,
        figures, tables, code, and list items are never scored. A toast says what was removed and
        offers <strong>Undo cleanup</strong>, which pastes the same content again without it.
        Pastes under 3 blocks or 500 characters are left alone.
      </p>
      <CodeBlock code={cleanOptions} />
      <p>
        Try the samples: <strong>Paste</strong> inserts them directly, and <strong>Copy</strong>{" "}
        puts them on your clipboard to paste yourself. <strong>Blog page</strong> shows the
        cleanup toast.
      </p>
      <Example name="html-paste" minHeight={300} />

      <H3>Whitespace and JSON-encoded HTML</H3>
      <p>
        Spaces follow HTML&apos;s rules, and <code>&amp;nbsp;</code> padding next to other spaces
        collapses too, so pasted text doesn&apos;t keep double or trailing spaces. Exported HTML
        keeps intentional spacing in <code>white-space:pre-wrap</code> spans and reads back the same.
      </p>
      <p>
        HTML copied from an API response, DevTools, or a <code>.json</code> file arrives
        JSON-encoded, with <code>\n</code> and <code>\&quot;</code> escapes. The parser decodes it
        when the encoding is unambiguous (a quoted JSON string, JSON holding HTML strings, or
        escapes that are clearly structural) and adds a warning to the report. Pass{" "}
        <code>decodeEscaped: false</code> to <code>parseHTML</code> to turn this off.
      </p>

      <H3>Import report</H3>
      <p>
        Every import (the initial HTML <code>value</code>, <code>setHTML</code>, or a paste) calls{" "}
        <code>onImportReport</code> with a <code>FidelityReport</code>: a 0–1 score, the elements
        dropped and why, wrappers unwrapped, downgrades, colors, headings, and images. The
        latest one is also on the ref as <code>lastReport</code>.
      </p>
      <CodeBlock code={refMethods} />

      <H2>Block metadata</H2>
      <p>
        What a block can&apos;t show but shouldn&apos;t lose is kept in its <code>meta</code>: the
        source element&apos;s <code>id</code>, <code>lang</code>, and <code>dir</code>, and where a
        block came from, such as a quote&apos;s attribution. It&apos;s a top-level object on the
        block, so databases can query it, and it&apos;s left out when there&apos;s nothing to keep.
      </p>
      <CodeBlock code={metaShape} />
      <p>
        <code>meta</code> moves with its block through copy and paste, drag, undo, and
        collaboration. Splitting a block copies it to both halves, except <code>attrs.id</code>,
        which stays on the first; a pasted <code>id</code> that already exists in the document is
        dropped. HTML export writes only <code>id</code>, <code>lang</code>, and <code>dir</code>,
        and the clipboard&apos;s HTML for other apps never carries it.
      </p>
      <CodeBlock code={metaOptions} />
      <p>
        <code>meta.v</code> is the schema version. Older versions are migrated when a document
        loads, and meta from a newer version is kept as it is. Integrators and plugins can store
        their own data under <code>meta.ext[name]</code>.
      </p>
      <Example name="block-meta" minHeight={360} />

      <H3>Quotes and images</H3>
      <p>
        Quotes keep every paragraph and their <code>&lt;cite&gt;</code> attribution as children,
        drawn inside the quote and exported inside <code>&lt;blockquote&gt;</code>, plus the{" "}
        <code>cite</code> source URL. Images keep <code>alt</code> apart from the file name, along
        with <code>srcset</code>/<code>sizes</code>, the intrinsic <code>width</code> and{" "}
        <code>height</code>, a surrounding link (<code>href</code>), and a formatted caption
        (<code>captionRich</code>, used on export until the caption is edited). Replacing an
        image&apos;s file clears the old <code>srcset</code>. An <code>&lt;img&gt;</code> inside a
        table cell (or a paragraph) is kept as an inline image: same URL, upload and re-hosting as
        image blocks, resize capped to the cell, alt text, and an optional link. Export is{" "}
        <code>&lt;td&gt;&lt;img data-genesis-inline&gt;</code>. Browser copies that wrap the
        article (Chrome/Safari/Firefox), <code>&lt;picture&gt;</code>/<code>srcset</code>, and lazy{" "}
        <code>data-src</code> are recovered. An empty header row of empty <code>&lt;th&gt;</code>s
        is dropped as noise, an image that links to itself loses the link, and empty heading
        anchors are dropped. A one-row image-beside-text table, or a floated image with wrapping
        copy, becomes a <Link href="/docs/columns">columns</Link> block instead of a data table.
      </p>

      <H2>On the server</H2>
      <p>
        The parser is a separate entry point without React or BlockNote, so it also runs in Node,
        workers, and edge functions, from <code>import</code> or <code>require</code> on Node 18
        and newer. Pass a DOM implementation, such as the optional <code>linkedom</code> or{" "}
        <code>jsdom</code> peer:
      </p>
      <CodeBlock code={serverUse} />
      <p>
        Every option and report field is listed in the{" "}
        <Link href="/docs/api#parser">API reference</Link>.
      </p>
    </>
  );
}
