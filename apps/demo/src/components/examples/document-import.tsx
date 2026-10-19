"use client";

import { useRef, useState } from "react";
import { BlockEditor, DocumentImportError, type BlockEditorHandle, type FidelityReport } from "genesis-editor";

import { ImportReport } from "@/components/import-report";
import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function DocumentImportExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const input = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<FidelityReport | null>(null);
  const [error, setError] = useState("");

  const load = async (file: File | undefined) => {
    if (!file || !editor.current) return;
    setError("");
    try {
      setReport(await editor.current.importFile(file));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof DocumentImportError ? caught.message : String(caught));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => input.current?.click()}>
          Import file
        </button>
        <input
          ref={input}
          type="file"
          data-testid="document-import-example-input"
          accept=".docx,.odt,.rtf,.html,.htm,.md,.markdown,.txt,.pages"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void load(file);
          }}
        />
      </div>
      {(report || error) && (
        <div className="mx-15 rounded-lg border bg-muted/30 p-3" data-testid="document-import-status" aria-live="polite">
          {error && (
            <p className="text-sm text-destructive" data-testid="document-import-error">
              {error}
            </p>
          )}
          {report && <ImportReport report={report} testId="document-import" />}
        </div>
      )}
      <BlockEditor
        ref={editor}
        theme={theme} // hide
        format="html"
        defaultValue="<h2>Import a document</h2><p>Word, OpenDocument, HTML, Markdown, or plain text. Pages files ask you to export as Word first.</p>"
        onImportError={(err) => setError(err.message)}
      />
    </div>
  );
}
