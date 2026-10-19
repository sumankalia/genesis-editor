"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle, type FidelityReport } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const samples = [
  {
    name: "GitHub",
    markdown: `# Quarterly plan

**Goal:** ship the editor.

- [x] Parser
- [ ] Docs

See the [changelog](https://example.com/changelog).`,
  },
  {
    name: "ChatGPT",
    markdown: `## Summary

Here is a drop-in snippet:

\`\`\`ts
export const n = 1;
\`\`\`

> Keep the HTML engine in the loop.`,
  },
];

function pasteMarkdown(editor: BlockEditorHandle, markdown: string) {
  const doc = editor.editor.document;
  editor.editor.setTextCursorPosition(doc[doc.length - 1], "end");
  editor.focus();
  const data = new DataTransfer();
  data.setData("text/plain", markdown);
  data.setData("text/html", `<pre>${markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`);
  editor.editor.domElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}

export default function MarkdownPasteExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [report, setReport] = useState<FidelityReport | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15">
        {samples.map((sample) => (
          <button
            key={sample.name}
            className="rounded-md border px-2.5 py-1 text-sm hover:bg-muted"
            onClick={() => editor.current && pasteMarkdown(editor.current, sample.markdown)}
          >
            Paste {sample.name}
          </button>
        ))}
      </div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        ref={editor}
        onImportReport={setReport}
      />
      {report && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-15 text-xs" data-testid="markdown-paste-report">
          <dt className="text-muted-foreground">Fidelity</dt>
          <dd data-testid="markdown-paste-score">{Math.round(report.score * 100)}%</dd>
          <dt className="text-muted-foreground">Blocks</dt>
          <dd data-testid="markdown-paste-blocks">{report.blocks}</dd>
        </dl>
      )}
    </div>
  );
}
