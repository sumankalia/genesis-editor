import type { Metadata } from "next";
import Link from "next/link";
import { PALETTE } from "genesis-editor/parser";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Colors" };

const config = `<BlockEditor
  tools={{
    colors: {
      palette: true,   // the nine theme-aware colours (default)
      custom: true,    // document colours and Custom… (default)
      swatches: [{ name: "brand", hex: "#ff5a1f" }],
    },
  }}
  colorContrast="auto" // fix hex text that's hard to read on the current theme
/>`;

const stored = `{ "type": "text", "text": "Palette", "styles": { "textColor": "red" } }
{ "type": "text", "text": "Exact",   "styles": { "textColor": "#1f6feb", "backgroundColor": "#10b98140" } }
{ "type": "text", "text": "Brand",   "styles": { "textColor": "brand" } }`;

const exported = `<span style="color:#e03e3e" data-text-color="red">Palette</span>
<span style="color:#1f6feb;background-color:#10b98140">Exact</span>
<span style="color:#ff5a1f" data-text-color="brand">Brand</span>`;

const server = `import { toHTML, parseHTML } from "genesis-editor/parser";

const swatches = [{ name: "brand", hex: "#ff5a1f" }];
toHTML(blocks, { swatches });                       // brand → its hex, plus data-text-color="brand"
parseHTML(html, { tools: { colors: { swatches } } }); // data-text-color="brand" → "brand"`;

export default function ColorsPage() {
  return (
    <>
      <DocsHeader
        title="Colors"
        description="Theme-aware palette colours, your brand swatches and any exact hex, side by side."
      />

      <Example name="colors" minHeight={460} />

      <H2>Palette, swatches and hex</H2>
      <p>
        <code>textColor</code> and <code>backgroundColor</code> hold one of three kinds of value,
        never a mix:
      </p>
      <ul>
        <li>
          <strong>A palette name</strong>: <code>{Object.keys(PALETTE).join(", ")}</code>. These
          follow the theme, so red is lighter on a dark background.
        </li>
        <li>
          <strong>A swatch name</strong> from <code>tools.colors.swatches</code>, for brand
          colours. It renders as its hex in both themes.
        </li>
        <li>
          <strong>Lowercase hex</strong>, <code>#rrggbb</code>, plus <code>#rrggbbaa</code> for
          translucent backgrounds. It looks the same in both themes.
        </li>
      </ul>
      <p>
        <code>&quot;default&quot;</code> means no colour. Anything else, such as{" "}
        <code>rgb(…)</code> or uppercase hex set through the API, is drawn as the default.
      </p>
      <CodeBlock code={stored} lang="json" />

      <H2 id="picker">The color menu</H2>
      <p>The toolbar&apos;s colour button has a Text and a Background section, each with:</p>
      <ul>
        <li>Default and the nine palette colours;</li>
        <li>your brand swatches;</li>
        <li>
          <strong>Document colors</strong>: up to eight hex colours already used in the document,
          most used first;
        </li>
        <li>
          <strong>Recent</strong>: the last eight custom colours, kept in <code>localStorage</code>;
        </li>
        <li>
          <strong>Custom…</strong>: a hex (or any CSS colour) field, the system colour picker, and
          an eyedropper in browsers that have the <code>EyeDropper</code> API.
        </li>
      </ul>
      <p>Hover a hex swatch to see its value.</p>

      <H2 id="config">Options</H2>
      <CodeBlock code={config} />
      <ul>
        <li>
          <code>palette: false</code> hides the palette and stops pasted colours snapping to it.
        </li>
        <li>
          <code>custom: false</code> hides document colours and Custom…, and pasted hex that isn&apos;t
          close to a named colour goes to the palette colour for its hue. <code>htmlMode=&quot;strict&quot;</code>{" "}
          does the same.
        </li>
        <li>
          Swatch names are lowercase letters, digits and dashes, and can&apos;t be palette names.
          Invalid swatches are skipped.
        </li>
      </ul>
      <H3>Contrast</H3>
      <p>
        Hex colours don&apos;t adapt to the theme, so dark blue text can vanish in dark mode.{" "}
        <code>colorContrast=&quot;auto&quot;</code> lightens or darkens hex text that has less than
        3:1 contrast with the theme&apos;s background. Only the rendering changes; the stored colour
        and the exported HTML stay exact.
      </p>

      <H2 id="paste">Pasted colours</H2>
      <ul>
        <li>
          Any CSS colour is read: names, <code>rgb()</code>, <code>hsl()</code>, and 3-, 4-, 6- or
          8-digit hex. Transparent colours, <code>inherit</code> and <code>currentColor</code> are
          dropped.
        </li>
        <li>
          A colour within ΔE2000 3 of a palette colour or swatch becomes that name, so it follows the
          theme from then on.
        </li>
        <li>
          Near-black text (<code>#000</code>, <code>#1f1f1f</code>, <code>#333</code>…), white
          backgrounds, and the blue sites use for links count as the default.
        </li>
        <li>Everything else stays exact hex.</li>
      </ul>
      <p>
        The <Link href="/docs/html">import report</Link> counts pasted colours as{" "}
        <code>colors.palette</code> and <code>colors.hex</code>.
      </p>

      <H2 id="html">HTML</H2>
      <p>
        Every colour is written as an inline style, so email clients and RSS readers show it. Names
        also get a <code>data-</code> attribute, so they read back as the name:
      </p>
      <CodeBlock code={exported} lang="tsx" />
      <Callout>
        Swatch names only mean something with the same swatches. Pass them to <code>toHTML</code>{" "}
        and <code>parseHTML</code> on the server; the editor&apos;s <code>getHTML()</code> already
        uses its own.
      </Callout>
      <CodeBlock code={server} />
    </>
  );
}
