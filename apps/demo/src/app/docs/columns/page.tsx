import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Columns" };

const insert = `// Slash: /Columns (two) or /3 columns
// Toolbar: Columns inserts two
<BlockEditor tools={["heading", "image", "columns", "bold"]} />
// Omit "columns" (or set columns: false) to turn the block off.`;

const json = `{
  "type": "columnList",
  "children": [
    { "type": "column", "props": { "width": 40 }, "children": [{ "type": "image", "props": { "url": "/examples/lake.png" } }] },
    { "type": "column", "props": { "width": 60 }, "children": [
      { "type": "heading", "props": { "level": 3 }, "content": "Mountain lake" },
      { "type": "paragraph", "content": "The same blocks as the rest of the document." }
    ]}
  ]
}`;

const html = `<table data-genesis-columns="2" data-genesis-column-widths="40,60" role="presentation"
       style="width:100%;border-collapse:collapse;table-layout:fixed">
  <colgroup><col style="width:40%"><col style="width:60%"></colgroup>
  <tbody><tr>
    <td style="width:40%;vertical-align:top">…</td>
    <td style="width:60%;vertical-align:top">…</td>
  </tr></tbody>
</table>`;

export default function ColumnsPage() {
  return (
    <>
      <DocsHeader
        title="Columns"
        description="Google Docs–style two- and three-column layouts: an image beside a heading and body, not a table of images. MIT, not BlockNote XL."
      />

      <Example name="columns" minHeight={520} />

      <H2>Inserting</H2>
      <p>
        Type <code>/Columns</code> for two columns, or <code>/3 columns</code> for three. The
        formatting toolbar&apos;s Columns button inserts two. Each column is a normal nest of
        blocks — paragraph beside paragraph, code beside text, image beside a heading, list beside
        a quote. Drag the handle between columns to change their widths. On viewports under 640px
        the columns stack.
      </p>
      <p>
        A <code>columnList</code> is a finite section. Enter at the end of a column (empty last
        block) or click below the layout continues as a full-width sibling after it, not more
        nested blocks in the last column. Columns are not CSS float on a single image, and not a
        BlockNote table (those cells are inline-only). They are not{" "}
        <code>@blocknote/xl-multi-column</code> (GPL-3.0 / commercial).
      </p>
      <CodeBlock code={insert} />
      <Callout>
        Inserting columns while the caret is already inside a column places the new layout after the
        current one, so columns do not nest. Turn the tool off with{" "}
        <code>tools</code> that omit <code>&quot;columns&quot;</code>; existing layouts flatten to
        their inner blocks when they load.
      </Callout>

      <H2>Paste and import</H2>
      <p>
        HTML from Google Docs or Word becomes columns when it is clearly a layout, not a data table:
      </p>
      <ul>
        <li>
          A one-row table of two or three cells with an image on one side and a heading or several
          paragraphs on the other (the screenshot case: product image left, heading and body
          right).
        </li>
        <li>
          A floated <code>&lt;img&gt;</code> or <code>&lt;figure&gt;</code> (<code>float:left</code>{" "}
          / <code>right</code>, or <code>align=&quot;left&quot;</code> / <code>right</code>) with
          wrapping text beside it.
        </li>
      </ul>
      <p>
        Image grids, multi-row tables, and a cell that is only a short caption stay tables, including{" "}
        <Link href="/docs/html">inline images in table cells</Link>. Two text-only columns without{" "}
        <code>data-genesis-columns</code> are not converted.
      </p>

      <H2 id="html">HTML export</H2>
      <p>
        Export is an email-safe <code>&lt;table role=&quot;presentation&quot;&gt;</code> marked{" "}
        <code>data-genesis-columns</code> and <code>data-genesis-column-widths</code>, so Gmail and
        Word keep the row and <code>parseHTML</code> reads it back as columns. Column bodies are
        ordinary semantic HTML inside each <code>&lt;td&gt;</code>.
      </p>
      <CodeBlock code={html} />
      <H3>Block JSON</H3>
      <CodeBlock code={json} />
    </>
  );
}
