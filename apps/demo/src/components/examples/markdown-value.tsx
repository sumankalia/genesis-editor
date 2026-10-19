"use client";

import { useState } from "react";
import { BlockEditor, type FidelityReport } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const initialMarkdown = `# Release notes

Paste **Markdown** in, get clean HTML out. [Full changelog](https://example.com/changelog).

- Faster paste
- Lists and \`code\` survive

> Edits on either side show up on the other.`;

export default function MarkdownValueExample() {
  const theme = useSiteTheme(); // hide
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [report, setReport] = useState<FidelityReport | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        format="markdown"
        value={markdown}
        onChange={(next) => setMarkdown(next)}
        onImportReport={setReport}
      />
      <div className="flex flex-col gap-2 px-4 lg:px-0 lg:pr-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Markdown (editable)</span>
          {report && <span data-testid="markdown-score">Fidelity {Math.round(report.score * 100)}%</span>}
        </div>
        <textarea
          aria-label="Markdown"
          data-testid="markdown-source"
          className="min-h-64 flex-1 rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
          spellCheck={false}
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
        />
      </div>
    </div>
  );
}
