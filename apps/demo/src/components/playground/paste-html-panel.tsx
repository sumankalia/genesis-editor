"use client";

import { useState, type RefObject } from "react";
import type { BlockEditorHandle, FidelityReport } from "genesis-editor";
import { EraserIcon, FileInputIcon } from "lucide-react";

import { devtoSample } from "@/components/examples/devto-sample";
import { pasteSamples, type PasteSample } from "@/components/examples/paste-samples";
import { ImportReport } from "@/components/import-report";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Synthetic samples only: the docs' paste samples, HTML as it arrives from a JSON API, and a copied dev.to article. */
const SAMPLES: PasteSample[] = [
  ...pasteSamples,
  {
    name: "JSON-escaped",
    html: JSON.stringify(
      '<h2 class="title">Release notes</h2>\n<p>Copied from an API response, so quotes and newlines arrive <em>escaped</em>.</p>\n<ul>\n  <li>Decoded before parsing</li>\n  <li>Reported as a warning</li>\n</ul>',
    ),
  },
  { name: "dev.to images in a table", html: "" },
];

const sampleHtml = (sample: PasteSample) => (sample.name === "dev.to images in a table" ? devtoSample(window.location.origin) : sample.html);

type Status =
  | { kind: "idle" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; report: FidelityReport };

/** Paste raw HTML and load it with `setHTML`, the same path as `format="html"` values. */
export function PasteHtmlPanel({ editorRef }: { editorRef: RefObject<BlockEditorHandle | null> }) {
  const [html, setHtml] = useState("");
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
      setStatus({ kind: "loaded", report: editor.setHTML(source) });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const loadSample = () => {
    const chosen = SAMPLES.find((s) => s.name === sample) ?? SAMPLES[0];
    const source = sampleHtml(chosen);
    setHtml(source);
    load(source);
  };

  const clear = () => {
    setHtml("");
    setStatus({ kind: "idle" });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid="paste-html">
      <div className="grid gap-2">
        <Label htmlFor="paste-html-input">HTML to load</Label>
        <textarea
          id="paste-html-input"
          data-testid="paste-html-input"
          value={html}
          onChange={(event) => setHtml(event.target.value)}
          placeholder="<h2>Paste HTML here</h2><p>From a CMS, an email, an API response…</p>"
          spellCheck={false}
          aria-invalid={status.kind === "empty" || status.kind === "error" || undefined}
          className="min-h-48 w-full resize-y rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => load(html)} data-testid="paste-html-load">
            <FileInputIcon />
            Load
          </Button>
          <Button variant="ghost" size="sm" onClick={clear} data-testid="paste-html-clear">
            <EraserIcon />
            Clear
          </Button>
          <span className="ml-auto flex items-center gap-2">
            <Select value={sample} onValueChange={setSample}>
              <SelectTrigger size="sm" aria-label="Sample" data-testid="paste-html-sample">
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
            <Button variant="outline" size="sm" onClick={loadSample} data-testid="paste-html-load-sample">
              Load sample
            </Button>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Load replaces the document through <code>setHTML</code>, with the <strong>HTML import</strong> props
          and tools from the panel. JSON-encoded HTML is decoded first.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs" data-testid="paste-html-status" aria-live="polite">
        {status.kind === "idle" && <p className="text-muted-foreground">Load HTML to see what the engine kept.</p>}
        {status.kind === "empty" && (
          <p className="text-destructive" data-testid="paste-html-error">
            Paste some HTML first, or load a sample.
          </p>
        )}
        {status.kind === "error" && (
          <p className="text-destructive" data-testid="paste-html-error">
            Couldn&apos;t load this HTML: {status.message}
          </p>
        )}
        {status.kind === "loaded" && <ImportReport report={status.report} testId="paste-html" />}
      </div>
    </div>
  );
}
