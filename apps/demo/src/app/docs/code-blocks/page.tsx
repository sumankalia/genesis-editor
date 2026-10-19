import type { Metadata } from "next";

import { CodeBlock } from "@/components/site/code-block";
import { DocsHeader, H2 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Code blocks" };

const html = `<pre><code class="language-typescript">export const n = 1;</code></pre>`;
const stored = `{ "type": "codeBlock", "props": { "language": "typescript" }, "content": [{ "type": "text", "text": "export const n = 1;", "styles": {} }] }`;

export default function CodeBlocksPage() {
  return (
    <>
      <DocsHeader
        title="Code blocks"
        description="A language picker and syntax highlighting, with HTML that still round-trips as a pre and code tag."
      />

      <Example name="code-blocks" minHeight={420} />

      <H2>Highlighting</H2>
      <p>
        Code blocks highlight with Shiki once a language other than Plain Text is set. The highlighter
        loads on first use, so it stays out of the editor&apos;s initial JavaScript. Themes follow the
        editor: <code>github-light</code> and <code>github-dark</code>.
      </p>
      <p>
        The dropdown includes JavaScript, TypeScript, Python, HTML, CSS, JSON, Shell, and the other
        common languages in <code>CODE_LANGUAGES</code>. Shortcut <code>```</code> still inserts a
        plain code block; pick a language afterwards, or load HTML that already has a{" "}
        <code>language-*</code> class.
      </p>

      <H2 id="html">HTML</H2>
      <CodeBlock code={html} />
      <p>
        Export writes the canonical id, so a paste of <code>language-ts</code> or{" "}
        <code>language-js</code> comes back as <code>language-typescript</code> and{" "}
        <code>language-javascript</code>. Unknown names are kept by the parser and become Plain Text
        in the editor, so the picker never throws.
      </p>
      <CodeBlock code={stored} lang="json" />
    </>
  );
}
