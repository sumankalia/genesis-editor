import type { Metadata } from "next";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Document import" };

const refApi = `const editor = useRef<BlockEditorHandle>(null);

const report = await editor.current.importFile(file);
// report.score, report.blocks, report.warnings`;

const drive = `<BlockEditor
  googleDrive={{
    pickFile: async () => myPicker(), // File you already have; genesis does not do OAuth
  }}
  onImportError={(error) => console.warn(error.code, error.message)}
/>`;

export default function DocumentImportPage() {
  return (
    <>
      <DocsHeader
        title="Document import"
        description="Load a Word, OpenDocument, HTML, Markdown, or text file through the same HTML engine as paste."
      />

      <Example name="document-import" minHeight={420} />

      <H2>Files</H2>
      <p>
        <code>importFile(file)</code> replaces the document. Slash menu{" "}
        <strong>Import document</strong> (<code>/import</code>) opens a file picker. Headings, lists,
        tables, images, links, colours, and font sizes go through{" "}
        <code>parseHTML</code>, so re-hosting and the fidelity report still apply.
      </p>
      <ul>
        <li>
          <strong>Word (.docx)</strong> and Google Docs downloads: converted with mammoth (BSD-2-Clause),
          lazy-loaded.
        </li>
        <li>
          <strong>OpenDocument (.odt)</strong>: unzipped with fflate (MIT) and mapped to HTML.
        </li>
        <li>
          <strong>RTF, HTML, Markdown, plain text</strong> where the markup is simple enough to map.
          Markdown uses marked (MIT), also lazy-loaded.
        </li>
        <li>
          <strong>Apple Pages</strong> is detected and refused: export as Word and import that. There
          isn&apos;t a reliable permissive converter for .pages.
        </li>
      </ul>
      <p>Google Docs paste (HTML with <code>docs-internal-guid</code>) already uses this engine; a downloaded .docx is the file path.</p>
      <CodeBlock code={refApi} />

      <H2>Google Drive</H2>
      <p>
        genesis never talks to Google and ships no API keys. If your app already has a picker, pass{" "}
        <code>googleDrive.pickFile</code> and a second slash item appears.
      </p>
      <CodeBlock code={drive} />
      <Callout>
        mammoth, marked, and fflate stay out of the initial editor chunk. They load the first time
        you import a matching file. mammoth is BSD-2-Clause; marked and fflate are MIT.
      </Callout>
    </>
  );
}
