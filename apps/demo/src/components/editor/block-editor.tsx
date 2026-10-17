"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { BlockNoteEditor } from "@blocknote/core";
import { FilePanelExtension, SuggestionMenu } from "@blocknote/core/extensions";
import {
  FilePanelController,
  FormattingToolbarController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { EditorHeader, type SaveState } from "@/components/editor/editor-header";
import { GenesisFilePanel } from "@/components/editor/file-panel";
import { GenesisFormattingToolbar } from "@/components/editor/formatting-toolbar";
import { LinkDialog } from "@/components/editor/link-dialog";
import { MobileBlockToolbar } from "@/components/editor/mobile-block-toolbar";
import { UploadContext, type UploadContextValue } from "@/components/editor/upload-context";
import { clearDocument, loadDocument, saveDocument } from "@/lib/storage";
import { starterDocument } from "@/lib/starter-document";
import { UploadStatusStore } from "@/lib/upload-status";
import { getUploadMode, uploadWithConfig, type UploadConfig } from "@/lib/uploads";

const AUTOSAVE_DELAY_MS = 400;

/**
 * Empty file blocks swap in a "Loading..." placeholder when an upload starts and
 * only re-render when their props change, which normally happens when the URL
 * arrives. After a failed upload nothing changes, so nudge the `name` prop to
 * bring back the "Add image" button. No-op changes are skipped, hence two steps.
 */
function rerenderEmptyFileBlock(editor: BlockNoteEditor, blockId: string, name: string) {
  const setName = (value: string) =>
    editor.transact((tr) => {
      tr.setMeta("addToHistory", false);
      editor.updateBlock(blockId, { props: { name: value } });
    });
  const block = editor.getBlock(blockId);
  if (!block || !("url" in block.props) || block.props.url) return;
  if (block.props.name === name) setName("");
  setName(name);
}

export type BlockEditorProps = UploadConfig & {
  /** Extra items for the header's document menu. */
  headerMenuItems?: ReactNode;
  /** Shown as a "Configure uploads" link while no upload destination is set. */
  onConfigureUploads?: () => void;
};

export default function BlockEditor({
  uploadFile,
  uploadUrl,
  mapUploadResponse,
  headerMenuItems,
  onConfigureUploads,
}: BlockEditorProps) {
  const stored = useMemo(() => loadDocument(), []);
  const [uploadStatuses] = useState(() => new UploadStatusStore());
  // BlockNote captures `uploadFile` once at creation, so it reads the latest config through a ref.
  const uploadConfig = useRef<UploadConfig>({});
  useLayoutEffect(() => {
    uploadConfig.current = { uploadFile, uploadUrl, mapUploadResponse };
  }, [uploadFile, uploadUrl, mapUploadResponse]);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const retryRef = useRef<(blockId: string) => void>(() => {});

  const editor = useCreateBlockNote({
    initialContent: stored?.blocks ?? starterDocument,
    // Never rejects: paste/drop uploads would surface as unhandled rejections, so
    // failures are recorded per block and shown in that block's file panel instead.
    uploadFile: async (file, blockId) => {
      if (blockId) uploadStatuses.set(blockId, { state: "uploading", file });
      try {
        const url = await uploadWithConfig(uploadConfig.current, file);
        if (blockId) {
          uploadStatuses.delete(blockId);
          toast.dismiss(`upload-${blockId}`);
        }
        return url;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed.";
        if (!blockId) throw error;
        uploadStatuses.set(blockId, { state: "error", file, message });
        const current = editorRef.current;
        if (current?.getBlock(blockId)) {
          rerenderEmptyFileBlock(current, blockId, file.name);
          current.getExtension(FilePanelExtension)?.showMenu(blockId);
        }
        toast.error(`Couldn't upload ${file.name}`, {
          id: `upload-${blockId}`,
          description: message,
          action: { label: "Retry", onClick: () => retryRef.current(blockId) },
        });
        return {};
      }
    },
  });
  const { resolvedTheme } = useTheme();

  const uploadToBlock = useCallback(
    async (file: File, blockId: string) => {
      const result = await editor.uploadFile?.(file, blockId);
      if (typeof result !== "string" || !editor.getBlock(blockId)) return;
      editor.updateBlock(blockId, { props: { name: file.name, url: result } });
      editor.getExtension(FilePanelExtension)?.closeMenu();
    },
    [editor],
  );

  const retryUpload = useCallback(
    async (blockId: string) => {
      const status = uploadStatuses.get(blockId);
      if (status) await uploadToBlock(status.file, blockId);
    },
    [uploadStatuses, uploadToBlock],
  );

  useEffect(() => {
    editorRef.current = editor;
    retryRef.current = (blockId) => void retryUpload(blockId);
  }, [editor, retryUpload]);

  const uploadContext = useMemo<UploadContextValue>(
    () => ({
      mode: getUploadMode({ uploadFile, uploadUrl }),
      statuses: uploadStatuses,
      uploadToBlock,
      retryUpload,
      onConfigureUploads,
    }),
    [uploadFile, uploadUrl, uploadStatuses, uploadToBlock, retryUpload, onConfigureUploads],
  );

  const [saveState, setSaveState] = useState<SaveState>(
    stored ? { status: "saved", savedAt: stored.savedAt } : { status: "idle" },
  );
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkInitialUrl, setLinkInitialUrl] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      const savedAt = saveDocument(editor.document);
      setSaveState({ status: "saved", savedAt });
    } catch {
      setSaveState({ status: "error" });
    }
  }, [editor]);

  const scheduleSave = useCallback(() => {
    setSaveState({ status: "saving" });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, AUTOSAVE_DELAY_MS);
  }, [flushSave]);

  useEffect(() => {
    const flushIfPending = () => {
      if (saveTimer.current) flushSave();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushIfPending();
    };
    window.addEventListener("beforeunload", flushIfPending);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushIfPending);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushIfPending();
    };
  }, [flushSave]);

  const openLinkDialog = useCallback(() => {
    setLinkInitialUrl(editor.getSelectedLinkUrl() ?? "");
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback(
    (url: string) => {
      setLinkDialogOpen(false);
      editor.focus();
      if (editor.getSelectedText()) {
        editor.createLink(url);
      } else {
        editor.createLink(url, url);
      }
    },
    [editor],
  );

  // BlockNote has no link shortcut; its toolbar link button needs a selection.
  const handleKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        openLinkDialog();
      }
    },
    [openLinkDialog],
  );

  const openSlashMenu = useCallback(() => {
    editor.focus();
    editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/");
  }, [editor]);

  const copyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        editor.blocksToMarkdownLossy(editor.document),
      );
      toast.success("Copied document as Markdown");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }, [editor]);

  const resetDocument = useCallback(() => {
    if (!window.confirm("Replace this document with the starter content?")) return;
    clearDocument();
    editor.replaceBlocks(editor.document, starterDocument);
    flushSave();
    toast.success("Document reset");
  }, [editor, flushSave]);

  return (
    <UploadContext.Provider value={uploadContext}>
      <div className="flex min-h-dvh flex-col">
        <EditorHeader
          saveState={saveState}
          onCopyMarkdown={copyMarkdown}
          onReset={resetDocument}
          menuItems={headerMenuItems}
        />
        <main className="flex flex-1 justify-center px-0 pb-28 pt-6 sm:px-6 sm:pb-16 sm:pt-12">
          <div
            className="genesis-editor w-full max-w-3xl"
            onKeyDownCapture={handleKeyDownCapture}
          >
            <BlockNoteView
              editor={editor}
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              onChange={scheduleSave}
              formattingToolbar={false}
              filePanel={false}
            >
              <FormattingToolbarController
                formattingToolbar={GenesisFormattingToolbar}
              />
              <FilePanelController filePanel={GenesisFilePanel} />
            </BlockNoteView>
          </div>
        </main>
        <MobileBlockToolbar
          editor={editor}
          onAddBlock={openSlashMenu}
          onLink={openLinkDialog}
        />
        <LinkDialog
          open={linkDialogOpen}
          initialUrl={linkInitialUrl}
          onOpenChange={(open) => {
            setLinkDialogOpen(open);
            if (!open) editor.focus();
          }}
          onSubmit={applyLink}
        />
      </div>
    </UploadContext.Provider>
  );
}
