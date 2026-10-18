"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle, type FidelityReport } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide
import { pasteSamples, type PasteSample } from "./paste-samples";

async function copyAsHtml(sample: PasteSample) {
  const text = new DOMParser().parseFromString(sample.html, "text/html").body.textContent ?? "";
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([sample.html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    }),
  ]);
}

/** Dispatches a real paste event, the same one ⌘V / Ctrl+V produces. */
function pasteInto(editor: BlockEditorHandle, sample: PasteSample) {
  const doc = editor.editor.document;
  editor.editor.setTextCursorPosition(doc[doc.length - 1], "end");
  editor.focus();
  const data = new DataTransfer();
  data.setData("text/html", sample.html);
  data.setData("text/plain", sample.html.replace(/<[^>]+>/g, ""));
  editor.editor.domElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}

function ReportSummary({ report }: { report: FidelityReport }) {
  const removed = report.dropped.map((d) => `${d.count}× <${d.tag}> (${d.reason})`);
  const unwrapped = report.unwrapped.reduce((sum, u) => sum + u.count, 0);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs" data-testid="paste-report">
      <dt className="text-muted-foreground">Fidelity</dt>
      <dd data-testid="paste-score">{Math.round(report.score * 100)}%</dd>
      <dt className="text-muted-foreground">Blocks</dt>
      <dd>{report.blocks}</dd>
      <dt className="text-muted-foreground">Removed</dt>
      <dd>{removed.length ? removed.join(", ") : "nothing"}</dd>
      <dt className="text-muted-foreground">Unwrapped</dt>
      <dd>{unwrapped} wrapper elements</dd>
      <dt className="text-muted-foreground">Colors</dt>
      <dd>
        {report.colors.palette} palette, {report.colors.hex} custom
      </dd>
    </dl>
  );
}

export default function HtmlPasteExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [report, setReport] = useState<FidelityReport | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15">
        {pasteSamples.map((sample) => (
          <span key={sample.name} className="inline-flex overflow-hidden rounded-md border text-sm">
            <button
              className="px-2.5 py-1 hover:bg-muted"
              onClick={() => copyAsHtml(sample).then(() => setCopied(sample.name), () => setCopied(null))}
            >
              Copy {sample.name}
            </button>
            <button
              className="border-l px-2.5 py-1 hover:bg-muted"
              onClick={() => editor.current && pasteInto(editor.current, sample)}
            >
              Paste
            </button>
          </span>
        ))}
        {copied && <span className="text-xs text-muted-foreground">Copied. Press ⌘V / Ctrl+V in the editor.</span>}
      </div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        ref={editor}
        onImportReport={setReport}
      />
      <div className="mx-15 rounded-md border bg-muted/30 p-3">
        {report ? (
          <ReportSummary report={report} />
        ) : (
          <p className="text-xs text-muted-foreground">Paste HTML from anywhere to see what the engine kept.</p>
        )}
      </div>
    </div>
  );
}
