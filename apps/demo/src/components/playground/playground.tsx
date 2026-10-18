"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BlockEditor,
  mapResponsePath,
  type Block,
  type BlockEditorHandle,
  type PersistStatus,
  type UploadErrorEvent,
} from "genesis-editor";
import { ClipboardCopyIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { calloutPlugin } from "@/components/examples/callout-plugin";
import { ClientCode } from "@/components/playground/client-code";
import {
  ALL_TOOLS,
  OptionsPanel,
  type PlaygroundOptions,
} from "@/components/playground/options-panel";
import { SaveIndicator } from "@/components/playground/save-indicator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { starterDocument } from "@/lib/starter-document";
import {
  demoUploadFile,
  loadUploadSettings,
  saveUploadSettings,
} from "@/lib/upload-settings";
import { useSiteTheme } from "@/lib/use-site-theme";

const DOCUMENT_KEY = "genesis:document:v1";

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
  }));
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [markdown, setMarkdown] = useState("");
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
    toast.success("Document reset");
  };

  const tools = useMemo(() => toolsProp(options), [options]);
  const plugins = useMemo(() => (options.callout ? [calloutPlugin] : undefined), [options.callout]);
  const toolbar = useMemo(
    () => (options.toolbarPlacement === "fixed" ? { placement: "fixed" as const } : undefined),
    [options.toolbarPlacement],
  );

  const editorTheme = options.theme === "site" ? siteTheme : options.theme;
  const json = useMemo(() => JSON.stringify(blocks, shortenDataUrls, 2), [blocks]);
  const code = useMemo(() => generateCode(options), [options]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex h-11 items-center justify-between gap-2 border-b px-3">
            <SaveIndicator state={saveState} />
            <div className="flex items-center gap-1">
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
          <div className="playground-editor pt-6 pb-24 sm:pb-10">
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
              uploadFile={uploads.mode === "custom" ? demoUploadFile : undefined}
              uploadUrl={serverMode ? uploadUrl : undefined}
              mapUploadResponse={serverMode ? mapUploadResponse : undefined}
              onUploadError={showUploadError}
              onConfigureUploads={focusUploadOptions}
            />
          </div>
        </section>

        <aside className="rounded-xl border bg-card p-4 shadow-sm lg:sticky lg:top-20">
          <h2 className="mb-4 text-sm font-semibold">Props</h2>
          <OptionsPanel options={options} onChange={changeOptions} />
        </aside>
      </div>

      <section aria-label="Output">
        <Tabs defaultValue="code" className="gap-4">
          <TabsList variant="line">
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
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
  const { theme, editable, uploads, callout, toolbarPlacement } = options;
  const props = [`persist={{ key: "my-document" }}`];
  if (theme === "site") props.push(`theme={resolvedTheme} // "light" | "dark" from your app`);
  else if (theme !== "system") props.push(`theme="${theme}"`);
  if (!editable) props.push("editable={false}");

  const tools = toolsProp(options);
  if (tools) props.push(arrayProp("tools", tools));
  if (toolbarPlacement === "fixed") props.push(`toolbar={{ placement: "fixed" }}`);
  if (callout) props.push("plugins={[calloutPlugin]}");

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
