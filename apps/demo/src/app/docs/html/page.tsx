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

const serverUse = `import { parseHTML, toHTML } from "genesis-editor/parser";
import { linkedomDom } from "genesis-editor/parser/linkedom";

const { blocks, report } = parseHTML(html, { dom: linkedomDom, tools: ["heading", "bold", "link"] });
const clean = toHTML(blocks);`;

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
        to blocks; outgoing HTML is plain semantic markup that loads back to the same document.
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

      <H3>Import report</H3>
      <p>
        Every import (the initial HTML <code>value</code>, <code>setHTML</code>, or a paste) calls{" "}
        <code>onImportReport</code> with a <code>FidelityReport</code>: a 0–1 score, the elements
        dropped and why, wrappers unwrapped, downgrades, colors, headings, and images. The
        latest one is also on the ref as <code>lastReport</code>.
      </p>
      <CodeBlock code={refMethods} />

      <H2>On the server</H2>
      <p>
        The parser is a separate entry point without React or BlockNote, so it also runs in Node,
        workers, and edge functions. Pass a DOM implementation, such as the optional{" "}
        <code>linkedom</code> peer:
      </p>
      <CodeBlock code={serverUse} />
      <p>
        Every option and report field is listed in the{" "}
        <Link href="/docs/api#parser">API reference</Link>.
      </p>
    </>
  );
}
