"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

/** Another host for the sample page, so it counts as third-party: 127.0.0.1 for localhost and back. */
function remoteOrigin() {
  const { protocol, hostname, port } = window.location;
  const other = hostname === "localhost" ? "127.0.0.1" : hostname === "127.0.0.1" ? "localhost" : hostname;
  return `${protocol}//${other}${port ? `:${port}` : ""}`;
}

const initial = `<p>Paste a link on its own line and it becomes a card. Saved cards keep their metadata:</p>
<a href="https://github.com/sumankalia/genesis-editor" data-genesis-link-preview data-title="genesis-editor" data-description="A Notion-style block editor for React with lossless HTML import and export." data-site-name="GitHub"><strong>genesis-editor</strong></a>
<p>Click an image, then the link button in its toolbar, to link it:</p>
<a href="https://example.com/" target="_blank"><img src="/examples/lake.png" alt="A mountain lake" width="640" height="427"></a>`;

/** Dispatches a real paste event, the same one ⌘V / Ctrl+V produces, on a new empty line. */
function pasteInto(editor: BlockEditorHandle, text: string) {
  const doc = editor.editor.document;
  const [line] = editor.editor.insertBlocks([{ type: "paragraph" }], doc[doc.length - 1], "after");
  editor.editor.setTextCursorPosition(line, "start");
  editor.focus();
  const transfer = new DataTransfer();
  transfer.setData("text/plain", text);
  editor.editor.domElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
}

export default function LinkPreviewsExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [failing, setFailing] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        <button
          className="rounded-md border px-2.5 py-1 hover:bg-muted"
          onClick={() => editor.current && pasteInto(editor.current, `${remoteOrigin()}/examples/link-preview-sample.html`)}
        >
          Paste a link
        </button>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={failing} onChange={(e) => setFailing(e.target.checked)} data-testid="link-preview-fail" />
          Make the server fail
        </label>
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => setHtml(editor.current?.getHTML() ?? "")}>
          Export HTML
        </button>
      </div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        ref={editor}
        format="html"
        defaultValue={initial}
        linkPreview={{ endpoint: `/api/mock-link-preview?delay=600${failing ? "&fail=1" : ""}` }}
      />
      {html !== null && (
        <pre className="mx-15 max-h-56 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap" data-testid="link-preview-html">
          {html}
        </pre>
      )}
    </div>
  );
}
