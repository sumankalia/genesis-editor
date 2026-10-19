import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Markdown" };

const markdownFormat = `const [markdown, setMarkdown] = useState("# Hello\\n\\nWorld");

<BlockEditor format="markdown" value={markdown} onChange={(next) => setMarkdown(next)} />`;

const refMethods = `const editor = useRef<BlockEditorHandle>(null);

editor.current.getMarkdown();                 // lossy export
const report = editor.current.setMarkdown(md); // via the HTML engine
editor.current.lastReport;`;

const serverUse = `import { parseMarkdown, markdownToHTML } from "genesis-editor/parser";
import { linkedomDom } from "genesis-editor/parser/linkedom";

const { blocks, report } = parseMarkdown(md, { dom: linkedomDom, tools: ["heading", "bold", "link"] });
const html = markdownToHTML(md); // then parseHTML(html, { … }) if you already have HTML options`;

export default function MarkdownPage() {
  return (
    <>
      <DocsHeader
        title="Markdown"
        description="Load Markdown as HTML through the genesis engine: format=&quot;markdown&quot;, setMarkdown, and paste detection."
      />

      <H2>Markdown in, Markdown out</H2>
      <p>
        Set <code>format=&quot;markdown&quot;</code> and <code>value</code>, <code>defaultValue</code>,
        and <code>onChange</code> carry Markdown strings. Incoming Markdown is converted to HTML with{" "}
        <code>marked</code> (MIT) and parsed by the same engine as{" "}
        <Link href="/docs/html">HTML &amp; paste</Link>: sanitizing, tools, cleanup, and the import
        report still apply. Outgoing Markdown is BlockNote&apos;s lossy export, so echoing{" "}
        <code>onChange</code> back is stable even though it won&apos;t match the source character for
        character.
      </p>
      <CodeBlock code={markdownFormat} />
      <p>Edit either side: the editor and the Markdown stay in sync.</p>
      <Example name="markdown-value" minHeight={320} />
      <Callout>
        A controlled <code>value</code> is parsed only when it differs from the Markdown the editor
        last emitted, so passing <code>onChange</code>&apos;s string straight back costs nothing and
        never moves the cursor. <code>onChange</code> runs at most every 150 ms while typing.
      </Callout>

      <H2>Pasting</H2>
      <p>
        Plain-text Markdown from ChatGPT, GitHub, Slack, or a <code>.md</code> file is detected and
        imported through the HTML engine, in every <code>format</code>. Headings, lists, quotes, code
        fences, tables, rules, and Markdown links or images count; a lone URL or ordinary sentence
        stays with the default handler. Real HTML pastes still win: copying a rendered page keeps the{" "}
        <Link href="/docs/html">HTML path</Link>. A trivial <code>&lt;pre&gt;</code> or{" "}
        <code>&lt;div&gt;</code> wrapper around the same Markdown source is treated as Markdown.
      </p>
      <p>
        Inline links stay links. Scripts and <code>javascript:</code> URLs are stripped by the HTML
        engine after conversion. BlockNote&apos;s own clipboard and VS Code snippets are unchanged,
        and pastes into code blocks stay plain text.
      </p>
      <Example name="markdown-paste" minHeight={300} />

      <H3>Ref</H3>
      <p>
        <code>setMarkdown</code> replaces the document the same way <code>setHTML</code> does, and
        returns the import report. <code>getMarkdown</code> is the lossy export, in every format.
      </p>
      <CodeBlock code={refMethods} />

      <H2>On the server</H2>
      <p>
        <code>markdownToHTML</code>, <code>parseMarkdown</code>, and <code>parseMarkdownAsync</code>{" "}
        live on <code>genesis-editor/parser</code>. They do not sanitize on their own: always run the
        HTML they produce through <code>parseHTML</code> (which <code>parseMarkdown</code> already
        does).
      </p>
      <CodeBlock code={serverUse} />
      <p>
        Every option and report field is listed in the{" "}
        <Link href="/docs/api#parser">API reference</Link>.
      </p>
    </>
  );
}
