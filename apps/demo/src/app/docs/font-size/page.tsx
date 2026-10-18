import type { Metadata } from "next";
import Link from "next/link";
import { FONT_SIZES } from "genesis-editor/parser";

import { CodeBlock } from "@/components/site/code-block";
import { DocsHeader, H2 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Font size" };

const setup = `<BlockEditor tools={{ fontSize: true, bold: true, colors: true }} />

// Toolbar order: "fontSize" is a toolbar item id too.
<BlockEditor toolbar={["blockType", "bold", "italic", "fontSize", "colors", "link"]} />`;

const stored = `{ "type": "text", "text": "Small print", "styles": { "fontSize": "12px" } }`;
const exported = `<span style="font-size:12px" data-font-size="12px">Small print</span>`;

export default function FontSizePage() {
  return (
    <>
      <DocsHeader title="Font size" description="A size dropdown in the selection toolbar, with sizes from 6 to 20 px." />

      <Example name="font-size" minHeight={380} />

      <H2>Sizes</H2>
      <p>
        The dropdown offers <code>{FONT_SIZES.join(", ")}</code> px. 16 is the editor&apos;s body
        size: it&apos;s labelled <strong>Default</strong> and stores nothing. When the selection has
        more than one size, the dropdown shows <strong>—</strong>.
      </p>
      <ul>
        <li>
          <kbd>⌘⇧.</kbd> / <kbd>Ctrl+Shift+.</kbd> steps the selection up a size, and{" "}
          <kbd>⌘⇧,</kbd> / <kbd>Ctrl+Shift+,</kbd> steps it down.
        </li>
        <li>
          Headings and code blocks don&apos;t take a size: their level or style owns it, and the
          dropdown hides there.
        </li>
      </ul>
      <CodeBlock code={setup} />
      <p>Sizes are a style, like bold:</p>
      <CodeBlock code={stored} lang="json" />

      <H2 id="paste">Pasted sizes</H2>
      <p>
        Pasted text keeps its size <em>relative to the rest of what you pasted</em>, not its
        absolute size:
      </p>
      <ol>
        <li>
          Every size is converted to px: <code>pt</code> × 4/3; <code>em</code> and <code>%</code>{" "}
          of the parent; <code>rem</code> of 16; keywords such as <code>small</code> (13) and{" "}
          <code>x-large</code> (24).
        </li>
        <li>
          The size of most of the text, by length, becomes 16. A Google Doc in 11 pt pastes as
          Default, not as 14 px, and its 9 pt text as 14 px.
        </li>
        <li>
          The result is limited to 6–20 px and rounded to the nearest step (ties go up). Sizes
          outside the range count as <code>fontSizes.clamped</code> in the{" "}
          <Link href="/docs/html">import report</Link>.
        </li>
      </ol>
      <p>With the <code>fontSize</code> tool off, pasted sizes are dropped and reported under <code>unsupportedStyles</code>.</p>

      <H2 id="html">HTML</H2>
      <CodeBlock code={exported} lang="tsx" />
      <p>
        <code>data-font-size</code> marks a size the editor set itself: <code>parseHTML</code> reads
        it back exactly instead of comparing it with the rest of the document, so a document
        that&apos;s mostly 14 px stays that way.
      </p>
    </>
  );
}
