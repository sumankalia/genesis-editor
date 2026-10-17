"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  BlockEditor,
  mapResponsePath,
  type BlockEditorHandle,
  type PersistStatus,
  type UploadErrorEvent,
} from "genesis-editor";
import { ImageUpIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { EditorHeader } from "@/components/demo/editor-header";
import { UploadSettingsDialog } from "@/components/demo/upload-settings-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { starterDocument } from "@/lib/starter-document";
import {
  demoUploadFile,
  loadUploadSettings,
  saveUploadSettings,
  type UploadSettings,
} from "@/lib/upload-settings";

const DOCUMENT_KEY = "genesis:document:v1";

export default function DemoApp() {
  const editorRef = useRef<BlockEditorHandle>(null);
  const [saveState, setSaveState] = useState<PersistStatus>({ status: "idle" });
  const [settings, setSettings] = useState(loadUploadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  const serverMode = settings.mode === "server" && settings.uploadUrl !== "";
  const mapUploadResponse = useMemo(
    () => (settings.responsePath ? mapResponsePath(settings.responsePath) : undefined),
    [settings.responsePath],
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const saveSettings = (next: UploadSettings) => {
    saveUploadSettings(next);
    setSettings(next);
    setSettingsOpen(false);
    toast.success(
      next.mode === "server"
        ? `Uploads will be sent to ${next.uploadUrl}`
        : next.mode === "custom"
          ? "Uploads will use the custom uploadFile function"
          : "Uploads will be stored in this browser",
    );
  };

  const showUploadError = useCallback(({ error, file, retry }: UploadErrorEvent) => {
    toast.error(`Couldn't upload ${file.name}`, {
      description: error.message,
      action: { label: "Retry", onClick: () => void retry() },
    });
  }, []);

  const copyMarkdown = async () => {
    const markdown = editorRef.current?.getMarkdown();
    if (markdown === undefined) return;
    try {
      await navigator.clipboard.writeText(markdown);
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

  return (
    <div className="flex min-h-dvh flex-col">
      <EditorHeader
        saveState={saveState}
        onCopyMarkdown={copyMarkdown}
        onReset={resetDocument}
        menuItems={
          <DropdownMenuItem onSelect={openSettings}>
            <ImageUpIcon />
            Upload settings…
          </DropdownMenuItem>
        }
      />
      <main className="flex flex-1 justify-center px-0 pb-28 pt-6 sm:px-6 sm:pb-16 sm:pt-12">
        <BlockEditor
          ref={editorRef}
          className="w-full max-w-3xl"
          initialContent={starterDocument}
          persist={{ key: DOCUMENT_KEY }}
          onPersistStatusChange={setSaveState}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          uploadFile={settings.mode === "custom" ? demoUploadFile : undefined}
          uploadUrl={serverMode ? settings.uploadUrl : undefined}
          mapUploadResponse={serverMode ? mapUploadResponse : undefined}
          onUploadError={showUploadError}
          onConfigureUploads={openSettings}
        />
      </main>
      <UploadSettingsDialog
        open={settingsOpen}
        settings={settings}
        onOpenChange={setSettingsOpen}
        onSave={saveSettings}
      />
    </div>
  );
}
