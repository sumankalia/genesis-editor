"use client";

import { useMemo, useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle, type FidelityReport } from "genesis-editor";
import { EraserIcon, FileInputIcon } from "lucide-react";

import { ArticlePreview } from "@/components/article-preview";
import { ImportReport } from "@/components/import-report";
import { Button } from "@/components/ui/button";
import { PASTE_CASES } from "@/lib/paste-cases";
import { useSiteTheme } from "@/lib/use-site-theme";

type Status =
  | { kind: "idle" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; report: FidelityReport };

export function PasteLanding() {
  const editorRef = useRef<BlockEditorHandle>(null);
  const theme = useSiteTheme();
  const [source, setSource] = useState("");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const load = (raw: string) => {
    if (!raw.trim()) {
      setStatus({ kind: "empty" });
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const report = editor.setHTML(raw);
      setStatus({ kind: "loaded", report });
      setHtml(editor.getHTML());
      setView("edit");
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const loadCase = async (sample: string) => {
    const response = await fetch(sample);
    if (!response.ok) {
      setStatus({ kind: "error", message: `Couldn't load ${sample} (${response.status}).` });
      return;
    }
    const raw = await response.text();
    setSource(raw);
    load(raw);
  };

  const keepDrop = useMemo(() => {
    if (status.kind !== "loaded") return null;
    const dropped = status.report.dropped.map((d) => `${d.count}× <${d.tag}>`);
    const kept = [
      `${status.report.blocks} blocks`,
      status.report.colors.hex ? `${status.report.colors.hex} hex colours` : null,
      status.report.fontSizes.sized ? `${status.report.fontSizes.sized} sized runs` : null,
    ].filter(Boolean);
    return { kept, dropped };
  }, [status]);

  return (
    <div className="grid gap-8" data-testid="paste-landing">
      <section className="grid gap-3">
        <p className="max-w-2xl text-muted-foreground">
          Paste HTML from a page, Google Docs, or Word. Genesis maps it through{" "}
          <code className="font-mono text-sm">parseHTML</code>, then you edit and export the same HTML a host
          would store. Genesis edits; the host app stores.
        </p>
        <label className="text-sm font-medium" htmlFor="paste-landing-input">
          HTML to load
        </label>
        <textarea
          id="paste-landing-input"
          data-testid="paste-landing-input"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="<h1>Paste a published article</h1><p>From DEV, Medium, Docs, Word…</p>"
          spellCheck={false}
          className="min-h-40 w-full resize-y rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => load(source)} data-testid="paste-landing-load">
            <FileInputIcon />
            Load
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSource("");
              setStatus({ kind: "idle" });
              editorRef.current?.setHTML("<p></p>");
              setHtml("");
            }}
            data-testid="paste-landing-clear"
          >
            <EraserIcon />
            Clear
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="paste-landing-cases">
          {PASTE_CASES.map((item) => (
            <Button key={item.id} variant="outline" size="sm" onClick={() => void loadCase(item.sample)} data-testid={`paste-case-${item.id}`}>
              {item.title.split(":")[0].slice(0, 48)}
            </Button>
          ))}
        </div>
        <ul className="grid gap-1 text-xs text-muted-foreground" data-testid="paste-landing-credits">
          {PASTE_CASES.map((item) => (
            <li key={item.id}>
              <a className="underline underline-offset-2" href={item.href} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              {" — "}
              {item.author}, {item.source}
              {item.snapshot ? ` · ${item.snapshotNote}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex h-11 items-center justify-between gap-2 border-b px-3" data-testid="paste-landing-view">
            <div className="flex gap-1">
              <Button
                variant={view === "edit" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === "edit"}
                onClick={() => setView("edit")}
                data-testid="paste-landing-edit"
              >
                Edit
              </Button>
              <Button
                variant={view === "preview" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === "preview"}
                onClick={() => {
                  setHtml(editorRef.current?.getHTML() ?? "");
                  setView("preview");
                }}
                data-testid="paste-landing-preview"
              >
                Preview
              </Button>
            </div>
            <p className="hidden text-xs text-muted-foreground sm:block">Preview is <code>getHTML()</code>, not a Docs clone.</p>
          </div>
          <div className={view === "edit" ? "pt-6 pb-16" : "hidden"}>
            <BlockEditor
              ref={editorRef}
              format="html"
              defaultValue="<p></p>"
              theme={theme}
              onChange={(next) => setHtml(next)}
            />
          </div>
          {view === "preview" && (
            <div className="px-6 py-10 sm:px-10">
              <ArticlePreview html={html} />
            </div>
          )}
        </div>
        <aside className="rounded-xl border bg-muted/30 p-4 text-sm" data-testid="paste-landing-status">
          <h2 className="mb-3 text-sm font-semibold">Conversion report</h2>
          {status.kind === "idle" && <p className="text-muted-foreground">Load HTML to see keep / drop.</p>}
          {status.kind === "empty" && (
            <p className="text-destructive" data-testid="paste-landing-error">
              Paste some HTML first, or load one of the three articles.
            </p>
          )}
          {status.kind === "error" && (
            <p className="text-destructive" data-testid="paste-landing-error">
              {status.message}
            </p>
          )}
          {status.kind === "loaded" && (
            <>
              <ImportReport report={status.report} testId="paste-landing" />
              {keepDrop && (
                <dl className="mt-4 grid gap-2 text-xs">
                  <div>
                    <dt className="font-medium">Keep</dt>
                    <dd data-testid="paste-landing-keep">{keepDrop.kept.join(", ") || "nothing"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Drop</dt>
                    <dd data-testid="paste-landing-drop">{keepDrop.dropped.join(", ") || "nothing"}</dd>
                  </div>
                </dl>
              )}
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
