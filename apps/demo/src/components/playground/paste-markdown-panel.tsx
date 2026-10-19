"use client";

import { useState, type RefObject } from "react";
import type { BlockEditorHandle, FidelityReport } from "genesis-editor";
import { EraserIcon, FileInputIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SAMPLES = [
  {
    name: "Release notes",
    markdown: `# Release notes

Paste **Markdown** from GitHub or ChatGPT. Inline [links](https://example.com) stay links.

- Headings
- Lists
- \`code\`

\`\`\`ts
const ok = true;
\`\`\`
`,
  },
  {
    name: "Table",
    markdown: `| Feature | Status |
| --- | --- |
| HTML engine | done |
| Markdown import | in review |
`,
  },
];

type Status =
  | { kind: "idle" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; report: FidelityReport };

/** Load Markdown with `setMarkdown`, the same path as `format="markdown"` values. */
export function PasteMarkdownPanel({ editorRef }: { editorRef: RefObject<BlockEditorHandle | null> }) {
  const [markdown, setMarkdown] = useState("");
  const [sample, setSample] = useState(SAMPLES[0].name);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const load = (source: string) => {
    if (!source.trim()) {
      setStatus({ kind: "empty" });
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    try {
      setStatus({ kind: "loaded", report: editor.setMarkdown(source) });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const loadSample = () => {
    const chosen = SAMPLES.find((s) => s.name === sample) ?? SAMPLES[0];
    setMarkdown(chosen.markdown);
    load(chosen.markdown);
  };

  const clear = () => {
    setMarkdown("");
    setStatus({ kind: "idle" });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid="paste-markdown">
      <div className="grid gap-2">
        <Label htmlFor="paste-markdown-input">Markdown to load</Label>
        <textarea
          id="paste-markdown-input"
          data-testid="paste-markdown-input"
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          placeholder={"# Paste Markdown here\n\nFrom ChatGPT, GitHub, or a .md file."}
          spellCheck={false}
          aria-invalid={status.kind === "empty" || status.kind === "error" || undefined}
          className="min-h-48 w-full resize-y rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => load(markdown)} data-testid="paste-markdown-load">
            <FileInputIcon />
            Load
          </Button>
          <Button variant="ghost" size="sm" onClick={clear} data-testid="paste-markdown-clear">
            <EraserIcon />
            Clear
          </Button>
          <span className="ml-auto flex items-center gap-2">
            <Select value={sample} onValueChange={setSample}>
              <SelectTrigger size="sm" aria-label="Sample" data-testid="paste-markdown-sample">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAMPLES.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadSample} data-testid="paste-markdown-load-sample">
              Load sample
            </Button>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Load replaces the document through <code>setMarkdown</code>, then the HTML engine. The
          report is the same one <code>setHTML</code> returns.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs" data-testid="paste-markdown-status" aria-live="polite">
        {status.kind === "idle" && <p className="text-muted-foreground">Load Markdown to see what the engine kept.</p>}
        {status.kind === "empty" && (
          <p className="text-destructive" data-testid="paste-markdown-error">
            Paste some Markdown first, or load a sample.
          </p>
        )}
        {status.kind === "error" && (
          <p className="text-destructive" data-testid="paste-markdown-error">
            Couldn&apos;t load this Markdown: {status.message}
          </p>
        )}
        {status.kind === "loaded" && <ImportReport report={status.report} />}
      </div>
    </div>
  );
}

function ImportReport({ report }: { report: FidelityReport }) {
  const removed = report.dropped.map((d) => `${d.count}× <${d.tag}> (${d.reason})`);
  return (
    <div className="grid gap-3" data-testid="paste-markdown-report">
      {report.blocks === 0 && <p className="text-destructive">No blocks came out of this Markdown.</p>}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 [&_dd]:break-words">
        <dt className="text-muted-foreground">Fidelity</dt>
        <dd data-testid="paste-markdown-score">{Math.round(report.score * 100)}%</dd>
        <dt className="text-muted-foreground">Blocks</dt>
        <dd data-testid="paste-markdown-blocks">{report.blocks}</dd>
        <dt className="text-muted-foreground">Removed</dt>
        <dd data-testid="paste-markdown-removed">{removed.length ? removed.join(", ") : "nothing"}</dd>
      </dl>
    </div>
  );
}
