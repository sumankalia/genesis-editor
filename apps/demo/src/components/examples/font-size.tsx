"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle } from "genesis-editor";
import type { FidelityReport } from "genesis-editor/parser";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const article = `<h3>Event poster</h3>
<p><span style="font-size:20px" data-font-size="20px">Saturday, 8 pm</span> at the old cinema.</p>
<p>Doors open at 7. <span style="font-size:12px" data-font-size="12px">Tickets are non-refundable.</span></p>
<p><span style="font-size:8px" data-font-size="8px">Small print, set in 8 px.</span></p>`;

// What Google Docs puts on the clipboard: 11 pt body text, with 9 pt and 14 pt runs.
const googleDocs = `<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;">Pasted from Google Docs at 11 pt, which is the body size there, so it stays Default. </span><span style="font-size:9pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;">This 9 pt run is smaller,</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;"> and </span><span style="font-size:14pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;">this 14 pt run is larger.</span></p></b>`;

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

export default function FontSizeExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [report, setReport] = useState<FidelityReport["fontSizes"] | null>(null);
  const [html, setHtml] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => editor.current && pasteInto(editor.current, googleDocs)}>
          Paste from Google Docs (11 pt)
        </button>
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => setHtml(editor.current?.getHTML() ?? "")}>
          Export HTML
        </button>
        {report && (
          <span className="text-muted-foreground" data-testid="font-size-report">
            Last import: {report.sized} sized, {report.clamped} clamped
          </span>
        )}
      </div>
      <BlockEditor
        ref={editor}
        theme={theme} // hide
        format="html"
        defaultValue={article}
        tools={{ fontSize: true, colors: true, bold: true, italic: true, heading: true, link: true }}
        onImportReport={(r) => setReport(r.fontSizes)}
      />
      {html && (
        <pre className="mx-15 overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap" data-testid="font-size-html">
          {html}
        </pre>
      )}
    </div>
  );
}
