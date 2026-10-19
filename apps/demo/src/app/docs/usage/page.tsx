import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Usage" };

const documentShape = `[
  {
    "id": "c1f…",
    "type": "heading",
    "props": { "level": 2, "textColor": "default", "textAlignment": "left" },
    "content": [{ "type": "text", "text": "Meeting notes", "styles": {} }],
    "children": []
  }
]`;

export default function UsagePage() {
  return (
    <>
      <DocsHeader
        title="Usage"
        description="Seed or control the document, save it automatically, and drive the editor from code."
      />

      <H2>Documents are arrays of blocks</H2>
      <p>
        The editor reads and writes BlockNote&apos;s block JSON. Store it as is in your database. You
        can pass shorthand when creating content, such as <code>content: &quot;Text&quot;</code>{" "}
        instead of a full text array, and <code>onChange</code> always gives you complete blocks.
      </p>
      <CodeBlock lang="json" code={documentShape} />

      <H2>Uncontrolled</H2>
      <p>
        Pass <code>initialContent</code> for the first render and read changes from{" "}
        <code>onChange</code>. This is the simplest way to save to your own backend.
      </p>
      <Example name="uncontrolled" />

      <H2>Controlled</H2>
      <p>
        Pass <code>value</code> and update it from <code>onChange</code>. When <code>value</code>{" "}
        changes to something other than the current document, the editor replaces its content.
        Changes made through <code>value</code> don&apos;t call <code>onChange</code> again.
      </p>
      <Example name="controlled" />

      <H2>Autosave with persist</H2>
      <p>
        <code>persist</code> saves the document to <code>localStorage</code> shortly after each
        edit, flushes when the tab is hidden or closed, and restores it on the next visit. Give each
        document its own <code>key</code>. <code>onPersistStatusChange</code> drives a
        &quot;Saving…/Saved&quot; indicator.
      </p>
      <Example name="persist" minHeight={160} />
      <Callout>
        A saved document wins over <code>initialContent</code>. Use the ref&apos;s{" "}
        <code>clearPersisted()</code> to forget it.
      </Callout>

      <H2>Read-only</H2>
      <p>
        <code>editable=&#123;false&#125;</code> renders the document without the side menu,
        toolbars, or mobile toolbar.
      </p>
      <Example name="read-only" minHeight={160} />

      <H2>Ref methods</H2>
      <p>
        A ref gives you <code>getMarkdown()</code>, <code>setMarkdown()</code>, <code>getBlocks()</code>,{" "}
        <code>setBlocks()</code>, <code>focus()</code>, and the underlying BlockNote editor. See the{" "}
        <Link href="/docs/api#ref">API reference</Link>.
      </p>
      <Example name="ref-methods" />
    </>
  );
}
