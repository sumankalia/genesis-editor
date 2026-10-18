"use client";

import { useState } from "react";
import { BlockEditor, type FidelityReport } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const initialHtml = `<h2>Release notes</h2>
<p>Paste <strong>HTML</strong> in, get <em>clean</em> HTML out. <a href="https://example.com/changelog">Full changelog</a>.</p>
<ul><li>Faster paste</li><li><span style="color: #e03e3e">Colored</span> text survives</li></ul>
<blockquote>Edits on either side show up on the other.</blockquote>`;

export default function HtmlValueExample() {
  const theme = useSiteTheme(); // hide
  const [html, setHtml] = useState(initialHtml);
  const [report, setReport] = useState<FidelityReport | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        format="html"
        value={html}
        onChange={(next) => setHtml(next)}
        onImportReport={setReport}
      />
      <div className="flex flex-col gap-2 px-4 lg:px-0 lg:pr-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>HTML (editable)</span>
          {report && <span data-testid="html-score">Fidelity {Math.round(report.score * 100)}%</span>}
        </div>
        <textarea
          aria-label="HTML"
          data-testid="html-source"
          className="min-h-64 flex-1 rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
          spellCheck={false}
          value={html}
          onChange={(event) => setHtml(event.target.value)}
        />
      </div>
    </div>
  );
}
