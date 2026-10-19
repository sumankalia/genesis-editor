"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BlockEditor,
  DocumentImportError,
  mapResponsePath,
  type Block,
  type BlockEditorHandle,
  type FidelityReport,
  type PersistStatus,
  type UploadErrorEvent,
} from "genesis-editor";
import { ClipboardCopyIcon, FileUpIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { calloutPlugin } from "@/components/examples/callout-plugin";
import { ArticlePreview } from "@/components/article-preview";
import { ImportReport } from "@/components/import-report";
import { ClientCode } from "@/components/playground/client-code";
import { PasteHtmlPanel } from "@/components/playground/paste-html-panel";
import { PasteMarkdownPanel } from "@/components/playground/paste-markdown-panel";
import {
  ALL_TOOLS,
  OptionsPanel,
  type PlaygroundOptions,
} from "@/components/playground/options-panel";
import { SaveIndicator } from "@/components/playground/save-indicator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prettyHTML } from "@/lib/pretty-html";
import { starterDocument } from "@/lib/starter-document";
import {
  demoUploadFile,
  loadUploadSettings,
  saveUploadSettings,
} from "@/lib/upload-settings";
import { useSiteTheme } from "@/lib/use-site-theme";

const DOCUMENT_KEY = "genesis:document:v1";
const MOCK_LINK_PREVIEW_URL = "/api/mock-link-preview";

export default function Playground() {
  const editorRef = useRef<BlockEditorHandle>(null);
  const [saveState, setSaveState] = useState<PersistStatus>({ status: "idle" });
  const [options, setOptions] = useState<PlaygroundOptions>(() => ({
    theme: "site",
    editable: true,
    uploads: loadUploadSettings(),
    tools: [...ALL_TOOLS],
    callout: false,
    toolbarPlacement: "floating",
    htmlMode: "clean",
    cleanNoise: true,
    linkPreviews: true,
  }));
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [html, setHtml] = useState("");
  const [outputTab, setOutputTab] = useState("code");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const importInput = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<
    { kind: "idle" } | { kind: "error"; message: string } | { kind: "loaded"; report: FidelityReport }
  >({ kind: "idle" });
  const siteTheme = useSiteTheme();

  const { uploads } = options;
  const uploadUrl = uploads.uploadUrl.trim();
  const responsePath = uploads.responsePath.trim();
  const serverMode = uploads.mode === "server" && uploadUrl !== "";
  const mapUploadResponse = useMemo(
    () => (responsePath ? mapResponsePath(responsePath) : undefined),
    [responsePath],
  );

  const changeOptions = (next: PlaygroundOptions) => {
    setOptions(next);
    saveUploadSettings(next.uploads);
  };

  const outputTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refreshOutput = useCallback(() => {
    clearTimeout(outputTimer.current);
    outputTimer.current = setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) return;
      setBlocks(editor.getBlocks());
      setMarkdown(editor.getMarkdown());
      setHtml(editor.getHTML());
    }, 250);
  }, []);

  useEffect(() => {
    refreshOutput();
    return () => clearTimeout(outputTimer.current);
  }, [refreshOutput]);

  const showUploadError = useCallback((event: UploadErrorEvent) => {
    toast.error(event.kind === "file" ? `Couldn't upload ${event.file.name}` : "Couldn't re-upload a pasted image", {
      description: event.error.message,
      action: { label: "Retry", onClick: () => void event.retry() },
    });
  }, []);

  const focusUploadOptions = useCallback(() => {
    const radio = document.getElementById(`upload-mode-${uploads.mode}`);
    radio?.scrollIntoView({ behavior: "smooth", block: "center" });
    radio?.focus({ preventScroll: true });
  }, [uploads.mode]);

  const copyMarkdown = async () => {
    const value = editorRef.current?.getMarkdown();
    if (value === undefined) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied document as Markdown");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  };

  const resetDocument = () => {
    if (!window.confirm("Replace this document with the starter content?")) return;
    editorRef.current?.setBlocks(starterDocument);
    setImportStatus({ kind: "idle" });
    toast.success("Document reset");
  };

  const importFile = async (file: File | undefined) => {
    if (!file || !editorRef.current) return;
    setOutputTab("import");
    try {
      const report = await editorRef.current.importFile(file);
      setImportStatus({ kind: "loaded", report });
      refreshOutput();
      toast.success(`Imported ${file.name}`);
    } catch (error) {
      const message = error instanceof DocumentImportError ? error.message : String(error);
      setImportStatus({ kind: "error", message });
      toast.error("Couldn't import that file", { description: message });
    }
  };

  const tools = useMemo(() => toolsProp(options), [options]);
  const plugins = useMemo(() => (options.callout ? [calloutPlugin] : undefined), [options.callout]);
  const toolbar = useMemo(
    () => (options.toolbarPlacement === "fixed" ? { placement: "fixed" as const } : undefined),
    [options.toolbarPlacement],
  );
  const clean = useMemo(() => (options.cleanNoise ? undefined : { noise: false }), [options.cleanNoise]);
  const linkPreview = useMemo(() => (options.linkPreviews ? { endpoint: MOCK_LINK_PREVIEW_URL } : undefined), [options.linkPreviews]);

  const editorTheme = options.theme === "site" ? siteTheme : options.theme;
  const json = useMemo(() => JSON.stringify(blocks, shortenDataUrls, 2), [blocks]);
  const prettyHtml = useMemo(() => prettyHTML(html), [html]);
  const code = useMemo(() => generateCode(options), [options]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex h-11 items-center justify-between gap-2 border-b px-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1" data-testid="playground-view">
                <Button
                  variant={view === "edit" ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={view === "edit"}
                  onClick={() => setView("edit")}
                  data-testid="playground-edit"
                >
                  Edit
                </Button>
                <Button
                  variant={view === "preview" ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={view === "preview"}
                  onClick={() => {
                    setHtml(editorRef.current?.getHTML() ?? html);
                    setView("preview");
                  }}
                  data-testid="playground-preview"
                >
                  Preview
                </Button>
              </div>
              <SaveIndicator state={saveState} />
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => importInput.current?.click()} data-testid="playground-import">
                <FileUpIcon />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <input
                ref={importInput}
                type="file"
                hidden
                data-testid="playground-import-input"
                accept=".docx,.odt,.rtf,.html,.htm,.md,.markdown,.txt,.pages"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void importFile(file);
                }}
              />
              <Button variant="ghost" size="sm" onClick={copyMarkdown}>
                <ClipboardCopyIcon />
                <span className="hidden sm:inline">Copy Markdown</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={resetDocument}>
                <RotateCcwIcon />
                Reset
              </Button>
            </div>
          </div>
          <div className={view === "edit" ? "playground-editor pt-6 pb-24 sm:pb-10" : "hidden"}>
            <BlockEditor
              ref={editorRef}
              initialContent={starterDocument}
              persist={{ key: DOCUMENT_KEY }}
              onPersistStatusChange={setSaveState}
              onChange={refreshOutput}
              theme={editorTheme}
              editable={options.editable}
              tools={tools}
              toolbar={toolbar}
              plugins={plugins}
              htmlMode={options.htmlMode}
              clean={clean}
              linkPreview={linkPreview}
              uploadFile={uploads.mode === "custom" ? demoUploadFile : undefined}
              uploadUrl={serverMode ? uploadUrl : undefined}
              mapUploadResponse={serverMode ? mapUploadResponse : undefined}
              onUploadError={showUploadError}
              onConfigureUploads={focusUploadOptions}
            />
          </div>
          {view === "preview" && (
            <div className="px-6 py-10 sm:px-12" data-testid="playground-preview-pane">
              <ArticlePreview html={html} />
            </div>
          )}
        </section>

        <aside className="rounded-xl border bg-card p-4 shadow-sm lg:sticky lg:top-20">
          <h2 className="mb-4 text-sm font-semibold">Props</h2>
          <OptionsPanel options={options} onChange={changeOptions} />
        </aside>
      </div>

      <section aria-label="Output">
        <Tabs value={outputTab} onValueChange={setOutputTab} className="gap-4">
          <TabsList
            variant="line"
            data-testid="output-tabs"
            className="w-full justify-start overflow-x-auto overflow-y-hidden pb-[6px] [scrollbar-width:none] [&>*]:flex-none"
          >
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="paste-html">Paste HTML</TabsTrigger>
            <TabsTrigger value="paste-markdown">Paste Markdown</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>
          <TabsContent value="code" data-testid="output-code">
            <ClientCode code={code} lang="tsx" />
          </TabsContent>
          <TabsContent value="json" data-testid="output-json">
            <ClientCode code={json} lang="json" />
          </TabsContent>
          <TabsContent value="markdown" data-testid="output-markdown">
            <ClientCode code={markdown || "\n"} lang="md" />
          </TabsContent>
          <TabsContent value="html" data-testid="output-html">
            <ClientCode code={prettyHtml || "\n"} lang="html" />
          </TabsContent>
          <TabsContent value="paste-html" forceMount className="data-[state=inactive]:hidden">
            <PasteHtmlPanel editorRef={editorRef} />
          </TabsContent>
          <TabsContent value="paste-markdown" forceMount className="data-[state=inactive]:hidden">
            <PasteMarkdownPanel editorRef={editorRef} />
          </TabsContent>
          <TabsContent value="import" forceMount className="data-[state=inactive]:hidden">
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="playground-import-status" aria-live="polite">
              <p className="text-muted-foreground">
                Import a Word, OpenDocument, RTF, HTML, Markdown, or text file. It replaces the document through the
                same HTML engine as paste. Apple Pages is refused.
              </p>
              {importStatus.kind === "idle" && <p className="text-muted-foreground">Choose a file with the Import button to see the fidelity report.</p>}
              {importStatus.kind === "error" && (
                <p className="text-destructive" data-testid="playground-import-error">
                  {importStatus.message}
                </p>
              )}
              {importStatus.kind === "loaded" && <ImportReport report={importStatus.report} testId="playground-import" />}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function shortenDataUrls(_key: string, value: unknown) {
  if (typeof value === "string" && value.startsWith("data:") && value.length > 80) {
    return `${value.slice(0, 48)}… (${Math.round(value.length / 1024)} kB)`;
  }
  return value;
}

/** `undefined` (every tool) unless some built-in tool is switched off. */
function toolsProp({ tools, callout }: PlaygroundOptions) {
  if (tools.length === ALL_TOOLS.length) return undefined;
  return callout ? [...tools, "callout"] : tools;
}

/** Puts long string arrays on several lines so the snippet doesn't scroll sideways. */
function arrayProp(name: string, values: readonly string[]) {
  const quoted = values.map((value) => `"${value}"`);
  const inline = `${name}={[${quoted.join(", ")}]}`;
  if (inline.length <= 72) return inline;
  const rows: string[] = [];
  for (const value of quoted) {
    const last = rows.at(-1);
    if (last !== undefined && last.length + value.length + 2 <= 60) rows[rows.length - 1] = `${last}, ${value}`;
    else rows.push(value);
  }
  return [`${name}={[`, ...rows.map((row) => `  ${row},`), "]}"].join("\n");
}

function generateCode(options: PlaygroundOptions) {
  const { theme, editable, uploads, callout, toolbarPlacement, htmlMode, cleanNoise, linkPreviews } = options;
  const props = [`persist={{ key: "my-document" }}`];
  if (theme === "site") props.push(`theme={resolvedTheme} // "light" | "dark" from your app`);
  else if (theme !== "system") props.push(`theme="${theme}"`);
  if (!editable) props.push("editable={false}");

  const tools = toolsProp(options);
  if (tools) props.push(arrayProp("tools", tools));
  if (toolbarPlacement === "fixed") props.push(`toolbar={{ placement: "fixed" }}`);
  if (callout) props.push("plugins={[calloutPlugin]}");
  if (htmlMode === "strict") props.push(`htmlMode="strict"`);
  if (!cleanNoise) props.push("clean={{ noise: false }}");
  if (linkPreviews) props.push(`linkPreview={{ endpoint: "/api/link-preview" }}`);

  const url = uploads.uploadUrl.trim();
  const path = uploads.responsePath.trim();
  if (uploads.mode === "server" && url) {
    props.push(`uploadUrl="${url}"`);
    if (path) props.push(`mapUploadResponse={mapResponsePath("${path}")}`);
  }
  if (uploads.mode === "custom") props.push("uploadFile={uploadFile}");

  const imports = ["BlockEditor"];
  if (uploads.mode === "server" && url && path) imports.push("mapResponsePath");

  const lines = [
    `import { ${imports.join(", ")} } from "genesis-editor";`,
    `import "genesis-editor/style.css";`,
  ];
  if (callout) lines.push(`import { calloutPlugin } from "./callout-plugin";`);
  lines.push("");
  if (uploads.mode === "custom") {
    lines.push(
      "async function uploadFile(file: File): Promise<string> {",
      "  const body = new FormData();",
      `  body.append("file", file);`,
      `  const response = await fetch("/api/upload", { method: "POST", body });`,
      "  if (!response.ok) throw new Error(`Upload failed (${response.status})`);",
      "  const { data } = await response.json();",
      "  return data.link;",
      "}",
      "",
    );
  }
  lines.push(
    "export function Editor() {",
    "  return (",
    "    <BlockEditor",
    ...props.flatMap((prop) => prop.split("\n").map((line) => `      ${line}`)),
    "    />",
    "  );",
    "}",
  );
  return lines.join("\n");
}
