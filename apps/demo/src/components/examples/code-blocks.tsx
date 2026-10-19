"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const sample = `<p>Pick a language from the dropdown on the code block.</p>
<pre><code class="language-typescript">export function greet(name: string) {
  return \`Hello, \${name}\`;
}
</code></pre>`;

const jsPaste = `<pre><code class="language-js">const answer = 42;</code></pre>`;

/** Dispatches a real paste event, the same one ⌘V / Ctrl+V produces, on a new empty line. */
function pasteInto(editor: BlockEditorHandle, html: string) {
  const doc = editor.editor.document;
  const [line] = editor.editor.insertBlocks([{ type: "paragraph" }], doc[doc.length - 1], "after");
  editor.editor.setTextCursorPosition(line, "start");
  editor.focus();
  const transfer = new DataTransfer();
  transfer.setData("text/html", html);
  transfer.setData("text/plain", html.replace(/<[^>]+>/g, ""));
  editor.editor.domElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
}

export default function CodeBlocksExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [html, setHtml] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => editor.current && pasteInto(editor.current, jsPaste)}>
          Paste language-js
        </button>
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => setHtml(editor.current?.getHTML() ?? "")}>
          Export HTML
        </button>
      </div>
      <BlockEditor ref={editor} theme={theme} format="html" defaultValue={sample} />
      {html && (
        <pre className="mx-15 overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap" data-testid="code-blocks-html">
          {html}
        </pre>
      )}
    </div>
  );
}
